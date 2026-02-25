import { toHex, type Address, type Hex, type PublicClient, type WalletClient } from "viem";
import {
  findAtomIds,
  findTripleIds,
  getTripleDetails,
} from "@0xintuition/sdk";
import {
  multiVaultMultiCallIntuitionConfigs,
  multiVaultCreateAtoms,
  multiVaultCreateTriples,
  multiVaultGetAtomCost,
  eventParseAtomCreated,
  eventParseTripleCreated,
} from "@0xintuition/protocol";

import { getStanceAtomId, HAS_TAG_ATOM_ID } from "@/lib/intuition/protocolAtoms";
import { depositToTripleMin } from "@/lib/intuition/intuitionDeposit";
import { normalizeLabelForChain } from "@/lib/format/normalizeLabel";
import { labels } from "@/lib/vocabulary";

import {
  asHexId,
  type ApprovedProposalWithRole,
  type NestedProposalDraft,
  type NestedTermRef,
  type ResolvedNestedTriple,
  type ResolvedTriple,
  type Stance,
  type TripleRole,
} from "./extractionTypes";

const normalizeText = normalizeLabelForChain;

// ─── Types ──────────────────────────────────────────────────────────────

export type OnchainWriteConfig = {
  walletClient: WalletClient;
  publicClient: PublicClient;
  multivaultAddress: Address;
};

export type StepContext = {
  writeConfig: OnchainWriteConfig;
  accountAddress: Address;
};

export type PublishStepCode =
  | "hydrate_failed"
  | "atom_resolution_failed"
  | "atom_creation_failed"
  | "triple_resolution_failed"
  | "triple_creation_failed"
  | "nested_resolution_failed"
  | "nested_creation_failed"
  | "stance_failed"
  | "deposit_failed"
  | "resolution_incomplete";

export class PublishStepError extends Error {
  code: PublishStepCode;
  constructor(code: PublishStepCode, message: string) {
    super(message);
    this.name = "PublishStepError";
    this.code = code;
  }
}

// ─── SDK config adapters ────────────────────────────────────────────────

function sdkWriteConfig(wc: OnchainWriteConfig) {
  return { walletClient: wc.walletClient, publicClient: wc.publicClient, address: wc.multivaultAddress };
}

function sdkReadConfig(wc: OnchainWriteConfig) {
  return { address: wc.multivaultAddress, publicClient: wc.publicClient };
}

// ─── Step 1: hydrateMatchedTriples ──────────────────────────────────────
//
// For proposals with matchedIntuitionTripleTermId, fetches atom IDs from
// getTripleDetails and writes the resolved triple into resolvedByIndex.
// Returns the remaining proposals that need full atom + triple resolution.

export async function hydrateMatchedTriples(
  proposals: ApprovedProposalWithRole[],
  resolvedByIndex: Array<ResolvedTriple | null>,
): Promise<{ proposal: ApprovedProposalWithRole; index: number }[]> {
  const remaining: { proposal: ApprovedProposalWithRole; index: number }[] = [];

  for (const [index, proposal] of proposals.entries()) {
    const matchedTripleId = proposal.matchedIntuitionTripleTermId;
    if (matchedTripleId) {
      try {
        const details = await getTripleDetails(matchedTripleId);
        if (!details) {
          throw new PublishStepError("hydrate_failed", labels.errorResolution);
        }
        resolvedByIndex[index] = {
          proposalId: proposal.id,
          role: proposal.role,
          subjectAtomId: details.subject_id,
          predicateAtomId: details.predicate_id,
          objectAtomId: details.object_id,
          tripleTermId: matchedTripleId,
          isExisting: true,
        };
      } catch (error) {
        if (error instanceof PublishStepError) throw error;
        throw new PublishStepError("hydrate_failed", labels.errorResolution);
      }
    } else {
      remaining.push({ proposal, index });
    }
  }

  return remaining;
}

// ─── Step 2: resolveAtoms ───────────────────────────────────────────────
//
// Resolves atom IDs for all S/P/O fields of the given proposals:
//   1. Locked atoms (user picked an existing atom) → use directly
//   2. findAtomIds → find on-chain matches
//   3. multiVaultCreateAtoms → create any still-missing atoms (wallet TX)
//
// Returns the label→atomId map and the atom creation txHash (if any).

