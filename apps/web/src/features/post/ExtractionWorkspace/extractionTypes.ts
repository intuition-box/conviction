import { asNumber } from "@/lib/format/asNumber";

export type Stance = "SUPPORTS" | "REFUTES";

export type ProposalStatus = "pending" | "approved" | "rejected";

export type ProposalDraft = {
  id: string;
  stableKey: string;
  sText: string;
  pText: string;
  oText: string;
  status: ProposalStatus;
  subjectAtomId: string | null;
  predicateAtomId: string | null;
  objectAtomId: string | null;
  matchedIntuitionTripleTermId?: string | null;
  suggestedStance: Stance | null;
  stanceAligned: boolean | null;
  stanceReason: string | null;
  sentenceText: string;
  saved: {
    sText: string;
    pText: string;
    oText: string;
    subjectAtomId: string | null;
    predicateAtomId: string | null;
    objectAtomId: string | null;
  };
};

export type ProposalSummary = {
  id: string;
  stableKey: string | null;
  sText: string;
  pText: string;
  oText: string;
  status: ProposalStatus;
  isDraft: boolean;
  subjectAtomId: string | null;
  predicateAtomId: string | null;
  objectAtomId: string | null;
  matchedIntuitionTripleTermId?: string | null;
  isDirty: boolean;
  suggestedStance: Stance | null;
  stanceAligned: boolean | null;
  stanceReason: string | null;
};

export type NestedTermRef =
  | { type: "atom"; atomKey: string; label: string }
  | { type: "triple"; tripleKey: string; label?: string };

export type NestedProposalStatus = "approved" | "rejected";

export type NestedProposalDraft = {
  id: string;
  edgeKind: string;
  predicate: string;
  subject: NestedTermRef;
  object: NestedTermRef;
  stableKey: string;
  status?: NestedProposalStatus;
};

export type NestedActions = {
  onReject: (nestedId: string) => void;
  onRestore: (nestedId: string) => void;
};

export type ExtractionJobSummary = {
  id: string;
  status: string;
  inputText?: string;
  parentPostId?: string | null;
  stance?: Stance | null;
  parentMainTripleTermId?: string | null;
};

export type PublishSummary = {
  id: string;
  publishedAt: string;
};

export type TxPlanItem = {
  id: string;
  kind: "atom" | "triple";
  intuitionId: string;
  status: "pending" | "published" | "failed";
  txHash?: string | null;
  error: string | null;
};

export type ExistingTripleStatus = "idle" | "checking" | "found" | "not_found" | "error";

export type ApprovedTripleStatusState = "idle" | "checking" | "ready" | "error";

export type ApprovedTripleStatus = {
  proposalId: string;
  tripleTermId: string | null;
  isExisting: boolean;
};

export type TripleSuggestion = {
  id: string;
  subject: string;
  predicate: string;
  object: string;
  subjectId?: string | null;
  predicateId?: string | null;
  objectId?: string | null;
  source: "global" | "semantic" | "graphql" | "exact";
  marketCap?: number | null;
  holders?: number | null;
  shares?: number | null;
  counterMarketCap?: number | null;
  counterHolders?: number | null;
  counterShares?: number | null;
  isExactMatch?: boolean;
};

export type TripleSuggestionState = "idle" | "loading" | "ready" | "error";

export type TripleSuggestionSummary = {
  status: TripleSuggestionState;
  suggestions: TripleSuggestion[];
  error: string | null;
};

export type ExistingTripleMetrics = {
  holders: number | null;
  totalShares: number | null;
  sharePrice: number | null;
  marketCap: number | null;
};

export type DepositState =
  | { status: "idle" }
  | { status: "depositing" }
  | { status: "confirmed"; txHash: string }
  | { status: "failed"; error: string };

export type ExtractionContext = {
  inputText: string;
  parentPostId: string | null;
  stance: Stance | null;
};

