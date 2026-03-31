"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";

import { normalizeLabelForChain } from "@/lib/format/normalizeLabel";
import { makeTripleKey } from "@/lib/format/makeTripleKey";
import { makeLabelKey } from "@/lib/format/makeLabelKey";
import { fetchJsonWithTimeout, FetchError } from "@/lib/net/fetchWithTimeout";
import { HAS_TAG_ATOM_ID } from "@/lib/intuition/protocolAtoms";
import { scoreTripleMatch, pickBestTripleMatch, type TripleCandidate } from "./scoreTripleMatch";
import {
  type ApprovedProposalWithRole,
  type ApprovedTripleStatus,
  type ApprovedTripleStatusState,
  type DerivedTripleDraft,
  type DraftPost,
  type MatchedTree,
  type NestedProposalDraft,
  type ResolutionMap,
} from "../extraction";
import { buildExtractedTree } from "../extraction/treeBuild";
import { treeLeavesMatch, findSubTreeMatch } from "./matchTree";

const TIMEOUT_ATOMS = 12_000;
const TIMEOUT_TRIPLES = 10_000;
const TIMEOUT_LABEL = 8_000;
const TIMEOUT_SEMANTIC = 8_000;
const TIMEOUT_TREE_SEARCH = 15_000;
const SEMANTIC_SKIP_THRESHOLD = 5;

const normalizeText = normalizeLabelForChain;

type ApprovedResolutionState = {
  statuses: ApprovedTripleStatus[];
  status: ApprovedTripleStatusState;
  error: string | null;
};

type ApprovedResolutionAction =
  | { type: "RESET" }
  | { type: "CHECKING" }
  | { type: "READY"; statuses: ApprovedTripleStatus[] }
  | { type: "ERROR"; error: string };

const INITIAL_APPROVED: ApprovedResolutionState = {
  statuses: [],
  status: "idle",
  error: null,
};

function approvedResolutionReducer(
  state: ApprovedResolutionState,
  action: ApprovedResolutionAction,
): ApprovedResolutionState {
  switch (action.type) {
    case "RESET":
      return INITIAL_APPROVED;
    case "CHECKING":
      return { ...state, status: "checking", error: null };
    case "READY":
      return { statuses: action.statuses, status: "ready", error: null };
    case "ERROR":
      return { ...state, status: "error", error: action.error };
  }
}

type TripleMatchAtoms = {
  subjectAtomId: string;
  predicateAtomId: string;
  objectAtomId: string;
  sLabel: string;
  pLabel: string;
  oLabel: string;
};

type UseTripleResolutionParams = {
  approvedProposals: ApprovedProposalWithRole[];
  address: `0x${string}` | undefined;
  /** Extra atom labels to resolve (e.g. from nested edges / derived triples). */
  extraAtomLabels?: string[];
  /** Nested proposals to check for existing on-chain triples. */
  nestedProposals?: NestedProposalDraft[];
  /** Derived triples from nested structures (sub-claims). */
  derivedTriples?: DerivedTripleDraft[];
  /** Draft posts — needed for Phase 5 full-tree search. */
  draftPosts?: DraftPost[];
  /** Theme tags to check for existing metadata triples. */
  themes?: { slug: string; name: string }[];
  onTripleMatched?: (proposalId: string, tripleTermId: string, atoms?: TripleMatchAtoms) => void;
  onAtomResolved?: (proposalId: string, field: "sText" | "pText" | "oText", termId: string, canonicalLabel: string) => void;
  /** Called when Phase 5 finds an on-chain tree matching an extracted draft. */
  onTreeMatchRewrite?: (draftId: string, tree: MatchedTree, termId: string) => void;
};

type UseTripleResolutionReturn = {
  minDeposit: bigint | null;
  atomCost: bigint | null;
  tripleCost: bigint | null;
  approvedTripleStatuses: ApprovedTripleStatus[];
  approvedTripleStatus: ApprovedTripleStatusState;
  approvedTripleStatusError: string | null;
  semanticSkipped: boolean;
  /** Resolved atom labels → termId (normalized label key). */
  resolvedAtomMap: Map<string, string>;
  /** Nested edge stableKey → tripleTermId for existing nested triples. */
  nestedTripleStatuses: Map<string, string>;
  /** Canonical labels for derived triples (from atom resolution). */
  derivedCanonicalLabels: Map<string, { s?: string; p?: string; o?: string }>;
  /** Input label → canonical on-chain label. */
  resolvedAtomLabels: Map<string, string>;
  /** DraftId → matched on-chain tree (from Phase 5 full-tree search). */
  fullTreeMatchByDraft: Map<string, { termId: string; tree: MatchedTree }>;
  /** Metadata key → tripleTermId for existing tag/stance triples. Keys: "tag-{draftId}-{slug}" or "stance-{draftId}". */
  metadataTripleStatuses: Map<string, string>;
  /** Aggregated resolution data for publish (single source of truth). */
  resolutionMap: ResolutionMap;
  /** Reset the rewrite guard so modified drafts can be re-matched. */
  clearRewriteGuard: () => void;
  /** Re-trigger the verification check (e.g. after timeout). */
  retryCheck: () => void;
};

type ResolveAtomsResponse = {
  atoms: Array<{ inputLabel: string; termId: string; canonicalLabel: string }>;
};

type ResolveTriplesResponse = {
  byKey: Record<string, string | null>;
};

type TripleMatchInfoResponse = {
  tripleTermId: string;
  subjectAtomId: string;
  predicateAtomId: string;
  objectAtomId: string;
  sLabel: string;
  pLabel: string;
  oLabel: string;
};