export async function resolveAtoms(
  proposals: { proposal: ApprovedProposalWithRole; index: number }[],
  ctx: StepContext,
  extraAtomLabels: string[] = [],
): Promise<{ atomMap: Map<string, string>; atomTxHash: string | null }> {
  const atomMap = new Map<string, string>();

  type AtomSlot = { label: string; lockedId: string | null };
  const allSlots: AtomSlot[] = [];
  for (const entry of proposals) {
    const p = entry.proposal;
    allSlots.push(
      { label: normalizeText(p.sText), lockedId: p.subjectAtomId },
      { label: normalizeText(p.pText), lockedId: p.predicateAtomId },
      { label: normalizeText(p.oText), lockedId: p.objectAtomId },
    );
  }

  // Extra atom labels from nested edges (predicates + atom-type refs)
  for (const label of extraAtomLabels) {
    const normalized = normalizeText(label);
    if (normalized) {
      allSlots.push({ label: normalized, lockedId: null });
    }
  }

  // Phase 1: locked atoms
  for (const slot of allSlots) {
    if (slot.lockedId && !atomMap.has(slot.label)) {
      atomMap.set(slot.label, slot.lockedId);
    }
  }

  // Phase 2: find existing atoms on-chain
  const unresolvedLabels = Array.from(
    new Set(allSlots.filter((s) => !atomMap.has(s.label)).map((s) => s.label)),
  );

  if (unresolvedLabels.length > 0) {
    try {
      const existingAtoms = await findAtomIds(unresolvedLabels);
      for (const atom of existingAtoms) {
        atomMap.set(atom.data, atom.term_id);
      }
    } catch {
      throw new PublishStepError("atom_resolution_failed", labels.errorAtomCreation);
    }
  }

  // Phase 3: create missing atoms (wallet TX)
  const missingLabels = Array.from(
    new Set(allSlots.filter((s) => !atomMap.has(s.label)).map((s) => s.label)),
  );

  let atomTxHash: string | null = null;

  if (missingLabels.length > 0) {
    try {
      const atomCost = await multiVaultGetAtomCost(sdkReadConfig(ctx.writeConfig));
      const atomUris = missingLabels.map((label) => toHex(label));
      const costs = Array(missingLabels.length).fill(atomCost) as bigint[];
      const totalCost = atomCost * BigInt(missingLabels.length);

      atomTxHash = await multiVaultCreateAtoms(sdkWriteConfig(ctx.writeConfig), {
        args: [atomUris, costs],
        value: totalCost,
      });

      const events = await eventParseAtomCreated(ctx.writeConfig.publicClient, atomTxHash as Hex);
      for (let i = 0; i < missingLabels.length; i++) {
        const termId = events[i]?.args?.termId;
        if (termId) {
          atomMap.set(missingLabels[i], String(termId));
        }
      }
    } catch (error) {
      if (error instanceof PublishStepError) throw error;
      throw new PublishStepError("atom_creation_failed", labels.errorAtomCreation);
    }
  }

  // Verify all slots resolved
  for (const slot of allSlots) {
    if (!atomMap.has(slot.label)) {
      throw new PublishStepError("atom_resolution_failed", labels.errorAtomCreation);
    }
  }

  return { atomMap, atomTxHash };
}

// ─── Step 3: resolveTriples ─────────────────────────────────────────────
//
// Resolves triple IDs for the given proposals using the atomMap:
//   1. findTripleIds → find on-chain matches (existing → isExisting: true)
//   2. multiVaultCreateTriples → create new triples (wallet TX)
//
// Writes resolved triples into resolvedByIndex at their original index.