export type TripleRole = "MAIN" | "SUPPORTING";

export type ApprovedProposalWithRole = ProposalDraft & { role: TripleRole };

export type DraftPost = {
  id: string;                    // "draft-0", "draft-1", ...
  stance: Stance | null;         // For replies (null for root posts)
  mainProposalId: string | null; // Exactly 1 required to publish
  proposalIds: string[];         // ALL proposals in this draft (incl. pending)
  body: string;                  // Empty for Phase 1 (Phase 4)
  bodyDefault: string;           // Empty for Phase 1 (Phase 4)
};
// supporting = proposalIds.filter(id => id !== mainProposalId) — DERIVED

export type ProposalActions = {
  onChange: (proposalId: string, field: "sText" | "pText" | "oText", value: string) => void;
  onSave: (proposalId: string) => void;
  onSelectMain: (proposalId: string) => void;
  onReject: (proposalId: string) => void;
  onSelectReuse: (proposalId: string, tripleTermId: string | null) => void;
  onLock: (proposalId: string, field: "sText" | "pText" | "oText", atomId: string, label: string) => void;
  onUnlock: (proposalId: string, field: "sText" | "pText" | "oText") => void;
  onAddDraft: (targetDraftId?: string) => void;
};

export type DraftActions = {
  onSplit: () => void;
  onMerge: () => void;
  onStanceChange: (draftId: string, stance: Stance) => void;
  onBodyChange: (draftId: string, body: string) => void;
  onBodyReset: (draftId: string) => void;
};

export type ResolvedTriple = {
  proposalId: string;
  role: TripleRole;
  subjectAtomId: string;
  predicateAtomId: string;
  objectAtomId: string;
  tripleTermId: string;
  isExisting: boolean;
};

export type ResolvedNestedTriple = {
  nestedProposalId: string;
  subjectTermId: string;    // atom ID or triple termId (nested can point to triples)
  predicateTermId: string;  // always an atom ID
  objectTermId: string;     // atom ID or triple termId
  tripleTermId: string;
  isExisting: boolean;
};

export type NestedTriplePayloadItem = {
  nestedProposalId: string;
  tripleTermId: string;
  isExisting: boolean;
};

/** Per-draft payload sent to /api/publish in multi-post mode */
export type DraftPublishPayload = {
  draftId: string;
  body: string;
  stance: Stance | null;
  triples: { proposalId: string; tripleTermId: string; isExisting: boolean; role: TripleRole }[];
  nestedTriples: { nestedProposalId: string; tripleTermId: string; isExisting: boolean }[];
};

export type BatchOnchainResult = {
  triples: ResolvedTriple[];
  atomTxHash: string | null;
  tripleTxHash: string | null;
  stanceTxHash: string | null;
};

export type UseExtractionFlowParams = {
  themeSlug: string;
  parentPostId: string | null;
  parentMainTripleTermId?: string | null;
  themeAtomTermId?: string | null;
  onPublishSuccess?: (postId: string) => void;
};

export type HexString = `0x${string}`;

// --- Pure helper functions ---

export function asHexId(value: string): HexString | null {
  if (value.startsWith("0x")) {
    return value as HexString;
  }
  return null;
}

export function createInitialDraft(
  id: string,
  stance: Stance | null,
  proposalIds: string[],
  mainProposalId?: string | null,
  bodyDefault?: string,
): DraftPost {
  const bd = bodyDefault ?? "";
  return { id, stance, mainProposalId: mainProposalId ?? null, proposalIds, body: bd, bodyDefault: bd };
}

export function normalizeMain(draft: DraftPost): DraftPost {
  if (draft.mainProposalId && draft.proposalIds.includes(draft.mainProposalId)) {
    return draft;
  }
  return { ...draft, mainProposalId: draft.proposalIds[0] ?? null };
}

export function findDraftIndex(drafts: DraftPost[], proposalId: string): number {
  return drafts.findIndex((d) => d.proposalIds.includes(proposalId));
}

