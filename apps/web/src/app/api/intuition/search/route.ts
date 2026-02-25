import { NextResponse } from "next/server";
import { globalSearch } from "@0xintuition/sdk";

import { ensureIntuitionGraphql, intuitionGraphqlUrl } from "@/lib/intuition";
import { asNumber } from "@/lib/format/asNumber";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Suggestion = {
  id: string;
  label: string;
  source: "global" | "semantic" | "graphql";
  marketCap?: number | null;
  holders?: number | null;
  shares?: number | null;
};

type TripleSuggestion = {
  id: string;
  subject: string;
  predicate: string;
  object: string;
  subjectId?: string | null;
  predicateId?: string | null;
  objectId?: string | null;
  source: "global" | "semantic" | "graphql";
  marketCap?: number | null;
  holders?: number | null;
  shares?: number | null;
  counterMarketCap?: number | null;
  counterHolders?: number | null;
  counterShares?: number | null;
};

type SearchPayload = {
  query?: string;
  limit?: number;
  kind?: "atom" | "triple";
  sLabel?: string;
  pLabel?: string;
  oLabel?: string;
};

type GraphqlAtom = {
  term_id?: string | null;
  label?: string | null;
  data?: string | null;
  term?: {
    vaults?: Array<{
      total_shares?: string | number | null;
      current_share_price?: string | number | null;
      position_count?: string | number | null;
      positions_aggregate?: {
        aggregate?: {
          count?: string | number | null;
          sum?: {
            shares?: string | number | null;
          } | null;
        } | null;
      } | null;
    }> | null;
  } | null;
};

const MIN_QUERY_LENGTH = 2;
const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 25;
const GRAPHQL_QUERY = `
  query FindAtoms($where: atoms_bool_exp, $limit: Int) {
    atoms(where: $where, limit: $limit) {
      term_id
      label
      data
      term {
        vaults(where: {curve_id: {_eq: "1"}}) {
          total_shares
          current_share_price
          position_count
          positions_aggregate {
            aggregate {
              count
              sum {
                shares
              }
            }
          }
        }
      }
    }
  }
`;

const GRAPHQL_TRIPLE_QUERY = `
  query FindTriples($where: triples_bool_exp, $limit: Int) {
    triples(where: $where, limit: $limit) {
      term_id
      subject { term_id label }
      predicate { term_id label }
      object { term_id label }
      term {
        vaults(where: {curve_id: {_eq: "1"}}) {
          total_shares
          current_share_price
          market_cap
          position_count
        }
      }
      counter_term {
        vaults(where: {curve_id: {_eq: "1"}}) {
          total_shares
          current_share_price
          market_cap
          position_count
        }
      }
    }
  }
`;

const GRAPHQL_SEMANTIC_QUERY = `
  query SemanticSearchAtoms($query: String!, $limit: Int) {
    search_term(args: {query: $query}, limit: $limit) {
      atom {
        term_id
        label
        data
        term {
          vaults(where: {curve_id: {_eq: "1"}}) {
            total_shares
            current_share_price
            position_count
          }
        }
      }
    }
  }
`;

type GraphqlTriple = {
  term_id?: string | null;
  subject?: { term_id?: string | null; label?: string | null } | null;
  predicate?: { term_id?: string | null; label?: string | null } | null;
  object?: { term_id?: string | null; label?: string | null } | null;
  term?: {
    vaults?: Array<{
      total_shares?: string | number | null;
      current_share_price?: string | number | null;
      market_cap?: string | number | null;
      position_count?: string | number | null;
    }> | null;
  } | null;
  counter_term?: {
    vaults?: Array<{
      total_shares?: string | number | null;
      current_share_price?: string | number | null;
      market_cap?: string | number | null;
      position_count?: string | number | null;
    }> | null;
  } | null;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}




function pickGlobalLabel(atom: {
  label?: string | null;
  value?: {
    text_object?: { data: string | null } | null;
    json_object?: { name?: unknown } | null;
    thing?: { name?: string | null } | null;
    person?: { name?: string | null } | null;
    organization?: { name?: string | null } | null;
  } | null;
}): string | null {
  if (atom.label) return atom.label;
  const text = atom.value?.text_object?.data ?? null;
  if (text) return text;
  // json_object.name comes from SemanticSearchDocument (data(path:"name"))
  const jsonName = atom.value?.json_object?.name;
  if (typeof jsonName === "string" && jsonName.trim()) return jsonName.trim();
  const thing = atom.value?.thing?.name ?? null;
  if (thing) return thing;
  const person = atom.value?.person?.name ?? null;
  if (person) return person;
  const org = atom.value?.organization?.name ?? null;
  if (org) return org;
  return null;
}