export async function resolveTriples(
  entries: { proposal: ApprovedProposalWithRole; index: number }[],
  atomMap: Map<string, string>,
  resolvedByIndex: Array<ResolvedTriple | null>,
  ctx: StepContext,
): Promise<{ tripleTxHash: string | null }> {
  type TripleEntry = {
    proposalId: string;
    role: TripleRole;
    subjectAtomId: string;
    predicateAtomId: string;
    objectAtomId: string;
    index: number;
  };

  const tripleEntries: TripleEntry[] = entries.map(({ proposal, index }) => ({
    index,
    proposalId: proposal.id,
    role: proposal.role,
    subjectAtomId: atomMap.get(normalizeText(proposal.sText))!,
    predicateAtomId: atomMap.get(normalizeText(proposal.pText))!,
    objectAtomId: atomMap.get(normalizeText(proposal.oText))!,
  }));

  // Find existing triples
  let existingTripleResults;
  try {
    const tripleQueries = tripleEntries.map(
      (t) => [t.subjectAtomId, t.predicateAtomId, t.objectAtomId] as [string, string, string],
    );
    existingTripleResults = await findTripleIds(ctx.accountAddress, tripleQueries);
  } catch {
    throw new PublishStepError("triple_resolution_failed", labels.errorTripleCreation);
  }

  const tripleIdMap = new Map<string, string>();
  for (const existing of existingTripleResults) {
    if (existing.term_id) {
      const key = `${existing.subject_id}-${existing.predicate_id}-${existing.object_id}`;
      tripleIdMap.set(key, existing.term_id);
    }
  }

  const newTripleEntries: TripleEntry[] = [];

  for (const entry of tripleEntries) {
    const key = `${entry.subjectAtomId}-${entry.predicateAtomId}-${entry.objectAtomId}`;
    const existingId = tripleIdMap.get(key);
    if (existingId) {
      resolvedByIndex[entry.index] = {
        proposalId: entry.proposalId,
        role: entry.role,
        subjectAtomId: entry.subjectAtomId,
        predicateAtomId: entry.predicateAtomId,
        objectAtomId: entry.objectAtomId,
        tripleTermId: existingId,
        isExisting: true,
      };
    } else {
      newTripleEntries.push(entry);
    }
  }

  // Create new triples (wallet TX)
  let tripleTxHash: string | null = null;

  if (newTripleEntries.length > 0) {
    try {
      const subjects = newTripleEntries.map((t) => asHexId(t.subjectAtomId)!);
      const predicates = newTripleEntries.map((t) => asHexId(t.predicateAtomId)!);
      const objects = newTripleEntries.map((t) => asHexId(t.objectAtomId)!);

      if (subjects.some((s) => !s) || predicates.some((p) => !p) || objects.some((o) => !o)) {
        throw new PublishStepError("triple_creation_failed", labels.errorTripleCreation);
      }

      const mvConfig = await multiVaultMultiCallIntuitionConfigs(sdkReadConfig(ctx.writeConfig));
      const costPerTriple = BigInt(mvConfig.triple_cost) + BigInt(mvConfig.min_deposit);
      const deposits = Array(newTripleEntries.length).fill(costPerTriple) as bigint[];
      const totalValue = costPerTriple * BigInt(newTripleEntries.length);

      tripleTxHash = await multiVaultCreateTriples(sdkWriteConfig(ctx.writeConfig), {
        args: [subjects as Hex[], predicates as Hex[], objects as Hex[], deposits],
        value: totalValue,
      });

      const events = await eventParseTripleCreated(ctx.writeConfig.publicClient, tripleTxHash as Hex);
      for (let i = 0; i < newTripleEntries.length; i++) {
        const termId = events[i]?.args?.termId;
        const entry = newTripleEntries[i];
        if (termId) {
          resolvedByIndex[entry.index] = {
            proposalId: entry.proposalId,
            role: entry.role,
            subjectAtomId: entry.subjectAtomId,
            predicateAtomId: entry.predicateAtomId,
            objectAtomId: entry.objectAtomId,
            tripleTermId: String(termId),
            isExisting: false,
          };
        } else {
          throw new PublishStepError("triple_creation_failed", labels.errorTripleCreation);
        }
      }
    } catch (error) {
      if (error instanceof PublishStepError) throw error;
      throw new PublishStepError("triple_creation_failed", labels.errorTripleCreation);
    }
  }

  return { tripleTxHash };
}

// ─── Step 4: resolveStanceTriple ────────────────────────────────────────
//
// Creates or reuses the stance triple for reply posts:
//   [replyMainTriple | STANCE_ATOM | parentMainTriple]
//
// Pushes the resolved stance triple at the end of resolvedByIndex.