export function splitIntoDrafts(
  sourceDrafts: DraftPost[],
  proposals: ProposalDraft[],
  userStance: Stance | null,
): DraftPost[] {
  const allProposalIds = [...new Set(sourceDrafts.flatMap((d) => d.proposalIds))];
  const activeIds = allProposalIds.filter((pid) => {
    const p = proposals.find((pr) => pr.id === pid);
    return p && p.status !== "rejected";
  });
  return activeIds.map((pid, index) => {
    const proposal = proposals.find((p) => p.id === pid);
    const stance = proposal?.suggestedStance ?? userStance;
    const bodyDefault = proposal
      ? `${proposal.sText} ${proposal.pText} ${proposal.oText}`
      : "";
    return {
      id: `draft-${index}`,
      stance,
      mainProposalId: pid,
      proposalIds: [pid],
      body: bodyDefault,
      bodyDefault,
    };
  });
}

export function mergeDrafts(
  drafts: DraftPost[],
  userStance: Stance | null,
  inputText?: string,
  proposals?: ProposalDraft[],
): DraftPost {
  const raw = drafts.flatMap((d) => d.proposalIds);
  const allProposalIds = proposals
    ? [...new Set(raw)].filter((pid) => {
        const p = proposals.find((pr) => pr.id === pid);
        return p && p.status !== "rejected";
      })
    : [...new Set(raw)];
  const mainFromFirst = drafts[0]?.mainProposalId ?? null;
  const mainProposalId = mainFromFirst && allProposalIds.includes(mainFromFirst)
    ? mainFromFirst
    : allProposalIds[0] ?? null;
  const bodyDefault = inputText ?? "";
  return {
    id: "draft-0",
    stance: drafts[0]?.stance ?? userStance,
    mainProposalId,
    proposalIds: allProposalIds,
    body: bodyDefault,
    bodyDefault,
  };
}

export function decisionToStatus(decision: string): ProposalStatus {
  if (decision === "CREATE_NEW" || decision === "REUSE_EXISTING") return "approved";
  if (decision === "REJECTED") return "rejected";
  return "pending";
}

export function parseTripleSuggestions(value: unknown): TripleSuggestion[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const {
        id,
        subject,
        predicate,
        object,
        subjectId,
        predicateId,
        objectId,
        source,
        marketCap,
        holders,
        shares,
        counterMarketCap,
        counterHolders,
        counterShares,
        isExactMatch,
      } = item as {
        id?: unknown;
        subject?: unknown;
        predicate?: unknown;
        object?: unknown;
        subjectId?: unknown;
        predicateId?: unknown;
        objectId?: unknown;
        source?: unknown;
        marketCap?: unknown;
        holders?: unknown;
        shares?: unknown;
        counterMarketCap?: unknown;
        counterHolders?: unknown;
        counterShares?: unknown;
        isExactMatch?: unknown;
      };

      if (typeof id !== "string" || typeof subject !== "string" || typeof predicate !== "string" || typeof object !== "string") {
        return null;
      }
      if (source !== "global" && source !== "semantic" && source !== "graphql" && source !== "exact") return null;

      return {
        id,
        subject,
        predicate,
        object,
        subjectId: typeof subjectId === "string" ? subjectId : null,
        predicateId: typeof predicateId === "string" ? predicateId : null,
        objectId: typeof objectId === "string" ? objectId : null,
        source,
        marketCap: asNumber(marketCap),
        holders: asNumber(holders),
        shares: asNumber(shares),
        counterMarketCap: asNumber(counterMarketCap),
        counterHolders: asNumber(counterHolders),
        counterShares: asNumber(counterShares),
        isExactMatch: isExactMatch === true,
      } as TripleSuggestion;
    })
    .filter((item): item is TripleSuggestion => item !== null);
}

// --- Parsing helpers ---

