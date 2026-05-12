import { intuitionGraphqlUrl } from "./intuition";

const CHUNK_SIZE = 200;

type GqlResponse<T> = { data?: T; errors?: Array<{ message: string }> };

async function gql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const res = await fetch(intuitionGraphqlUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Intuition GraphQL HTTP ${res.status}`);
  const payload = (await res.json()) as GqlResponse<T>;
  if (payload.errors?.length) throw new Error(`Intuition GraphQL: ${payload.errors[0].message}`);
  if (!payload.data) throw new Error("Intuition GraphQL: empty data");
  return payload.data;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

const COUNTER_TERMS_QUERY = `
  query CounterTermIds($termIds: [String!]!) {
    triples(where: { term_id: { _in: $termIds } }) {
      term_id
      counter_term_id
    }
  }
`;

export async function fetchCounterTermIds(termIds: string[]): Promise<Record<string, string | null>> {
  const unique = Array.from(new Set(termIds));
  if (unique.length === 0) return {};

  const result: Record<string, string | null> = {};
  for (const piece of chunk(unique, CHUNK_SIZE)) {
    const data = await gql<{ triples: Array<{ term_id: string; counter_term_id: string | null }> }>(
      COUNTER_TERMS_QUERY,
      { termIds: piece },
    );
    for (const t of data.triples) result[t.term_id] = t.counter_term_id ?? null;
  }
  return result;
}

const HOLDER_PAIRS_QUERY = `
  query UniqueHoldersPerTerm($termIds: [String!]!) {
    positions(
      where: {
        term_id: { _in: $termIds }
        shares: { _gt: "0" }
        curve_id: { _eq: "1" }
      }
      distinct_on: [account_id, term_id]
    ) {
      account_id
      term_id
    }
  }
`;

export async function fetchHolderPairs(
  termIds: string[],
): Promise<Array<{ accountId: string; termId: string }>> {
  const unique = Array.from(new Set(termIds));
  if (unique.length === 0) return [];

  const out: Array<{ accountId: string; termId: string }> = [];
  for (const piece of chunk(unique, CHUNK_SIZE)) {
    const data = await gql<{ positions: Array<{ account_id: string; term_id: string }> }>(
      HOLDER_PAIRS_QUERY,
      { termIds: piece },
    );
    for (const p of data.positions) out.push({ accountId: p.account_id, termId: p.term_id });
  }
  return out;
}

export type ThumbvoteCounts = { support: number; oppose: number };

/**
 * Compute unique-holder thumbvote counts per post.
 *
 * For each post, given its triple termIds (MAIN + SUPPORTING):
 *  - `support` = number of unique wallets holding any of the post's termIds
 *  - `oppose` = number of unique wallets holding any of the corresponding counter_term_ids
 *
 * Throws on Intuition GraphQL failure — caller is expected to catch and fall back to null.
 */
export async function computeThumbvotesForPosts(
  posts: Array<{ id: string; termIds: string[] }>,
): Promise<Record<string, ThumbvoteCounts>> {
  if (posts.length === 0) return {};

  const allMyTermIds = Array.from(new Set(posts.flatMap((p) => p.termIds)));
  if (allMyTermIds.length === 0) {
    return Object.fromEntries(posts.map((p) => [p.id, { support: 0, oppose: 0 }]));
  }

  const counterMap = await fetchCounterTermIds(allMyTermIds);
  const supportIds = new Set(allMyTermIds);
  const opposeIds = new Set(
    Object.values(counterMap).filter((x): x is string => Boolean(x)),
  );
  const allIdsToQuery = [...supportIds, ...opposeIds];

  const pairs = await fetchHolderPairs(allIdsToQuery);

  const holdersByTermId = new Map<string, Set<string>>();
  for (const pair of pairs) {
    let set = holdersByTermId.get(pair.termId);
    if (!set) {
      set = new Set();
      holdersByTermId.set(pair.termId, set);
    }
    set.add(pair.accountId);
  }

  const result: Record<string, ThumbvoteCounts> = {};
  for (const post of posts) {
    const supportSet = new Set<string>();
    const opposeSet = new Set<string>();
    for (const termId of post.termIds) {
      holdersByTermId.get(termId)?.forEach((a) => supportSet.add(a));
      const counterId = counterMap[termId];
      if (counterId) holdersByTermId.get(counterId)?.forEach((a) => opposeSet.add(a));
    }
    result[post.id] = { support: supportSet.size, oppose: opposeSet.size };
  }
  return result;
}