export async function resolveStanceTriple(params: {
  mainTripleTermId: string;
  mainProposalId: string;
  stance: Stance;
  parentMainTripleTermId: string;
  resolvedByIndex: Array<ResolvedTriple | null>;
  ctx: StepContext;
}): Promise<{ stanceTxHash: string | null }> {
  const { mainTripleTermId, mainProposalId, stance, parentMainTripleTermId, resolvedByIndex, ctx } = params;

  const stanceAtomId = getStanceAtomId(stance);
  const stanceTripleQuery: [string, string, string] = [
    mainTripleTermId,
    stanceAtomId,
    parentMainTripleTermId,
  ];

  let stanceTxHash: string | null = null;

  try {
    const existingStanceTriples = await findTripleIds(ctx.accountAddress, [stanceTripleQuery]);
    const existingStanceTripleId = existingStanceTriples[0]?.term_id;

    if (existingStanceTripleId) {
      resolvedByIndex.push({
        proposalId: `stance_${mainProposalId}`,
        role: "SUPPORTING",
        subjectAtomId: mainTripleTermId,
        predicateAtomId: stanceAtomId,
        objectAtomId: parentMainTripleTermId,
        tripleTermId: existingStanceTripleId,
        isExisting: true,
      });
    } else {
      const stanceSubject = asHexId(mainTripleTermId)!;
      const stancePredicate = asHexId(stanceAtomId)!;
      const stanceObject = asHexId(parentMainTripleTermId)!;

      if (!stanceSubject || !stancePredicate || !stanceObject) {
        throw new PublishStepError("stance_failed", labels.errorStanceCreation);
      }

      const mvConfig = await multiVaultMultiCallIntuitionConfigs(sdkReadConfig(ctx.writeConfig));
      const costPerTriple = BigInt(mvConfig.triple_cost) + BigInt(mvConfig.min_deposit);

      stanceTxHash = await multiVaultCreateTriples(sdkWriteConfig(ctx.writeConfig), {
        args: [
          [stanceSubject] as Hex[],
          [stancePredicate] as Hex[],
          [stanceObject] as Hex[],
          [costPerTriple],
        ],
        value: costPerTriple,
      });

      const stanceEvents = await eventParseTripleCreated(ctx.writeConfig.publicClient, stanceTxHash as Hex);
      const stanceTermId = stanceEvents[0]?.args?.termId;

      if (stanceTermId) {
        resolvedByIndex.push({
          proposalId: `stance_${mainProposalId}`,
          role: "SUPPORTING",
          subjectAtomId: mainTripleTermId,
          predicateAtomId: stanceAtomId,
          objectAtomId: parentMainTripleTermId,
          tripleTermId: String(stanceTermId),
          isExisting: false,
        });
      } else {
        throw new PublishStepError("stance_failed", labels.errorStanceCreation);
      }
    }
  } catch (error) {
    if (error instanceof PublishStepError) throw error;
    throw new PublishStepError("stance_failed", labels.errorStanceCreation);
  }

  return { stanceTxHash };
}

// ─── Step 4b: resolveStanceTriples (batch) ──────────────────────────────
//
// Batches N stance triples for multi-draft replies into 1 TX.
// Each entry: [draftMainTriple | STANCE_ATOM | parentMainTriple]

export type StanceEntry = {
  mainTripleTermId: string;
  mainProposalId: string;
  stance: Stance;
  parentMainTripleTermId: string;
};