type ResolveTriplesByLabelResponse = {
  byLabelKey: Record<string, TripleMatchInfoResponse | null>;
};

type ResolutionSignal = {
  active: boolean;
  requestId: number;
  ref: React.MutableRefObject<number>;
};

function checkActive(s: ResolutionSignal): boolean {
  return s.active && s.requestId === s.ref.current;
}

type LabelEntry = {
  proposalId: string;
  sLabel: string;
  pLabel: string;
  oLabel: string;
  subjectAtomId: string | null;
  predicateAtomId: string | null;
  objectAtomId: string | null;
  matchedIntuitionTripleTermId: string | null;
};

type AtomResult = {
  atomMap: Map<string, string>;
  canonicalLabelMap: Map<string, string>;
  canonicalByIdMap: Map<string, string>;
  pendingAtomUpdates: Array<{ proposalId: string; field: "sText" | "pText" | "oText"; termId: string; canonicalLabel: string }>;
};

type FlatResult = {
  nextStatuses: ApprovedTripleStatus[];
  semanticSkipped: boolean;
};

type DerivedResult = {
  resolvedStableKeys: Set<string>;
  nestedStatuses: Map<string, string>;
  resolvedTripleMap: Map<string, string>;
};

type TreeResult = {
  fullTreeMatchMap: Map<string, { termId: string; tree: MatchedTree }>;
  rewriteTriggered: boolean;
};

async function resolveAtomLabels(params: {
  missingLabels: Set<string>;
  lockedAtomIds: Set<string>;
  labelsByProposal: LabelEntry[];
  approvedProposals: ApprovedProposalWithRole[];
  signal: ResolutionSignal;
}): Promise<AtomResult> {
  const { missingLabels, lockedAtomIds, labelsByProposal, approvedProposals, signal } = params;

  const atomMap = new Map<string, string>();
  const canonicalLabelMap = new Map<string, string>();
  const canonicalByIdMap = new Map<string, string>();
  const pendingAtomUpdates: AtomResult["pendingAtomUpdates"] = [];

  if (missingLabels.size === 0 && lockedAtomIds.size === 0) {
    return { atomMap, canonicalLabelMap, canonicalByIdMap, pendingAtomUpdates };
  }

  const atomData = await fetchJsonWithTimeout<
    ResolveAtomsResponse & { atomsById?: Array<{ termId: string; canonicalLabel: string }> }
  >(
    "/api/intuition/resolve-atoms",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        labels: Array.from(missingLabels),
        atomIds: Array.from(lockedAtomIds),
      }),
    },
    TIMEOUT_ATOMS,
  );

  for (const atom of atomData.atoms) {
    atomMap.set(atom.inputLabel, atom.termId);
    if (atom.canonicalLabel) {
      canonicalLabelMap.set(atom.inputLabel, atom.canonicalLabel);
    }
  }

  for (const a of atomData.atomsById ?? []) {
    if (a.canonicalLabel) canonicalByIdMap.set(a.termId, a.canonicalLabel);
  }

  if (!checkActive(signal)) return { atomMap, canonicalLabelMap, canonicalByIdMap, pendingAtomUpdates };

  const FIELD_KEYS = [
    { field: "sText" as const, labelKey: "sLabel" as const, atomIdKey: "subjectAtomId" as const, matchedKey: "subjectMatchedLabel" as const },
    { field: "pText" as const, labelKey: "pLabel" as const, atomIdKey: "predicateAtomId" as const, matchedKey: "predicateMatchedLabel" as const },
    { field: "oText" as const, labelKey: "oLabel" as const, atomIdKey: "objectAtomId" as const, matchedKey: "objectMatchedLabel" as const },
  ];
  for (const entry of labelsByProposal) {
    // L0 proposals: atoms come from the matched triple, skip independent resolution
    if (entry.matchedIntuitionTripleTermId) continue;
    const proposal = approvedProposals.find((p) => p.id === entry.proposalId);
    if (!proposal) continue;
    for (const fk of FIELD_KEYS) {
      const currentId = proposal[fk.atomIdKey];
      if (currentId) {
        const canonical = canonicalByIdMap.get(currentId);
        if (!canonical) continue;
        const currentLabel = proposal[fk.matchedKey];
        if (currentLabel === canonical) continue;
        pendingAtomUpdates.push({ proposalId: entry.proposalId, field: fk.field, termId: currentId, canonicalLabel: canonical });
      } else {
        const label = entry[fk.labelKey];
        const resolvedId = atomMap.get(label);
        const resolvedLabel = canonicalLabelMap.get(label);
        if (!resolvedId || !resolvedLabel) continue;
        const currentLabel = proposal[fk.matchedKey];
        if (currentId === resolvedId && currentLabel === resolvedLabel) continue;
        pendingAtomUpdates.push({ proposalId: entry.proposalId, field: fk.field, termId: resolvedId, canonicalLabel: resolvedLabel });
      }
    }
  }

  return { atomMap, canonicalLabelMap, canonicalByIdMap, pendingAtomUpdates };
}

