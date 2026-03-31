"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { fetchJsonWithTimeout } from "@/lib/net/fetchWithTimeout";

import {
  type ApprovedProposalWithRole,
  type ApprovedTripleStatus,
  type ApprovedTripleStatusState,
  type DerivedTripleDraft,
  type DraftPost,
  type NestedProposalDraft,
} from "../extraction";
import type { MainRef } from "../extraction/mainRef";

export type DuplicateInfo = {
  postId: string;
  postBody: string;
  createdAt: string;
  replyCount: number;
  authorDisplayName: string | null;
  authorAddress: string;
  authorAvatar: string | null;
  isBlocking: boolean;
  matchType: "exact";
  parentPostBody?: string | null;
};

type CheckTriple = {
  key: string;
  tripleTermId?: string;
  sLabel: string;
  pLabel: string;
  oLabel: string;
  draftId: string;
  isMainOfDraft: boolean;
};

type MatchResponse = {
  matches: {
    key: string;
    matchType: "exact";
    role: "MAIN" | "SUPPORTING";
    post: {
      id: string;
      body: string;
      createdAt: string;
      replyCount: number;
      parentPostId: string | null;
      authorDisplayName: string | null;
      authorAddress: string;
      authorAvatar: string | null;
      parentPostBody?: string | null;
    };
  }[];
};

