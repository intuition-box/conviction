import "server-only";

import { parseVaultMetrics } from "@/lib/intuition/metrics";
import { asNumber } from "@/lib/format/asNumber";
import { fetchTripleDetailsBatch, type GraphqlDeepTriple } from "@/lib/intuition/graphql-queries";
import type { MatchedTree } from "@/features/post/ExtractionWorkspace/extraction/types";

export type IntuitionAtom = {
  term_id?: string | null;
  label?: string | null;
  data?: string | null;
};

type TripleDetails = {
  term_id?: string | null;
  subject_id?: string | null;
  predicate_id?: string | null;
  object_id?: string | null;
  counter_term_id?: string | null;
  subject?: IntuitionAtom | null;
  predicate?: IntuitionAtom | null;
  object?: IntuitionAtom | null;
  term?: {
    vaults?: Array<{
      total_shares?: string | number | null;
      current_share_price?: string | number | null;
      market_cap?: string | number | null;
      position_count?: string | number | null;
      allPositions?: {
        aggregate?: { count?: string | number | null } | null;
      } | null;
    }> | null;
  } | null;
};

export type ResolvedTripleShape = {
  termId: string;
  subject: string;
  predicate: string;
  object: string;
  counterTermId: string | null;
  marketCap: number | null;
  holders: number | null;
  shares: number | null;
  subjectNested?: ResolvedTripleShape | null;
  objectNested?: ResolvedTripleShape | null;
};

export function atomLabel(atom: { label?: string | null; data?: string | null } | null | undefined): string {
  return atom?.label || atom?.data || "Unknown";
}

export function mapTripleShape(details: TripleDetails): ResolvedTripleShape {
  const vault = details.term?.vaults?.[0];
  const metrics = parseVaultMetrics(vault);
  const holdersOverride = asNumber(
    vault?.allPositions?.aggregate?.count ?? null,
  );
  return {
    termId: String(details.term_id ?? ""),
    subject: atomLabel(details.subject),
    predicate: atomLabel(details.predicate),
    object: atomLabel(details.object),
    counterTermId: details.counter_term_id ?? null,
    marketCap: metrics.marketCap,
    holders: holdersOverride ?? metrics.holders,
    shares: metrics.shares,
  };
}

function graphqlTripleToShape(t: GraphqlDeepTriple): ResolvedTripleShape {
  const vault = t.term?.vaults?.[0];
  const metrics = parseVaultMetrics(vault);
  return {
    termId: t.term_id ? String(t.term_id) : "",
    subject: t.subject?.label || "Unknown",
    predicate: t.predicate?.label || "Unknown",
    object: t.object?.label || "Unknown",
    counterTermId: t.counter_term_id ? String(t.counter_term_id) : null,
    marketCap: metrics.marketCap,
    holders: metrics.holders,
    shares: metrics.shares,
  };
}

export function toMatchedTree(shape: ResolvedTripleShape): MatchedTree {
  const subjectNested = shape.subjectNested ? toMatchedTree(shape.subjectNested) : null;
  const objectNested = shape.objectNested ? toMatchedTree(shape.objectNested) : null;
  return {
    termId: shape.termId || undefined,
    subject: subjectNested ? subjectNested.subject : shape.subject,
    predicate: shape.predicate,
    object: objectNested ? objectNested.object : shape.object,
    subjectNested,
    objectNested,
  };
}

/**
 * Resolve a triple's nested sub-triples using batch GraphQL queries.
 * One query per depth level (max 4). Returns a recursive tree.
 */
export async function resolveTripleDeep(
  rootDetails: TripleDetails,
  maxDepth = 4,
): Promise<{ subjectNested: ResolvedTripleShape | null; objectNested: ResolvedTripleShape | null }> {
  const allTriples = new Map<string, { shape: ResolvedTripleShape; subjectId: string | null; objectId: string | null }>();

  let candidateIds = [rootDetails.subject_id, rootDetails.object_id]
    .filter(Boolean)
    .map(String);

  for (let depth = 0; depth < maxDepth && candidateIds.length > 0; depth++) {
    const batch = await fetchTripleDetailsBatch(candidateIds);
    const nextCandidates: string[] = [];

    for (const t of batch) {
      const termId = t.term_id ? String(t.term_id) : null;
      if (!termId || allTriples.has(termId)) continue;

      const shape = graphqlTripleToShape(t);
      const subjectId = t.subject_id ? String(t.subject_id) : null;
      const objectId = t.object_id ? String(t.object_id) : null;
      allTriples.set(termId, { shape, subjectId, objectId });

      for (const childId of [subjectId, objectId]) {
        if (childId && !allTriples.has(childId)) {
          nextCandidates.push(childId);
        }
      }
    }

    candidateIds = [...new Set(nextCandidates)];
  }

  function buildTree(atomId: string | null): ResolvedTripleShape | null {
    if (!atomId) return null;
    const entry = allTriples.get(atomId);
    if (!entry) return null;
    const subjectNested = buildTree(entry.subjectId);
    const objectNested = buildTree(entry.objectId);
    return {
      ...entry.shape,
      subject: subjectNested ? subjectNested.subject : entry.shape.subject,
      object: objectNested ? objectNested.object : entry.shape.object,
      subjectNested,
      objectNested,
    };
  }

  return {
    subjectNested: buildTree(rootDetails.subject_id ? String(rootDetails.subject_id) : null),
    objectNested: buildTree(rootDetails.object_id ? String(rootDetails.object_id) : null),
  };
}