function parseSuggestedStance(val: unknown): Stance | null {
  if (val === "SUPPORTS" || val === "REFUTES") return val;
  return null;
}

// --- Deduplicated API → state builders ---

export type ApiProposal = {
  id: string;
  kind?: string;
  payload: Record<string, unknown>;
  decision: string;
  matchedIntuitionTripleTermId?: string | null;
};

export function buildProposalDraftsFromApi(
  apiProposals: ApiProposal[],
  freshExtraction = false,
): ProposalDraft[] {
  return apiProposals
    .filter((p) => p.kind !== "NESTED_TRIPLE")
    .map((proposal) => {
      const sText = (proposal.payload?.subject as string) ?? "";
      const pText = (proposal.payload?.predicate as string) ?? "";
      const oText = (proposal.payload?.object as string) ?? "";
      return {
        id: proposal.id,
        stableKey: (proposal.payload?.stableKey as string) ?? "",
        sText,
        pText,
        oText,
        status: freshExtraction ? ("approved" as ProposalStatus) : decisionToStatus(proposal.decision),
        subjectAtomId: null,
        predicateAtomId: null,
        objectAtomId: null,
        matchedIntuitionTripleTermId: proposal.matchedIntuitionTripleTermId ?? null,
        suggestedStance: parseSuggestedStance(proposal.payload?.suggestedStance),
        stanceAligned: typeof proposal.payload?.stanceAligned === "boolean" ? proposal.payload.stanceAligned : null,
        stanceReason: typeof proposal.payload?.stanceReason === "string" ? proposal.payload.stanceReason : null,
        sentenceText: typeof proposal.payload?.sentenceText === "string" ? proposal.payload.sentenceText : "",
        saved: {
          sText,
          pText,
          oText,
          subjectAtomId: null,
          predicateAtomId: null,
          objectAtomId: null,
        },
      };
    });
}

export function buildNestedDraftsFromApi(apiProposals: ApiProposal[]): NestedProposalDraft[] {
  return apiProposals
    .filter((p) => p.kind === "NESTED_TRIPLE")
    .map((p) => ({
      id: p.id,
      edgeKind: (p.payload?.edgeKind as string) ?? "",
      predicate: (p.payload?.predicate as string) ?? "",
      subject: (p.payload?.subject as NestedTermRef) ?? { type: "atom" as const, atomKey: "", label: "" },
      object: (p.payload?.object as NestedTermRef) ?? { type: "atom" as const, atomKey: "", label: "" },
      stableKey: (p.payload?.stableKey as string) ?? "",
    }));
}

export function buildNestedRefLabels(apiProposals: ApiProposal[]): Map<string, string> {
  const labelMap = new Map<string, string>();

  // Pass 1: core proposals → stableKey → "S · P · O"
  for (const p of apiProposals) {
    if (p.kind === "NESTED_TRIPLE") continue;
    const sk = p.payload?.stableKey as string | undefined;
    if (!sk) continue;
    const label = [p.payload?.subject, p.payload?.predicate, p.payload?.object]
      .filter(Boolean)
      .join(" \u00B7 ");
    labelMap.set(sk, label);
  }

  // Pass 2: NESTED_TRIPLE proposals — extract labels from triple refs
  // (covers sub-triple refs from modifier/subject decomposition)
  for (const p of apiProposals) {
    if (p.kind !== "NESTED_TRIPLE") continue;
    for (const refKey of ["subject", "object"] as const) {
      const ref = p.payload?.[refKey] as NestedTermRef | undefined;
      if (ref?.type === "triple" && ref.label && !labelMap.has(ref.tripleKey)) {
        labelMap.set(ref.tripleKey, ref.label);
      }
    }
  }

  return labelMap;
}

// ─── Phase 5: nested triple helpers ───────────────────────────────────