export async function resolveStanceTriples(params: {
  entries: StanceEntry[];
  resolvedByIndex: Array<ResolvedTriple | null>;
  ctx: StepContext;
}): Promise<{ stanceTxHash: string | null }> {
  const { entries, resolvedByIndex, ctx } = params;

  if (entries.length === 0) return { stanceTxHash: null };

  const queries: Array<{ entry: StanceEntry; s: string; p: string; o: string }> = [];
  for (const entry of entries) {
    const stanceAtomId = getStanceAtomId(entry.stance);
    queries.push({
      entry,
      s: entry.mainTripleTermId,
      p: stanceAtomId,
      o: entry.parentMainTripleTermId,
    });
  }

  let stanceTxHash: string | null = null;

  try {
    const existingResults = await findTripleIds(
      ctx.accountAddress,
      queries.map((q) => [q.s, q.p, q.o] as [string, string, string]),
    );

    // Key-based matching (don't assume order matches input)
    const existingMap = new Map<string, string>();
    for (const result of existingResults) {
      if (result.term_id) {
        existingMap.set(`${result.subject_id}-${result.predicate_id}-${result.object_id}`, result.term_id);
      }
    }

    const toCreate: typeof queries = [];
    for (const q of queries) {
      const key = `${q.s}-${q.p}-${q.o}`;
      const existingId = existingMap.get(key);
      if (existingId) {
        resolvedByIndex.push({
          proposalId: `stance_${q.entry.mainProposalId}`,
          role: "SUPPORTING",
          subjectAtomId: q.s,
          predicateAtomId: q.p,
          objectAtomId: q.o,
          tripleTermId: existingId,
          isExisting: true,
        });
      } else {
        toCreate.push(q);
      }
    }

    if (toCreate.length > 0) {
      const subjects = toCreate.map((q) => asHexId(q.s)!);
      const predicates = toCreate.map((q) => asHexId(q.p)!);
      const objects = toCreate.map((q) => asHexId(q.o)!);

      if (subjects.some((s) => !s) || predicates.some((p) => !p) || objects.some((o) => !o)) {
        throw new PublishStepError("stance_failed", labels.errorStanceCreation);
      }

      const mvConfig = await multiVaultMultiCallIntuitionConfigs(sdkReadConfig(ctx.writeConfig));
      const costPerTriple = BigInt(mvConfig.triple_cost) + BigInt(mvConfig.min_deposit);
      const deposits = Array(toCreate.length).fill(costPerTriple) as bigint[];
      const totalValue = costPerTriple * BigInt(toCreate.length);

      stanceTxHash = await multiVaultCreateTriples(sdkWriteConfig(ctx.writeConfig), {
        args: [subjects as Hex[], predicates as Hex[], objects as Hex[], deposits],
        value: totalValue,
      });

      const events = await eventParseTripleCreated(ctx.writeConfig.publicClient, stanceTxHash as Hex);
      for (let i = 0; i < toCreate.length; i++) {
        const termId = events[i]?.args?.termId;
        if (!termId) throw new PublishStepError("stance_failed", labels.errorStanceCreation);
        resolvedByIndex.push({
          proposalId: `stance_${toCreate[i].entry.mainProposalId}`,
          role: "SUPPORTING",
          subjectAtomId: toCreate[i].s,
          predicateAtomId: toCreate[i].p,
          objectAtomId: toCreate[i].o,
          tripleTermId: String(termId),
          isExisting: false,
        });
      }
    }
  } catch (error) {
    if (error instanceof PublishStepError) throw error;
    throw new PublishStepError("stance_failed", labels.errorStanceCreation);
  }

  return { stanceTxHash };
}

// ─── Step 5: depositOnExistingTriples ───────────────────────────────────
//
// Deposits on all existing triples (deduplicated by tripleTermId).
// Returns the last txHash on success.

export async function depositOnExistingTriples(params: {
  triples: ResolvedTriple[];
  ctx: StepContext;
  minDeposit: bigint | null;
}): Promise<{ txHash: string }> {
  const { triples, ctx, minDeposit } = params;

  const uniqueTriples = Array.from(
    new Map(triples.map((triple) => [triple.tripleTermId, triple])).values(),
  );

  const txHashes: string[] = [];

  try {
    for (const triple of uniqueTriples) {
      const outcome = await depositToTripleMin({
        config: sdkWriteConfig(ctx.writeConfig),
        termId: triple.tripleTermId,
        amount: minDeposit ?? undefined,
      });

      if (!outcome.ok) {
        throw new PublishStepError("deposit_failed", outcome.error);
      }

      txHashes.push(outcome.txHash);
    }
  } catch (error) {
    if (error instanceof PublishStepError) throw error;
    throw new PublishStepError("deposit_failed", labels.errorDepositFailed);
  }

  return { txHash: txHashes[txHashes.length - 1] ?? "0x0" };
}