async function resolveFlatTriples(params: {
  atomMap: Map<string, string>;
  labelsByProposal: LabelEntry[];
  address: `0x${string}`;
  onTripleMatchedRef: React.MutableRefObject<UseTripleResolutionParams["onTripleMatched"]>;
  signal: ResolutionSignal;
}): Promise<FlatResult> {
  const { atomMap, labelsByProposal, address, onTripleMatchedRef, signal } = params;
  let semanticSkipped = false;

  const tripleEntries: Array<{
    proposalId: string;
    key: string;
    subjectAtomId: string;
    predicateAtomId: string;
    objectAtomId: string;
  }> = [];

  // L0: proposals with matchedIntuitionTripleTermId — fetch their actual S/P/O from on-chain
  const l0Entries = labelsByProposal.filter((e) => e.matchedIntuitionTripleTermId);
  const l0TripleIds = [...new Set(l0Entries.map((e) => e.matchedIntuitionTripleTermId!))];

  let l0Details: Record<string, { sId: string; pId: string; oId: string; sLabel: string; pLabel: string; oLabel: string }> = {};
  if (l0TripleIds.length > 0) {
    try {
      const data = await fetchJsonWithTimeout<ResolveTriplesResponse & {
        byTripleId?: Record<string, { sId: string; pId: string; oId: string; sLabel: string; pLabel: string; oLabel: string }>;
      }>(
        "/api/intuition/resolve-triples",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tripleIds: l0TripleIds }),
        },
        TIMEOUT_TRIPLES,
      );
      l0Details = data.byTripleId ?? {};
    } catch { /* fall through — L0 still marks existing, just without atom correction */ }

    for (const entry of l0Entries) {
      const detail = l0Details[entry.matchedIntuitionTripleTermId!];
      if (!detail) continue;
      // Only update if atoms differ — prevents infinite re-render loop
      if (entry.subjectAtomId === detail.sId && entry.predicateAtomId === detail.pId && entry.objectAtomId === detail.oId) continue;
      onTripleMatchedRef.current?.(entry.proposalId, entry.matchedIntuitionTripleTermId!, {
        subjectAtomId: detail.sId,
        predicateAtomId: detail.pId,
        objectAtomId: detail.oId,
        sLabel: detail.sLabel,
        pLabel: detail.pLabel,
        oLabel: detail.oLabel,
      });
    }
  }

  if (!checkActive(signal)) return { nextStatuses: [], semanticSkipped };

  const nextStatuses: ApprovedTripleStatus[] = labelsByProposal.map((entry) => {
    if (entry.matchedIntuitionTripleTermId) {
      return { proposalId: entry.proposalId, tripleTermId: entry.matchedIntuitionTripleTermId, isExisting: true };
    }

    const subjectAtomId = entry.subjectAtomId ?? atomMap.get(entry.sLabel) ?? null;
    const predicateAtomId = entry.predicateAtomId ?? atomMap.get(entry.pLabel) ?? null;
    const objectAtomId = entry.objectAtomId ?? atomMap.get(entry.oLabel) ?? null;

    if (!subjectAtomId || !predicateAtomId || !objectAtomId) {
      return { proposalId: entry.proposalId, tripleTermId: null, isExisting: false };
    }

    const key = makeTripleKey(subjectAtomId, predicateAtomId, objectAtomId);
    tripleEntries.push({ proposalId: entry.proposalId, key, subjectAtomId, predicateAtomId, objectAtomId });
    return { proposalId: entry.proposalId, tripleTermId: null, isExisting: false };
  });

  if (tripleEntries.length > 0) {
    const tripleData = await fetchJsonWithTimeout<ResolveTriplesResponse>(
      "/api/intuition/resolve-triples",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address,
          combinations: tripleEntries.map((entry) => [entry.subjectAtomId, entry.predicateAtomId, entry.objectAtomId]),
        }),
      },
      TIMEOUT_TRIPLES,
    );
    for (const entry of tripleEntries) {
      const tripleId = tripleData.byKey[entry.key] ?? null;
      if (tripleId) {
        const status = nextStatuses.find((item) => item.proposalId === entry.proposalId);
        if (status) { status.tripleTermId = tripleId; status.isExisting = true; }
      }
    }
  }

  if (!checkActive(signal)) return { nextStatuses, semanticSkipped };

  const unresolvedForLabel = labelsByProposal.filter((entry) => {
    const status = nextStatuses.find((s) => s.proposalId === entry.proposalId);
    return status && !status.isExisting;
  });

  if (unresolvedForLabel.length > 0) {
    try {
      const labelData = await fetchJsonWithTimeout<ResolveTriplesByLabelResponse>(
        "/api/intuition/resolve-triples-by-label",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            labels: unresolvedForLabel.map((e) => ({ s: e.sLabel, p: e.pLabel, o: e.oLabel })),
          }),
        },
        TIMEOUT_LABEL,
      );

      if (!checkActive(signal)) return { nextStatuses, semanticSkipped };

      for (const entry of unresolvedForLabel) {
        const key = makeLabelKey(entry.sLabel, entry.pLabel, entry.oLabel);
        const matchInfo = labelData.byLabelKey[key];
        if (matchInfo) {
          const status = nextStatuses.find((s) => s.proposalId === entry.proposalId);
          if (status) { status.tripleTermId = matchInfo.tripleTermId; status.isExisting = true; }
          onTripleMatchedRef.current?.(entry.proposalId, matchInfo.tripleTermId, {
            subjectAtomId: matchInfo.subjectAtomId,
            predicateAtomId: matchInfo.predicateAtomId,
            objectAtomId: matchInfo.objectAtomId,
            sLabel: matchInfo.sLabel,
            pLabel: matchInfo.pLabel,
            oLabel: matchInfo.oLabel,
          });
        }
      }
    } catch {
      // fall through to semantic
    }
  }

  if (!checkActive(signal)) return { nextStatuses, semanticSkipped };

  const stillUnresolved = labelsByProposal.filter((entry) => {
    const status = nextStatuses.find((s) => s.proposalId === entry.proposalId);
    return status && !status.isExisting;
  });

  if (stillUnresolved.length > 0) {
    if (stillUnresolved.length > SEMANTIC_SKIP_THRESHOLD) {
      semanticSkipped = true;
    } else {
      try {
        for (const entry of stillUnresolved) {
          const query = `${entry.sLabel} ${entry.pLabel} ${entry.oLabel}`;
          const searchData = await fetchJsonWithTimeout<{
            triples: Array<TripleCandidate & {
              subjectId?: string | null;
              predicateId?: string | null;
              objectId?: string | null;
            }>;
          }>("/api/intuition/search", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ query, limit: 15, kind: "triple", sLabel: entry.sLabel, pLabel: entry.pLabel, oLabel: entry.oLabel }),
          }, TIMEOUT_SEMANTIC);

          if (!checkActive(signal)) return { nextStatuses, semanticSkipped };

          const results = (searchData.triples ?? []).map((sugg) =>
            scoreTripleMatch(entry.sLabel, entry.pLabel, entry.oLabel, sugg),
          );
          const best = pickBestTripleMatch(results);
          if (best) {
            const status = nextStatuses.find((s) => s.proposalId === entry.proposalId);
            if (status) { status.tripleTermId = best.termId; status.isExisting = true; }
            const matched = searchData.triples.find((t) => t.id === best.termId);
            const atoms = matched?.subjectId && matched?.predicateId && matched?.objectId
              ? { subjectAtomId: matched.subjectId, predicateAtomId: matched.predicateId, objectAtomId: matched.objectId, sLabel: matched.subject, pLabel: matched.predicate, oLabel: matched.object }
              : undefined;
            onTripleMatchedRef.current?.(entry.proposalId, best.termId, atoms);
          }
        }
      } catch {
        // fail open
      }
    }
  }

  return { nextStatuses, semanticSkipped };
}