function mergeSuggestion(existing: Suggestion, incoming: Suggestion): Suggestion {
  const incomingLabel = incoming.label?.trim();
  const shouldReplaceLabel = Boolean(incomingLabel) &&
    (!existing.label ||
      existing.label === "—" ||
      (existing.label === existing.id && incomingLabel !== existing.id));

  return {
    ...existing,
    label: shouldReplaceLabel ? incomingLabel : existing.label,
    marketCap: existing.marketCap ?? incoming.marketCap ?? null,
    holders: existing.holders ?? incoming.holders ?? null,
    shares: existing.shares ?? incoming.shares ?? null,
  };
}

function mergeSuggestions(...groups: Suggestion[][]): Suggestion[] {
  const merged: Suggestion[] = [];
  const byId = new Map<string, Suggestion>();

  for (const group of groups) {
    for (const item of group) {
      const existing = byId.get(item.id);
      if (!existing) {
        byId.set(item.id, item);
        merged.push(item);
        continue;
      }
      const next = mergeSuggestion(existing, item);
      byId.set(item.id, next);
      const idx = merged.findIndex((entry) => entry.id === item.id);
      if (idx >= 0) merged[idx] = next;
    }
  }

  return merged;
}

async function fetchGraphqlAtoms(query: string, limit: number): Promise<GraphqlAtom[]> {
  try {
    const res = await fetch(intuitionGraphqlUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: GRAPHQL_QUERY,
        variables: {
          where: { label: { _ilike: `%${query}%` } },
          limit,
        },
      }),
      cache: "no-store",
    });

    if (!res.ok) return [];
    const payload = await res.json();
    return Array.isArray(payload?.data?.atoms) ? (payload.data.atoms as GraphqlAtom[]) : [];
  } catch {
    return [];
  }
}

async function fetchSemanticAtoms(query: string, limit: number): Promise<GraphqlAtom[]> {
  try {
    const res = await fetch(intuitionGraphqlUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: GRAPHQL_SEMANTIC_QUERY,
        variables: { query, limit },
      }),
      cache: "no-store",
    });

    if (!res.ok) return [];
    const payload = await res.json();
    const terms = payload?.data?.search_term;
    if (!Array.isArray(terms)) return [];
    return terms
      .map((t: { atom?: GraphqlAtom | null }) => t.atom)
      .filter((a: GraphqlAtom | null | undefined): a is GraphqlAtom => a != null);
  } catch {
    return [];
  }
}

async function fetchGraphqlTriples(
  sLabel: string,
  pLabel: string,
  oLabel: string,
  limit: number,
): Promise<GraphqlTriple[]> {
  const conditions: Record<string, unknown>[] = [];
  if (sLabel) conditions.push({ subject: { label: { _ilike: `%${sLabel}%` } } });
  if (pLabel) conditions.push({ predicate: { label: { _ilike: `%${pLabel}%` } } });
  if (oLabel) conditions.push({ object: { label: { _ilike: `%${oLabel}%` } } });

  if (conditions.length === 0) return [];

  try {
    const res = await fetch(intuitionGraphqlUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: GRAPHQL_TRIPLE_QUERY,
        variables: {
          where: conditions.length === 1 ? conditions[0] : { _and: conditions },
          limit,
        },
      }),
      cache: "no-store",
    });

    if (!res.ok) return [];
    const payload = await res.json();
    return Array.isArray(payload?.data?.triples) ? (payload.data.triples as GraphqlTriple[]) : [];
  } catch {
    return [];
  }
}