// ─── Step 3b: resolveNestedTriples ─────────────────────────────────────
//
// Resolves nested triples (modifiers, relations, conditionals) on-chain.
// MUST run AFTER resolveTriples (invariant I5) — needs resolvedTripleMap.

export async function resolveNestedTriples(params: {
  nestedProposals: NestedProposalDraft[];
  resolvedTripleMap: Map<string, string>;  // stableKey → tripleTermId
  atomMap: Map<string, string>;            // normalizedLabel → atomId
  ctx: StepContext;
}): Promise<{ resolvedNested: ResolvedNestedTriple[]; nestedTxHash: string | null }> {
  const { nestedProposals, resolvedTripleMap, atomMap, ctx } = params;

  if (nestedProposals.length === 0) {
    return { resolvedNested: [], nestedTxHash: null };
  }

  type NestedEntry = {
    nestedProposalId: string;
    subjectTermId: string;
    predicateTermId: string;
    objectTermId: string;
  };

  // Phase 1: resolve term IDs for each nested edge
  const entries: NestedEntry[] = [];
  for (const edge of nestedProposals) {
    const subjectId = resolveNestedRef(edge.subject, atomMap, resolvedTripleMap);
    const predicateId = atomMap.get(normalizeText(edge.predicate));
    const objectId = resolveNestedRef(edge.object, atomMap, resolvedTripleMap);

    if (!subjectId || !predicateId || !objectId) {
      const missing = [!subjectId && "subject", !predicateId && "predicate", !objectId && "object"].filter(Boolean).join(", ");
      throw new PublishStepError(
        "nested_resolution_failed",
        `${labels.errorNestedCreation} Unable to resolve ${missing} for context link "${edge.predicate}".`,
      );
    }

    entries.push({
      nestedProposalId: edge.id,
      subjectTermId: subjectId,
      predicateTermId: predicateId,
      objectTermId: objectId,
    });
  }

  // Phase 2: find existing triples on-chain
  let existingResults;
  try {
    const queries = entries.map(
      (e) => [e.subjectTermId, e.predicateTermId, e.objectTermId] as [string, string, string],
    );
    existingResults = await findTripleIds(ctx.accountAddress, queries);
  } catch {
    throw new PublishStepError("nested_resolution_failed", labels.errorNestedCreation);
  }

  const tripleIdMap = new Map<string, string>();
  for (const existing of existingResults) {
    if (existing.term_id) {
      tripleIdMap.set(`${existing.subject_id}-${existing.predicate_id}-${existing.object_id}`, existing.term_id);
    }
  }

  const resolvedNested: ResolvedNestedTriple[] = [];
  const newEntries: NestedEntry[] = [];

  for (const entry of entries) {
    const key = `${entry.subjectTermId}-${entry.predicateTermId}-${entry.objectTermId}`;
    const existingId = tripleIdMap.get(key);
    if (existingId) {
      resolvedNested.push({ ...entry, tripleTermId: existingId, isExisting: true });
    } else {
      newEntries.push(entry);
    }
  }

  // Phase 3: create new nested triples (wallet TX)
  let nestedTxHash: string | null = null;

  if (newEntries.length > 0) {
    try {
      const subjects = newEntries.map((e) => asHexId(e.subjectTermId)!);
      const predicates = newEntries.map((e) => asHexId(e.predicateTermId)!);
      const objects = newEntries.map((e) => asHexId(e.objectTermId)!);

      if (subjects.some((s) => !s) || predicates.some((p) => !p) || objects.some((o) => !o)) {
        throw new PublishStepError("nested_creation_failed", labels.errorNestedCreation);
      }

      const mvConfig = await multiVaultMultiCallIntuitionConfigs(sdkReadConfig(ctx.writeConfig));
      const costPerTriple = BigInt(mvConfig.triple_cost) + BigInt(mvConfig.min_deposit);
      const deposits = Array(newEntries.length).fill(costPerTriple) as bigint[];
      const totalValue = costPerTriple * BigInt(newEntries.length);

      nestedTxHash = await multiVaultCreateTriples(sdkWriteConfig(ctx.writeConfig), {
        args: [subjects as Hex[], predicates as Hex[], objects as Hex[], deposits],
        value: totalValue,
      });

      const events = await eventParseTripleCreated(ctx.writeConfig.publicClient, nestedTxHash as Hex);
      for (let i = 0; i < newEntries.length; i++) {
        const termId = events[i]?.args?.termId;
        if (!termId) {
          throw new PublishStepError("nested_creation_failed", labels.errorNestedCreation);
        }
        resolvedNested.push({ ...newEntries[i], tripleTermId: String(termId), isExisting: false });
      }
    } catch (error) {
      if (error instanceof PublishStepError) throw error;
      throw new PublishStepError("nested_creation_failed", labels.errorNestedCreation);
    }
  }

  return { resolvedNested, nestedTxHash };
}