export function useDuplicateCheck({
  draftPosts,
  mainRefByDraft,
  proposals,
  approvedTripleStatuses,
  approvedTripleStatus,
  nestedTripleStatuses,
  nestedEdgesByDraft,
  nestedRefLabels,
  derivedTriples,
  derivedCanonicalLabels,
  parentPostId,
}: {
  draftPosts: DraftPost[];
  mainRefByDraft: Map<string, MainRef | null>;
  proposals: ApprovedProposalWithRole[];
  approvedTripleStatuses: ApprovedTripleStatus[];
  approvedTripleStatus: ApprovedTripleStatusState;
  nestedTripleStatuses: Map<string, string>;
  nestedEdgesByDraft: Map<string, NestedProposalDraft[]>;
  nestedRefLabels: Map<string, string>;
  derivedTriples: DerivedTripleDraft[];
  derivedCanonicalLabels?: Map<string, { s?: string; p?: string; o?: string }>;
  parentPostId: string | null;
}): {
  duplicatesByDraft: Map<string, DuplicateInfo[]>;
  blockedDraftIds: Set<string>;
} {
  const [duplicatesByDraft, setDuplicatesByDraft] = useState<Map<string, DuplicateInfo[]>>(new Map());
  const requestIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (approvedTripleStatus !== "ready") {
      abortRef.current?.abort();
      setDuplicatesByDraft(new Map());
      return;
    }

    const triples: CheckTriple[] = [];
    const seen = new Set<string>();

    for (const draft of draftPosts) {
      const mainRef = mainRefByDraft.get(draft.id);
      if (!mainRef || mainRef.type === "error") continue;

      // 1. All approved proposals belonging to this draft
      for (const pid of draft.proposalIds) {
        const proposal = proposals.find((p) => p.id === pid);
        if (!proposal || !proposal.sText || !proposal.pText || !proposal.oText) continue;

        const dedupKey = `${proposal.stableKey}:${draft.id}`;
        if (seen.has(dedupKey)) continue;
        seen.add(dedupKey);

        const status = approvedTripleStatuses.find((s) => s.proposalId === proposal.id);
        const isMain = mainRef.type === "proposal" && proposal.id === mainRef.id;

        triples.push({
          key: proposal.stableKey,
          tripleTermId: status?.tripleTermId ?? undefined,
          sLabel: proposal.subjectMatchedLabel ?? proposal.sText,
          pLabel: proposal.predicateMatchedLabel ?? proposal.pText,
          oLabel: proposal.objectMatchedLabel ?? proposal.oText,
          draftId: draft.id,
          isMainOfDraft: isMain,
        });
      }

      // 2. All nested edges assigned to this draft
      const draftEdges = nestedEdgesByDraft.get(draft.id) ?? [];
      for (const edge of draftEdges) {
        const dedupKey = `${edge.stableKey}:${draft.id}`;
        if (seen.has(dedupKey)) continue;
        seen.add(dedupKey);

        const isMain = mainRef.type === "nested" && edge.stableKey === mainRef.nestedStableKey;
        let termId = nestedTripleStatuses.get(edge.stableKey);
        // Fallback: for nested MAIN, the root termId lives on the main proposal's status
        if (!termId && isMain) {
          const mainStatus = approvedTripleStatuses.find((s) => s.proposalId === draft.mainProposalId);
          if (mainStatus?.tripleTermId) termId = mainStatus.tripleTermId;
        }

        const resolveRef = (ref: typeof edge.subject): string =>
          ref.type === "atom" ? ref.label : (nestedRefLabels.get(ref.tripleKey) ?? ref.label ?? "");

        const sLabel = resolveRef(edge.subject);
        const pLabel = edge.predicate;
        const oLabel = resolveRef(edge.object);

        if (!sLabel || !pLabel || !oLabel) continue;

        triples.push({
          key: edge.stableKey,
          tripleTermId: termId ?? undefined,
          sLabel, pLabel, oLabel,
          draftId: draft.id,
          isMainOfDraft: isMain,
        });
      }

      // 3. Derived triples (sub-triples of nested edges)
      for (const dt of derivedTriples) {
        const ownsIt = draft.proposalIds
          .map((pid) => proposals.find((p) => p.id === pid))
          .some((p) => p?.groupKey === dt.ownerGroupKey);
        if (!ownsIt) continue;

        const dedupKey = `${dt.stableKey}:${draft.id}`;
        if (seen.has(dedupKey)) continue;
        seen.add(dedupKey);

        const termId = nestedTripleStatuses.get(dt.stableKey);

        const c = derivedCanonicalLabels?.get(dt.stableKey);
        triples.push({
          key: dt.stableKey,
          tripleTermId: termId ?? undefined,
          sLabel: c?.s ?? dt.subject,
          pLabel: c?.p ?? dt.predicate,
          oLabel: c?.o ?? dt.object,
          draftId: draft.id,
          isMainOfDraft: false,
        });
      }
    }

    if (triples.length === 0) {
      setDuplicatesByDraft(new Map());
      return;
    }

    // Debounce: deps change 6-7 times during resolution phases
    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(() => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const reqId = ++requestIdRef.current;

      const keyToTriple = new Map<string, CheckTriple>();
      for (const t of triples) keyToTriple.set(t.key, t);

      (async () => {
        try {
          const data = await fetchJsonWithTimeout<MatchResponse>(
            "/api/posts/check-duplicates",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ triples, parentPostId }),
              signal: controller.signal,
            },
          );

          if (reqId !== requestIdRef.current) return;

          const map = new Map<string, DuplicateInfo[]>();
          for (const match of data.matches) {
            const triple = keyToTriple.get(match.key);
            if (!triple) continue;

            const sameContext = parentPostId != null
              ? match.post.parentPostId === parentPostId
              : match.post.parentPostId === null;

            const info: DuplicateInfo = {
              postId: match.post.id,
              postBody: match.post.body,
              createdAt: match.post.createdAt,
              replyCount: match.post.replyCount,
              authorDisplayName: match.post.authorDisplayName,
              authorAddress: match.post.authorAddress,
              authorAvatar: match.post.authorAvatar ?? null,
              isBlocking: triple.isMainOfDraft && match.role === "MAIN" && sameContext,
              matchType: match.matchType,
              parentPostBody: match.post.parentPostBody ?? null,
            };

            const existing = map.get(triple.draftId) ?? [];
            const idx = existing.findIndex((d) => d.postId === info.postId);
            if (idx === -1) {
              existing.push(info);
            } else if (info.isBlocking && !existing[idx].isBlocking) {
              existing[idx] = info;
            }
            map.set(triple.draftId, existing);
          }

          setDuplicatesByDraft(map);
        } catch {
          // Aborted or network error
        }
      })();
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      abortRef.current?.abort();
    };
  }, [
    approvedTripleStatus,
    draftPosts,
    mainRefByDraft,
    proposals,
    approvedTripleStatuses,
    nestedTripleStatuses,
    nestedEdgesByDraft,
    nestedRefLabels,
    derivedTriples,
    derivedCanonicalLabels,
    parentPostId,
  ]);

  const blockedDraftIds = useMemo(() => {
    const set = new Set<string>();
    for (const [draftId, dups] of duplicatesByDraft) {
      if (dups.some((d) => d.isBlocking)) set.add(draftId);
    }
    return set;
  }, [duplicatesByDraft]);

  return { duplicatesByDraft, blockedDraftIds };
}