async function resolveDerivedChain(params: {
  derivedTriples: DerivedTripleDraft[] | undefined;
  lowerAtomMap: Map<string, string>;
  address: `0x${string}`;
  signal: ResolutionSignal;
}): Promise<DerivedResult> {
  const { derivedTriples, lowerAtomMap, address, signal } = params;
  const resolvedStableKeys = new Set<string>();
  const nestedStatuses = new Map<string, string>();
  const resolvedTripleMap = new Map<string, string>();

  if (!derivedTriples?.length) return { resolvedStableKeys, nestedStatuses, resolvedTripleMap };

  if (checkActive(signal)) {
    const derivedEntries: Array<{ stableKey: string; key: string; sId: string; pId: string; oId: string }> = [];
    for (const dt of derivedTriples) {
      const sId = lowerAtomMap.get(normalizeText(dt.subject).toLowerCase());
      const pId = lowerAtomMap.get(normalizeText(dt.predicate).toLowerCase());
      const oId = lowerAtomMap.get(normalizeText(dt.object).toLowerCase());
      if (sId && pId && oId) {
        derivedEntries.push({ stableKey: dt.stableKey, key: makeTripleKey(sId, pId, oId), sId, pId, oId });
      }
    }
    if (derivedEntries.length > 0) {
      try {
        const tripleData = await fetchJsonWithTimeout<ResolveTriplesResponse>(
          "/api/intuition/resolve-triples",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ address, combinations: derivedEntries.map((e) => [e.sId, e.pId, e.oId]) }),
          },
          TIMEOUT_TRIPLES,
        );
        for (const entry of derivedEntries) {
          const tripleId = tripleData.byKey[entry.key] ?? null;
          if (tripleId) {
            nestedStatuses.set(entry.stableKey, tripleId);
            resolvedTripleMap.set(entry.stableKey, tripleId);
            resolvedStableKeys.add(entry.stableKey);
          }
        }
      } catch { /* not blocking */ }
    }
  }

  if (checkActive(signal)) {
    const unresolvedDerived = derivedTriples.filter((dt) => !resolvedStableKeys.has(dt.stableKey));
    if (unresolvedDerived.length > 0) {
      try {
        const labelData = await fetchJsonWithTimeout<ResolveTriplesByLabelResponse>(
          "/api/intuition/resolve-triples-by-label",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              labels: unresolvedDerived.map((dt) => ({
                s: normalizeText(dt.subject), p: normalizeText(dt.predicate), o: normalizeText(dt.object),
              })),
            }),
          },
          TIMEOUT_LABEL,
        );
        if (checkActive(signal)) {
          for (const dt of unresolvedDerived) {
            const key = makeLabelKey(normalizeText(dt.subject), normalizeText(dt.predicate), normalizeText(dt.object));
            const matchInfo = labelData.byLabelKey[key];
            if (matchInfo) {
              nestedStatuses.set(dt.stableKey, matchInfo.tripleTermId);
              resolvedTripleMap.set(dt.stableKey, matchInfo.tripleTermId);
              resolvedStableKeys.add(dt.stableKey);
            }
          }
        }
      } catch { /* not blocking */ }
    }
  }

  return { resolvedStableKeys, nestedStatuses, resolvedTripleMap };
}