function graphqlTripleToSuggestion(triple: GraphqlTriple): TripleSuggestion | null {
  const id = triple.term_id;
  if (!id) return null;

  const subject = triple.subject?.label ?? "";
  const predicate = triple.predicate?.label ?? "";
  const object = triple.object?.label ?? "";
  if (!subject && !predicate && !object) return null;

  const vault = triple.term?.vaults?.[0] ?? null;
  const totalSharesNum = asNumber(vault?.total_shares ?? null);
  const sharePriceNum = asNumber(vault?.current_share_price ?? null);
  const holdersNum = asNumber(vault?.position_count ?? null);
  const marketCap =
    totalSharesNum !== null && sharePriceNum !== null
      ? (totalSharesNum / 1e18) * (sharePriceNum / 1e18)
      : null;

  const counterVault = triple.counter_term?.vaults?.[0] ?? null;
  const counterSharesNum = asNumber(counterVault?.total_shares ?? null);
  const counterPriceNum = asNumber(counterVault?.current_share_price ?? null);
  const counterHoldersNum = asNumber(counterVault?.position_count ?? null);
  const counterMarketCap =
    counterSharesNum !== null && counterPriceNum !== null
      ? (counterSharesNum / 1e18) * (counterPriceNum / 1e18)
      : null;

  return {
    id,
    subject,
    predicate,
    object,
    subjectId: triple.subject?.term_id ?? null,
    predicateId: triple.predicate?.term_id ?? null,
    objectId: triple.object?.term_id ?? null,
    source: "graphql" as const,
    marketCap,
    holders: holdersNum,
    shares: totalSharesNum,
    counterMarketCap,
    counterHolders: counterHoldersNum,
    counterShares: counterSharesNum,
  };
}