function resolveNestedRef(
  ref: NestedTermRef,
  atomMap: Map<string, string>,
  resolvedTripleMap: Map<string, string>,
): string | undefined {
  if (ref.type === "atom") {
    return atomMap.get(normalizeText(ref.label));
  }
  return resolvedTripleMap.get(ref.tripleKey);
}

// ─── Step 6: resolveTagTriples ──────────────────────────────────────────
//
// Creates "has tag" triples for root posts: [main_triple | HAS_TAG | theme_atom]
// Pattern mirrors resolveStanceTriples — batch find + create, returns txHash.

export type TagEntry = {
  mainTripleTermId: string;
  mainProposalId: string;
  themeAtomTermId: string;
};

export async function resolveTagTriples(params: {
  entries: TagEntry[];
  ctx: StepContext;
}): Promise<{ tagTxHash: string | null }> {
  const { entries, ctx } = params;

  if (entries.length === 0) return { tagTxHash: null };

  // Deduplicate by (mainTriple + themeAtom) key
  const seen = new Set<string>();
  const uniqueEntries: TagEntry[] = [];
  for (const entry of entries) {
    const key = `${entry.mainTripleTermId}-${entry.themeAtomTermId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    uniqueEntries.push(entry);
  }

  const queries = uniqueEntries.map((e) => ({
    entry: e,
    s: e.mainTripleTermId,
    p: HAS_TAG_ATOM_ID,
    o: e.themeAtomTermId,
  }));

  let tagTxHash: string | null = null;

  try {
    const existingResults = await findTripleIds(
      ctx.accountAddress,
      queries.map((q) => [q.s, q.p, q.o] as [string, string, string]),
    );

    const existingMap = new Map<string, string>();
    for (const result of existingResults) {
      if (result.term_id) {
        existingMap.set(`${result.subject_id}-${result.predicate_id}-${result.object_id}`, result.term_id);
      }
    }

    const toCreate: typeof queries = [];
    for (const q of queries) {
      const key = `${q.s}-${q.p}-${q.o}`;
      if (!existingMap.has(key)) {
        toCreate.push(q);
      }
    }

    if (toCreate.length > 0) {
      const subjects = toCreate.map((q) => asHexId(q.s)!);
      const predicates = toCreate.map((q) => asHexId(q.p)!);
      const objects = toCreate.map((q) => asHexId(q.o)!);

      if (subjects.some((s) => !s) || predicates.some((p) => !p) || objects.some((o) => !o)) {
        throw new PublishStepError("triple_creation_failed", labels.errorTagCreation);
      }

      const mvConfig = await multiVaultMultiCallIntuitionConfigs(sdkReadConfig(ctx.writeConfig));
      const costPerTriple = BigInt(mvConfig.triple_cost) + BigInt(mvConfig.min_deposit);
      const deposits = Array(toCreate.length).fill(costPerTriple) as bigint[];
      const totalValue = costPerTriple * BigInt(toCreate.length);

      tagTxHash = await multiVaultCreateTriples(sdkWriteConfig(ctx.writeConfig), {
        args: [subjects as Hex[], predicates as Hex[], objects as Hex[], deposits],
        value: totalValue,
      });

      // We don't need to parse events here — tag triples aren't persisted to PostTripleLink
    }
  } catch (error) {
    if (error instanceof PublishStepError) throw error;
    throw new PublishStepError("triple_creation_failed", labels.errorTagCreation);
  }

  return { tagTxHash };
}