async function resolveThemeAtoms(params: {
  themes: { slug: string; name: string }[] | undefined;
  fullAtomMap: Map<string, string>;
  signal: ResolutionSignal;
}): Promise<{ themeAtomMap: Map<string, string> }> {
  const { themes, fullAtomMap, signal } = params;
  const themeAtomMap = new Map<string, string>();
  if (!themes?.length || !checkActive(signal)) return { themeAtomMap };

  try {
    const themeData = await fetchJsonWithTimeout<{
      themes: Array<{ slug: string; name: string; atomTermId: string | null }>;
    }>(
      "/api/themes/resolve",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slugs: themes.map((t) => t.slug) }),
      },
      TIMEOUT_ATOMS,
    );
    for (const t of themeData.themes) {
      if (t.atomTermId) themeAtomMap.set(t.slug, t.atomTermId);
    }
  } catch {
    for (const theme of themes) {
      const fallbackId = fullAtomMap.get(normalizeText(theme.slug));
      if (fallbackId) themeAtomMap.set(theme.slug, fallbackId);
    }
  }

  return { themeAtomMap };
}

async function resolveNestedPasses(params: {
  nestedProposals: NestedProposalDraft[] | undefined;
  lowerAtomMap: Map<string, string>;
  address: `0x${string}`;
  resolvedTripleMap: Map<string, string>;
  resolvedStableKeys: Set<string>;
  nestedStatuses: Map<string, string>;
  signal: ResolutionSignal;
}): Promise<{ nestedStatuses: Map<string, string>; resolvedTripleMap: Map<string, string> }> {
  const { nestedProposals, lowerAtomMap, address, resolvedTripleMap, resolvedStableKeys, nestedStatuses, signal } = params;
  if (!nestedProposals?.length) return { nestedStatuses, resolvedTripleMap };

  const MAX_NESTED_PASSES = 5;
  for (let pass = 0; pass < MAX_NESTED_PASSES; pass++) {
    if (!checkActive(signal)) break;

    const nestedEntries: Array<{ stableKey: string; key: string; sId: string; pId: string; oId: string }> = [];
    for (const edge of nestedProposals) {
      if (resolvedStableKeys.has(edge.stableKey)) continue;
      const sId = edge.subject.type === "atom"
        ? lowerAtomMap.get(normalizeText(edge.subject.label).toLowerCase())
        : resolvedTripleMap.get(edge.subject.tripleKey);
      const pId = lowerAtomMap.get(normalizeText(edge.predicate).toLowerCase());
      const oId = edge.object.type === "atom"
        ? lowerAtomMap.get(normalizeText(edge.object.label).toLowerCase())
        : resolvedTripleMap.get(edge.object.tripleKey);
      if (sId && pId && oId) {
        nestedEntries.push({ stableKey: edge.stableKey, key: makeTripleKey(sId, pId, oId), sId, pId, oId });
      }
    }

    if (nestedEntries.length === 0) break;

    try {
      const tripleData = await fetchJsonWithTimeout<ResolveTriplesResponse>(
        "/api/intuition/resolve-triples",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ address, combinations: nestedEntries.map((e) => [e.sId, e.pId, e.oId]) }),
        },
        TIMEOUT_TRIPLES,
      );
      let resolvedThisPass = 0;
      for (const entry of nestedEntries) {
        const tripleId = tripleData.byKey[entry.key] ?? null;
        if (tripleId) {
          nestedStatuses.set(entry.stableKey, tripleId);
          resolvedTripleMap.set(entry.stableKey, tripleId);
          resolvedStableKeys.add(entry.stableKey);
          resolvedThisPass++;
        }
      }
      if (resolvedThisPass === 0) break;
    } catch {
      break;
    }
  }

  return { nestedStatuses, resolvedTripleMap };
}

async function resolveMetadataTags(params: {
  draftPosts: DraftPost[] | undefined;
  themes: { slug: string; name: string }[] | undefined;
  themeAtomMap: Map<string, string>;
  nestedStatuses: Map<string, string>;
  nextStatuses: ApprovedTripleStatus[];
  approvedProposals: ApprovedProposalWithRole[];
  address: `0x${string}`;
  signal: ResolutionSignal;
}): Promise<{ metadataStatuses: Map<string, string> }> {
  const { draftPosts, themes, themeAtomMap, nestedStatuses, nextStatuses, approvedProposals, address, signal } = params;
  const metadataStatuses = new Map<string, string>();
  if (!draftPosts?.length || !themes?.length || !checkActive(signal)) return { metadataStatuses };

  const tagEntries: Array<{ key: string; metaKey: string; sId: string; pId: string; oId: string }> = [];
  for (const draft of draftPosts) {
    let mainTermId: string | null = null;
    const mainP = approvedProposals.find((p) => p.id === draft.mainProposalId);
    if (mainP?.outermostMainKey) {
      mainTermId = nestedStatuses.get(mainP.outermostMainKey) ?? null;
    }
    if (!mainTermId) {
      const mainStatus = nextStatuses.find((s) => s.proposalId === draft.mainProposalId);
      if (mainStatus?.isExisting && mainStatus.tripleTermId) mainTermId = mainStatus.tripleTermId;
    }
    if (!mainTermId) continue;

    for (const theme of themes) {
      const themeAtomId = themeAtomMap.get(theme.slug);
      if (!themeAtomId) continue;
      const key = makeTripleKey(mainTermId, HAS_TAG_ATOM_ID, themeAtomId);
      tagEntries.push({ key, metaKey: `tag-${draft.id}-${theme.slug}`, sId: mainTermId, pId: HAS_TAG_ATOM_ID, oId: themeAtomId });
    }
  }

  if (tagEntries.length > 0 && checkActive(signal)) {
    try {
      const tripleData = await fetchJsonWithTimeout<ResolveTriplesResponse>(
        "/api/intuition/resolve-triples",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ address, combinations: tagEntries.map((e) => [e.sId, e.pId, e.oId]) }),
        },
        TIMEOUT_TRIPLES,
      );
      for (const entry of tagEntries) {
        const tripleId = tripleData.byKey[entry.key] ?? null;
        if (tripleId) metadataStatuses.set(entry.metaKey, tripleId);
      }
    } catch { /* not blocking */ }
  }

  return { metadataStatuses };
}