export function collectNestedAtomLabels(
  nestedProposals: NestedProposalDraft[],
): string[] {
  const out = new Set<string>();
  for (const edge of nestedProposals) {
    if (edge.predicate) out.add(edge.predicate);
    if (edge.subject.type === "atom" && edge.subject.label) out.add(edge.subject.label);
    if (edge.object.type === "atom" && edge.object.label) out.add(edge.object.label);
  }
  return Array.from(out);
}

export function buildResolvedTripleMap(
  resolvedByIndex: Array<ResolvedTriple | null>,
  approvedProposals: ApprovedProposalWithRole[],
): Map<string, string> {
  const map = new Map<string, string>();
  for (let i = 0; i < approvedProposals.length; i++) {
    const resolved = resolvedByIndex[i];
    if (resolved && approvedProposals[i].stableKey) {
      map.set(approvedProposals[i].stableKey, resolved.tripleTermId);
    }
  }
  return map;
}

/**
 * Groups resolved triples + nested triples by draft ID.
 * Core/stance triples → ERROR if unmapped (no silent fallback).
 * Nested triples → subject's draft → object's draft → first draft (atom-only fallback).
 */
export function groupResolvedByDraft(
  resolvedByIndex: Array<ResolvedTriple | null>,
  resolvedNestedTriples: ResolvedNestedTriple[],
  draftPosts: DraftPost[],
  proposals: ProposalDraft[],
  nestedProposals: NestedProposalDraft[],
): DraftPublishPayload[] {
  const proposalToDraft = new Map<string, string>();
  for (const draft of draftPosts) {
    for (const pid of draft.proposalIds) {
      proposalToDraft.set(pid, draft.id);
    }
  }

  const stableKeyToProposalId = new Map<string, string>();
  for (const p of proposals) {
    if (p.stableKey) stableKeyToProposalId.set(p.stableKey, p.id);
  }

  const payloads = new Map<string, DraftPublishPayload>();
  for (const draft of draftPosts) {
    payloads.set(draft.id, {
      draftId: draft.id,
      body: draft.body,
      stance: draft.stance,
      triples: [],
      nestedTriples: [],
    });
  }

  // Assign core + stance triples — throw if unmapped
  for (const t of resolvedByIndex) {
    if (!t) continue;
    let draftId: string | undefined;
    if (t.proposalId.startsWith("stance_")) {
      const mainPid = t.proposalId.replace("stance_", "");
      draftId = proposalToDraft.get(mainPid);
    } else {
      draftId = proposalToDraft.get(t.proposalId);
    }
    if (!draftId) {
      throw new Error(`Cannot assign triple "${t.proposalId}" to any draft — mapping missing.`);
    }
    payloads.get(draftId)!.triples.push({
      proposalId: t.proposalId,
      tripleTermId: t.tripleTermId,
      isExisting: t.isExisting,
      role: t.role,
    });
  }

  // Assign nested triples via subject → object → first draft (atom-only)
  const edgeById = new Map(nestedProposals.map((e) => [e.id, e]));
  for (const n of resolvedNestedTriples) {
    const edge = edgeById.get(n.nestedProposalId);
    let draftId: string | undefined;
    if (edge) {
      if (edge.subject.type === "triple") {
        const pid = stableKeyToProposalId.get(edge.subject.tripleKey);
        if (pid) draftId = proposalToDraft.get(pid);
      }
      if (!draftId && edge.object.type === "triple") {
        const pid = stableKeyToProposalId.get(edge.object.tripleKey);
        if (pid) draftId = proposalToDraft.get(pid);
      }
    }
    // Atom-only nested: fallback to first draft (explicitly accepted)
    draftId ??= draftPosts[0]?.id;
    if (draftId) {
      payloads.get(draftId)!.nestedTriples.push({
        nestedProposalId: n.nestedProposalId,
        tripleTermId: n.tripleTermId,
        isExisting: n.isExisting,
      });
    }
  }

  return draftPosts.map((d) => payloads.get(d.id)!);
}
