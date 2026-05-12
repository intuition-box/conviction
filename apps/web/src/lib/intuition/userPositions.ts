import { intuitionGraphqlUrl } from "./intuition";

const PORTFOLIO_PAGE_SIZE = 200;

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

type AtomValue = {
  text_object?: { data: string | null } | null;
  json_object?: { name?: unknown } | null;
  thing?: { name?: string | null } | null;
  person?: { name?: string | null } | null;
  organization?: { name?: string | null } | null;
} | null;

type AtomFragment = { term_id?: string; label?: string | null; value?: AtomValue };

function pickAtomLabel(atom: AtomFragment | null | undefined): string | null {
  if (!atom) return null;
  if (atom.label) return atom.label;
  const text = atom.value?.text_object?.data ?? null;
  if (text) return text;
  const jsonName = atom.value?.json_object?.name;
  if (typeof jsonName === "string" && jsonName.trim()) return jsonName.trim();
  return (
    atom.value?.thing?.name ??
    atom.value?.person?.name ??
    atom.value?.organization?.name ??
    null
  );
}

function composeTripleLabel(triple: {
  subject?: AtomFragment | null;
  predicate?: AtomFragment | null;
  object?: AtomFragment | null;
}): string {
  const parts = [
    pickAtomLabel(triple.subject),
    pickAtomLabel(triple.predicate),
    pickAtomLabel(triple.object),
  ].filter((s): s is string => Boolean(s));
  return parts.join(" · ");
}

function toBigInt(v: string | number | null | undefined): bigint {
  if (v === null || v === undefined || v === "") return 0n;
  try {
    return typeof v === "bigint" ? v : BigInt(typeof v === "number" ? Math.trunc(v) : v);
  } catch {
    return 0n;
  }
}

const ATOM_VALUE_FIELDS = `
  text_object { data }
  json_object { name }
  thing { name }
  person { name }
  organization { name }
`;

const USER_POSITIONS_QUERY = `
  query UserPositions($addr: String!, $limit: Int!, $offset: Int!) {
    positions(
      where: {
        account_id: { _eq: $addr }
        shares: { _gt: "0" }
        curve_id: { _eq: "1" }
      }
      limit: $limit
      offset: $offset
      order_by: { shares: desc }
    ) {
      id
      shares
      term_id
      vault {
        term_id
        current_share_price
        term {
          atom { term_id label value { ${ATOM_VALUE_FIELDS} } }
          triple {
            term_id
            counter_term_id
            subject { term_id label value { ${ATOM_VALUE_FIELDS} } }
            predicate { term_id label value { ${ATOM_VALUE_FIELDS} } }
            object { term_id label value { ${ATOM_VALUE_FIELDS} } }
          }
        }
      }
    }
  }
`;

type RawPosition = {
  id: string;
  shares: string | number | null;
  term_id: string;
  vault: {
    term_id: string;
    current_share_price: string | number | null;
    term: {
      atom: AtomFragment | null;
      triple:
        | {
            term_id: string;
            counter_term_id: string | null;
            subject: AtomFragment | null;
            predicate: AtomFragment | null;
            object: AtomFragment | null;
          }
        | null;
    } | null;
  };
};

export type UserPosition = {
  termId: string;
  /** shares held by the account, in wei (18 decimals) */
  shares: bigint;
  /** current share price, in wei per share (18 decimals) */
  currentSharePrice: bigint;
  /** valueWei = shares × currentSharePrice / 1e18 */
  valueWei: bigint;
  label: string;
  kind: "atom" | "triple";
  counterTermId: string | null;
};

const WEI = 10n ** 18n;

function rawToPosition(raw: RawPosition): UserPosition {
  const shares = toBigInt(raw.shares);
  const currentSharePrice = toBigInt(raw.vault.current_share_price);
  const valueWei = (shares * currentSharePrice) / WEI;

  let label = raw.term_id;
  let kind: "atom" | "triple" = "atom";
  let counterTermId: string | null = null;

  const triple = raw.vault.term?.triple;
  const atom = raw.vault.term?.atom;

  if (triple) {
    kind = "triple";
    const composed = composeTripleLabel(triple);
    if (composed) label = composed;
    counterTermId = triple.counter_term_id;
  } else if (atom) {
    kind = "atom";
    const atomLabel = pickAtomLabel(atom);
    if (atomLabel) label = atomLabel;
  }

  return {
    termId: raw.term_id,
    shares,
    currentSharePrice,
    valueWei,
    label,
    kind,
    counterTermId,
  };
}

export async function fetchUserPositions(
  address: string,
  opts: { limit: number; offset: number },
): Promise<UserPosition[]> {
  const data = await gql<{ positions: RawPosition[] }>(USER_POSITIONS_QUERY, {
    addr: address,
    limit: opts.limit,
    offset: opts.offset,
  });
  return data.positions.map(rawToPosition);
}

export async function sumPortfolioValue(address: string): Promise<bigint> {
  let total = 0n;
  let offset = 0;
  while (true) {
    const page = await fetchUserPositions(address, {
      limit: PORTFOLIO_PAGE_SIZE,
      offset,
    });
    for (const p of page) total += p.valueWei;
    if (page.length < PORTFOLIO_PAGE_SIZE) break;
    offset += PORTFOLIO_PAGE_SIZE;
  }
  return total;
}