async function resolveTreeSearch(params: {
  draftPosts: DraftPost[] | undefined;
  approvedProposals: ApprovedProposalWithRole[];
  nestedProposals: NestedProposalDraft[] | undefined;
  derivedTriples: DerivedTripleDraft[] | undefined;
  rewrittenDraftIdsRef: React.MutableRefObject<Set<string>>;
  onTreeMatchRewriteRef: React.MutableRefObject<UseTripleResolutionParams["onTreeMatchRewrite"]>;
  signal: ResolutionSignal;
}): Promise<TreeResult> {
  const { draftPosts, approvedProposals, nestedProposals, derivedTriples, rewrittenDraftIdsRef, onTreeMatchRewriteRef, signal } = params;
  let rewriteTriggered = false;
  const fullTreeMatchMap = new Map<string, { termId: string; tree: MatchedTree }>();

  if (!draftPosts?.length) return { fullTreeMatchMap, rewriteTriggered };

  const draftTasks = draftPosts
    .filter((draft) => {
      if (rewrittenDraftIdsRef.current.has(draft.id)) return false;
      const draftMainP = approvedProposals.find((p) => p.id === draft.mainProposalId);
      return !draftMainP?.matchedIntuitionTripleTermId;
    })
    .map((draft) => ({ draft, extractedTree: buildExtractedTree(draft, approvedProposals, nestedProposals ?? [], derivedTriples ?? []) }))
    .filter((t): t is typeof t & { extractedTree: NonNullable<typeof t.extractedTree> } => t.extractedTree != null);

  const results = await Promise.all(
    draftTasks.map(async ({ draft, extractedTree }) => {
      if (!checkActive(signal)) return null;
      try {
        const searchData = await fetchJsonWithTimeout<{
          trees: Array<{ termId: string; tree: MatchedTree; positionCount: number }>;
        }>(
          "/api/intuition/search-nested-tree",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ query: draft.body, limit: 10 }),
          },
          TIMEOUT_TREE_SEARCH,
        );

        for (const candidate of searchData.trees ?? []) {
          if (treeLeavesMatch(candidate.tree, extractedTree)) {
            return { draftId: draft.id, termId: candidate.termId, tree: candidate.tree };
          }
        }

        const partial = findSubTreeMatch(
          (searchData.trees ?? []).map((c) => ({ termId: c.termId, tree: c.tree })),
          extractedTree,
        );
        if (partial) {
          return { draftId: draft.id, termId: partial.termId, tree: partial.restructured };
        }
      } catch { /* not blocking */ }
      return null;
    }),
  );

  for (const r of results) {
    if (!r) continue;
    fullTreeMatchMap.set(r.draftId, { termId: r.termId, tree: r.tree });
    onTreeMatchRewriteRef.current?.(r.draftId, r.tree, r.termId);
    rewrittenDraftIdsRef.current.add(r.draftId);
    rewriteTriggered = true;
  }

  return { fullTreeMatchMap, rewriteTriggered };
}