function mergeTripleSuggestions(...groups: TripleSuggestion[][]): TripleSuggestion[] {
  const merged: TripleSuggestion[] = [];
  const byId = new Map<string, TripleSuggestion>();

  for (const group of groups) {
    for (const item of group) {
      const existing = byId.get(item.id);
      if (!existing) {
        byId.set(item.id, item);
        merged.push(item);
        continue;
      }
      const next: TripleSuggestion = {
        ...existing,
        subject: existing.subject || item.subject,
        predicate: existing.predicate || item.predicate,
        object: existing.object || item.object,
        subjectId: existing.subjectId ?? item.subjectId,
        predicateId: existing.predicateId ?? item.predicateId,
        objectId: existing.objectId ?? item.objectId,
        marketCap: existing.marketCap ?? item.marketCap,
        holders: existing.holders ?? item.holders,
        shares: existing.shares ?? item.shares,
        counterMarketCap: existing.counterMarketCap ?? item.counterMarketCap,
        counterHolders: existing.counterHolders ?? item.counterHolders,
        counterShares: existing.counterShares ?? item.counterShares,
      };
      byId.set(item.id, next);
      const idx = merged.findIndex((entry) => entry.id === item.id);
      if (idx >= 0) merged[idx] = next;
    }
  }

  return merged;
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as SearchPayload | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const query = typeof body.query === "string" ? body.query.trim() : "";
  if (query.length < MIN_QUERY_LENGTH) {
    return NextResponse.json({ suggestions: [] });
  }

  const limit =
    typeof body.limit === "number" && Number.isFinite(body.limit)
      ? clamp(Math.floor(body.limit), 1, MAX_LIMIT)
      : DEFAULT_LIMIT;

  try {
    ensureIntuitionGraphql();

    const kind = body.kind ?? "atom";

    if (kind === "triple") {
      const sLabel = typeof body.sLabel === "string" ? body.sLabel.trim() : "";
      const pLabel = typeof body.pLabel === "string" ? body.pLabel.trim() : "";
      const oLabel = typeof body.oLabel === "string" ? body.oLabel.trim() : "";

      const [globalResult, graphqlTriples] = await Promise.all([
        globalSearch(query, {
          atomsLimit: 0,
          accountsLimit: 0,
          triplesLimit: limit,
          collectionsLimit: 0,
        }),
        (sLabel || pLabel || oLabel)
          ? fetchGraphqlTriples(sLabel, pLabel, oLabel, limit)
          : Promise.resolve([]),
      ]);

      const globalTriples: TripleSuggestion[] = (globalResult?.triples ?? [])
        .map((triple) => {
          const subjectLabel = triple.subject?.label ?? "";
          const predicateLabel = triple.predicate?.label ?? "";
          const objectLabel = triple.object?.label ?? "";
          const vault = triple.term?.vaults?.[0] ?? null;
          const totalSharesNum = asNumber(vault?.total_shares ?? null);
          const sharePriceNum = asNumber(vault?.current_share_price ?? null);
          const holdersNum = asNumber(vault?.position_count ?? null);
          const marketCap =
            totalSharesNum !== null && sharePriceNum !== null
              ? (totalSharesNum / 1e18) * (sharePriceNum / 1e18)
              : null;

          const counterVault = triple.counter_term?.vaults?.[0] ?? null;
          const counterSharesNum = asNumber(counterVault?.total_shares ?? null);
          const counterPriceNum = asNumber(counterVault?.current_share_price ?? null);
          const counterHoldersNum = asNumber(counterVault?.position_count ?? null);
          const counterMarketCap =
            counterSharesNum !== null && counterPriceNum !== null
              ? (counterSharesNum / 1e18) * (counterPriceNum / 1e18)
              : null;

          return {
            id: triple.term_id,
            subject: subjectLabel,
            predicate: predicateLabel,
            object: objectLabel,
            subjectId: triple.subject?.term_id ?? null,
            predicateId: triple.predicate?.term_id ?? null,
            objectId: triple.object?.term_id ?? null,
            source: "global" as const,
            marketCap,
            holders: holdersNum,
            shares: totalSharesNum,
            counterMarketCap,
            counterHolders: counterHoldersNum,
            counterShares: counterSharesNum,
          };
        })
        .filter((item) => Boolean(item.id && item.subject && item.predicate && item.object));

      const graphqlSuggs: TripleSuggestion[] = graphqlTriples
        .map(graphqlTripleToSuggestion)
        .filter((item): item is TripleSuggestion => item !== null);

      const triples = mergeTripleSuggestions(graphqlSuggs, globalTriples);
      return NextResponse.json({ triples });
    }

    const [globalResult, graphqlAtoms, semanticAtomResults] = await Promise.all([
      globalSearch(query, {
        atomsLimit: limit,
        accountsLimit: 0,
        triplesLimit: 0,
        collectionsLimit: 0,
      }),
      fetchGraphqlAtoms(query, limit),
      fetchSemanticAtoms(query, limit).catch((err) => {
        console.error("[intuition/search] semantic search failed:", err);
        return [] as GraphqlAtom[];
      }),
    ]);

    const globalAtoms: Suggestion[] = (globalResult?.atoms ?? []).flatMap((atom) => {
      const label = pickGlobalLabel(atom);
      if (!label || label.startsWith("0x")) return [];
      return [{ id: atom.term_id, label, source: "global" as const }];
    });

    const semanticAtoms: Suggestion[] = semanticAtomResults.flatMap((atom) => {
      const label = pickGlobalLabel(atom);
      if (!label || label.startsWith("0x")) return [];
      const id = typeof atom.term_id === "string" ? atom.term_id : "";
      if (!id) return [];

      const vault = atom?.term?.vaults?.[0] ?? null;
      const totalSharesNum = asNumber(vault?.total_shares ?? null);
      const sharePriceNum = asNumber(vault?.current_share_price ?? null);
      const holdersNum = asNumber(vault?.position_count ?? null);
      const marketCap =
        totalSharesNum !== null && sharePriceNum !== null
          ? (totalSharesNum / 1e18) * (sharePriceNum / 1e18)
          : null;

      return [{
        id,
        label,
        source: "semantic" as const,
        marketCap,
        holders: holdersNum,
        shares: totalSharesNum,
      }];
    });

    const graphqlSuggestions: Suggestion[] = (graphqlAtoms ?? [])
      .map((atom) => {
        const rawLabel = atom?.label ?? atom?.data ?? "";
        const label = typeof rawLabel === "string" ? rawLabel.trim() : "";
        const vault = atom?.term?.vaults?.[0] ?? null;
        const totalSharesRaw = vault?.total_shares ?? null;
        const holdersRaw =
          vault?.position_count ?? vault?.positions_aggregate?.aggregate?.count ?? null;
        const sharesRaw =
          vault?.positions_aggregate?.aggregate?.sum?.shares ?? totalSharesRaw ?? null;
        const currentSharePriceRaw = vault?.current_share_price ?? null;

        const totalSharesNum = asNumber(totalSharesRaw);
        const sharePriceNum = asNumber(currentSharePriceRaw);
        const holdersNum = asNumber(holdersRaw);
        const sharesNum = asNumber(sharesRaw);
        const marketCap =
          totalSharesNum !== null && sharePriceNum !== null
            ? (totalSharesNum / 1e18) * (sharePriceNum / 1e18)
            : null;

        const id = typeof atom.term_id === "string" ? atom.term_id : "";

        return {
          id,
          label,
          source: "graphql" as const,
          marketCap,
          holders: holdersNum,
          shares: sharesNum,
        };
      })
      .filter((item: Suggestion) => Boolean(item.id && item.label));

    const suggestions = mergeSuggestions(graphqlSuggestions, globalAtoms, semanticAtoms);
    return NextResponse.json({ suggestions });
  } catch {
    return NextResponse.json(
      { error: "Intuition search failed.", suggestions: [] },
      { status: 502 }
    );
  }
}