export function useTripleResolution({
  approvedProposals,
  address,
  extraAtomLabels,
  nestedProposals,
  derivedTriples,
  draftPosts,
  themes,
  onTripleMatched,
  onAtomResolved,
  onTreeMatchRewrite,
}: UseTripleResolutionParams): UseTripleResolutionReturn {
  const [minDeposit, setMinDeposit] = useState<bigint | null>(null);
  const [atomCost, setAtomCost] = useState<bigint | null>(null);
  const [tripleCost, setTripleCost] = useState<bigint | null>(null);
  const [approved, dispatchApproved] = useReducer(approvedResolutionReducer, INITIAL_APPROVED);
  const [semanticSkipped, setSemanticSkipped] = useState(false);
  const [resolvedAtomMap, setResolvedAtomMap] = useState<Map<string, string>>(new Map());
  const [nestedTripleStatuses, setNestedTripleStatuses] = useState<Map<string, string>>(new Map());
  const [derivedCanonicalLabels, setDerivedCanonicalLabels] = useState<Map<string, { s?: string; p?: string; o?: string }>>(new Map());
  const [resolvedAtomLabels, setResolvedAtomLabels] = useState<Map<string, string>>(new Map());
  const [fullTreeMatchByDraft, setFullTreeMatchByDraft] = useState<Map<string, { termId: string; tree: MatchedTree }>>(new Map());
  const [metadataTripleStatuses, setMetadataTripleStatuses] = useState<Map<string, string>>(new Map());
  const [retryTrigger, setRetryTrigger] = useState(0);

  const approvedTripleLookupId = useRef(0);
  const rewrittenDraftIdsRef = useRef(new Set<string>());

  const onTripleMatchedRef = useRef(onTripleMatched);
  useEffect(() => {
    onTripleMatchedRef.current = onTripleMatched;
  }, [onTripleMatched]);

  const onTreeMatchRewriteRef = useRef(onTreeMatchRewrite);
  useEffect(() => {
    onTreeMatchRewriteRef.current = onTreeMatchRewrite;
  }, [onTreeMatchRewrite]);

  const onAtomResolvedRef = useRef(onAtomResolved);
  useEffect(() => {
    onAtomResolvedRef.current = onAtomResolved;
  }, [onAtomResolved]);

  useEffect(() => {
    let active = true;

    async function loadDeposit() {
      if (approvedProposals.length === 0) {
        if (active) {
          setMinDeposit(null);
          setAtomCost(null);
          setTripleCost(null);
        }
        return;
      }

      try {
        const data = await fetchJsonWithTimeout<{
          minDeposit: string;
          tripleCost: string;
          atomCost: string;
        }>("/api/intuition/config");
        if (active) {
          setMinDeposit(BigInt(data.minDeposit));
          setAtomCost(BigInt(data.atomCost));
          setTripleCost(BigInt(data.tripleCost));
        }
      } catch {
        if (active) {
          setMinDeposit(null);
          setAtomCost(null);
          setTripleCost(null);
        }
      }
    }

    loadDeposit();

    return () => {
      active = false;
    };
  }, [approvedProposals.length]);

  useEffect(() => {
    const requestId = ++approvedTripleLookupId.current;
    const signal: ResolutionSignal = { active: true, requestId, ref: approvedTripleLookupId };

    if (approvedProposals.length === 0 || !address) {
      dispatchApproved({ type: "RESET" });
      return () => { signal.active = false; };
    }

    dispatchApproved({ type: "CHECKING" });
    setSemanticSkipped(false);

    async function checkApprovedTriples() {
      try {
        const labelsByProposal: LabelEntry[] = approvedProposals.map((proposal) => ({
          proposalId: proposal.id,
          sLabel: normalizeText(proposal.sText),
          pLabel: normalizeText(proposal.pText),
          oLabel: normalizeText(proposal.oText),
          subjectAtomId: proposal.subjectAtomId ?? null,
          predicateAtomId: proposal.predicateAtomId ?? null,
          objectAtomId: proposal.objectAtomId ?? null,
          matchedIntuitionTripleTermId: proposal.matchedIntuitionTripleTermId ?? null,
        }));

        const missingLabels = new Set<string>();
        const lockedAtomIds = new Set<string>();
        for (const entry of labelsByProposal) {
          // L0 proposals (triple already matched) → skip atom resolution entirely,
          // their atoms will come from the matched triple in resolveFlatTriples
          if (entry.matchedIntuitionTripleTermId) continue;

          if (entry.sLabel && !entry.subjectAtomId) missingLabels.add(entry.sLabel);
          else if (entry.subjectAtomId) lockedAtomIds.add(entry.subjectAtomId);
          if (entry.pLabel && !entry.predicateAtomId) missingLabels.add(entry.pLabel);
          else if (entry.predicateAtomId) lockedAtomIds.add(entry.predicateAtomId);
          if (entry.oLabel && !entry.objectAtomId) missingLabels.add(entry.oLabel);
          else if (entry.objectAtomId) lockedAtomIds.add(entry.objectAtomId);
        }

        if (extraAtomLabels) {
          for (const label of extraAtomLabels) {
            const normalized = normalizeText(label);
            if (normalized) missingLabels.add(normalized);
          }
        }

        // Phase 0: atoms + tree search in parallel
        const [atomResult, treeResult] = await Promise.all([
          resolveAtomLabels({ missingLabels, lockedAtomIds, labelsByProposal, approvedProposals, signal }),
          resolveTreeSearch({ draftPosts, approvedProposals, nestedProposals, derivedTriples, rewrittenDraftIdsRef, onTreeMatchRewriteRef, signal }),
        ]);
        if (!checkActive(signal)) return;

        // Early exit: all drafts matched on-chain → skip Phases 1-3, wait for rewrite re-run
        if (treeResult.rewriteTriggered && draftPosts?.every(d => treeResult.fullTreeMatchMap.has(d.id))) {
          setFullTreeMatchByDraft(treeResult.fullTreeMatchMap);
          return;
        }

        const fullAtomMap = new Map<string, string>();
        for (const [label, termId] of atomResult.atomMap) {
          fullAtomMap.set(label, termId);
          const canonical = atomResult.canonicalLabelMap.get(label);
          if (canonical) fullAtomMap.set(canonical, termId);
        }
        for (const entry of labelsByProposal) {
          if (entry.subjectAtomId && entry.sLabel) fullAtomMap.set(entry.sLabel, entry.subjectAtomId);
          if (entry.predicateAtomId && entry.pLabel) fullAtomMap.set(entry.pLabel, entry.predicateAtomId);
          if (entry.objectAtomId && entry.oLabel) fullAtomMap.set(entry.oLabel, entry.objectAtomId);
        }

        const lowerAtomMap = new Map<string, string>();
        for (const [label, termId] of fullAtomMap) lowerAtomMap.set(label.toLowerCase(), termId);

        const nextDerivedCanonical = new Map<string, { s?: string; p?: string; o?: string }>();
        if (derivedTriples?.length) {
          for (const dt of derivedTriples) {
            const updates: { s?: string; p?: string; o?: string } = {};
            const sC = atomResult.canonicalLabelMap.get(normalizeText(dt.subject));
            if (sC && sC !== dt.subject) updates.s = sC;
            const pC = atomResult.canonicalLabelMap.get(normalizeText(dt.predicate));
            if (pC && pC !== dt.predicate) updates.p = pC;
            const oC = atomResult.canonicalLabelMap.get(normalizeText(dt.object));
            if (oC && oC !== dt.object) updates.o = oC;
            if (Object.keys(updates).length) nextDerivedCanonical.set(dt.stableKey, updates);
          }
        }

        // Phase 1: flat + derived + themes in parallel
        const [flatResult, derivedResult, themeResult] = await Promise.all([
          resolveFlatTriples({ atomMap: atomResult.atomMap, labelsByProposal, address: address!, onTripleMatchedRef, signal }),
          resolveDerivedChain({ derivedTriples, lowerAtomMap, address: address!, signal }),
          resolveThemeAtoms({ themes, fullAtomMap, signal }),
        ]);
        if (!checkActive(signal)) return;

        setSemanticSkipped(flatResult.semanticSkipped);

        const nestedStatuses = new Map<string, string>();
        if (nestedProposals?.length) {
          for (const edge of nestedProposals) {
            if (edge.matchedTripleTermId) nestedStatuses.set(edge.stableKey, edge.matchedTripleTermId);
          }
        }
        for (const [k, v] of derivedResult.nestedStatuses) nestedStatuses.set(k, v);

        const resolvedFlatTripleMap = new Map<string, string>();
        for (const status of flatResult.nextStatuses) {
          if (status.isExisting && status.tripleTermId) {
            const proposal = approvedProposals.find((p) => p.id === status.proposalId);
            if (proposal) resolvedFlatTripleMap.set(proposal.stableKey, status.tripleTermId);
          }
        }
        const resolvedTripleMap = new Map(resolvedFlatTripleMap);
        for (const [k, v] of derivedResult.resolvedTripleMap) resolvedTripleMap.set(k, v);
        const resolvedStableKeys = new Set(derivedResult.resolvedStableKeys);

        // Phase 2: nested multi-pass
        const nestedResult = await resolveNestedPasses({
          nestedProposals, lowerAtomMap, address: address!,
          resolvedTripleMap, resolvedStableKeys, nestedStatuses,
          signal,
        });
        if (!checkActive(signal)) return;

        // Phase 3: metadata tags
        const metadataResult = await resolveMetadataTags({
          draftPosts, themes, themeAtomMap: themeResult.themeAtomMap,
          nestedStatuses: nestedResult.nestedStatuses,
          nextStatuses: flatResult.nextStatuses,
          approvedProposals, address: address!, signal,
        });
        if (!checkActive(signal)) return;

        // Merge tree matches into nextStatuses
        for (const [draftId, match] of treeResult.fullTreeMatchMap) {
          const draft = draftPosts?.find((d) => d.id === draftId);
          if (!draft) continue;
          const mainProposal = approvedProposals.find((p) => p.id === draft.mainProposalId);
          if (mainProposal) {
            const status = flatResult.nextStatuses.find((s) => s.proposalId === mainProposal.id);
            if (status) { status.tripleTermId = match.termId; status.isExisting = true; }
          }
        }

        setResolvedAtomMap(fullAtomMap);
        setDerivedCanonicalLabels(nextDerivedCanonical);
        setResolvedAtomLabels(new Map(atomResult.canonicalLabelMap));
        setNestedTripleStatuses(nestedResult.nestedStatuses);
        setMetadataTripleStatuses(metadataResult.metadataStatuses);
        setFullTreeMatchByDraft(treeResult.fullTreeMatchMap);

        if (treeResult.rewriteTriggered) return;

        for (const update of atomResult.pendingAtomUpdates) {
          onAtomResolvedRef.current?.(update.proposalId, update.field, update.termId, update.canonicalLabel);
        }

        dispatchApproved({ type: "READY", statuses: flatResult.nextStatuses });
      } catch (error: unknown) {
        if (!checkActive(signal)) return;
        const msg =
          error instanceof FetchError && error.code === "TIMEOUT"
            ? "Claim verification took too long. Your claims are still valid — tap Publish to try again."
            : error instanceof Error
              ? error.message
              : "Unable to resolve triple status.";
        dispatchApproved({ type: "ERROR", error: msg });
      }
    }

    void checkApprovedTriples();

    return () => { signal.active = false; };
  }, [approvedProposals, address, extraAtomLabels, nestedProposals, derivedTriples, draftPosts, themes, retryTrigger]);

  const retryCheck = useCallback(() => setRetryTrigger((n) => n + 1), []);

  const clearRewriteGuard = useCallback(() => {
    rewrittenDraftIdsRef.current = new Set();
  }, []);

  // Build lowercase atom map (conceptKey = lowercase) to match publish/atoms.ts atomKey()
  const lowercaseAtomMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const [label, termId] of resolvedAtomMap) m.set(label.toLowerCase(), termId);
    return m;
  }, [resolvedAtomMap]);

  const resolutionMap = useMemo<ResolutionMap>(() => ({
    atoms: lowercaseAtomMap,
    canonicalLabels: resolvedAtomLabels,
    flatTriples: new Map(
      approved.statuses
        .filter((s) => s.tripleTermId)
        .map((s) => [s.proposalId, { tripleTermId: s.tripleTermId!, isExisting: s.isExisting }]),
    ),
    nestedTriples: nestedTripleStatuses,
    metadataTriples: metadataTripleStatuses,
    treeMatches: fullTreeMatchByDraft,
    costs: atomCost && tripleCost && minDeposit
      ? { atomCost, tripleCost, minDeposit }
      : null,
  }), [lowercaseAtomMap, resolvedAtomLabels, approved.statuses, nestedTripleStatuses, metadataTripleStatuses, fullTreeMatchByDraft, atomCost, tripleCost, minDeposit]);

  return {
    minDeposit,
    atomCost,
    tripleCost,
    approvedTripleStatuses: approved.statuses,
    approvedTripleStatus: approved.status,
    approvedTripleStatusError: approved.error,
    semanticSkipped,
    resolvedAtomMap,
    nestedTripleStatuses,
    derivedCanonicalLabels,
    resolvedAtomLabels,
    fullTreeMatchByDraft,
    metadataTripleStatuses,
    resolutionMap,
    clearRewriteGuard,
    retryCheck,
  };
}
