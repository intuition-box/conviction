import { config as loadDotenv } from "dotenv";

loadDotenv({ path: ".env" });

const ENDPOINT =
  process.env.INTUITION_GRAPHQL_URL ??
  process.env.NEXT_PUBLIC_INTUITION_GRAPHQL_URL ??
  "https://mainnet.intuition.sh/v1/graphql";

type GqlResponse<T> = { data?: T; errors?: Array<{ message: string }> };

async function gql<T>(query: string, variables: Record<string, unknown> = {}): Promise<GqlResponse<T>> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  return (await res.json()) as GqlResponse<T>;
}

function ok(label: string, msg: string) {
  console.log(`  ✅ ${label} — ${msg}`);
}

function fail(label: string, msg: string) {
  console.log(`  ❌ ${label} — ${msg}`);
}

function info(msg: string) {
  console.log(`  ℹ️  ${msg}`);
}

// ── Step 0: find an active address (top positions) to use for downstream queries ──

async function findActiveAddress(): Promise<string | null> {
  console.log("\n[0] Find an active address with positions");
  const r = await gql<{ positions: Array<{ account_id: string; shares: string }> }>(
    `query FindActive { positions(where: { shares: { _gt: "0" } }, order_by: { shares: desc }, limit: 1) { account_id shares } }`,
  );
  if (r.errors?.length) {
    fail("query", r.errors[0].message);
    return null;
  }
  const addr = r.data?.positions?.[0]?.account_id ?? null;
  if (!addr) {
    fail("query", "no positions found on this network");
    return null;
  }
  ok("query", `picked ${addr}`);
  return addr;
}

// ── Query A: portfolio for an account ──

async function queryA(addr: string): Promise<{ termId: string; counterTermId: string | null } | null> {
  console.log("\n[A] Portfolio query: positions(where: account_id = $addr)");
  const r = await gql<{
    positions: Array<{
      id: string;
      shares: string;
      vault: {
        term_id: string;
        curve_id: string;
        current_share_price: string | null;
        term: {
          atom: { term_id: string; label: string | null } | null;
          triple: {
            term_id: string;
            counter_term_id: string | null;
            subject: { label: string | null } | null;
            predicate: { label: string | null } | null;
            object: { label: string | null } | null;
          } | null;
        } | null;
      };
    }>;
  }>(
    `query GetUserPositions($addr: String!, $limit: Int!) {
       positions(
         where: { account_id: { _eq: $addr }, shares: { _gt: "0" } }
         limit: $limit
         order_by: { shares: desc }
       ) {
         id
         shares
         vault {
           term_id
           curve_id
           current_share_price
           term {
             atom { term_id label }
             triple {
               term_id
               counter_term_id
               subject { label }
               predicate { label }
               object { label }
             }
           }
         }
       }
     }`,
    { addr, limit: 5 },
  );

  if (r.errors?.length) {
    fail("Query A", r.errors[0].message);
    return null;
  }
  const positions = r.data?.positions ?? [];
  ok("Query A", `returned ${positions.length} positions`);

  if (positions.length === 0) return null;

  const sample = positions[0];
  const hasSharePrice = sample.vault.current_share_price !== null && sample.vault.current_share_price !== "";
  if (hasSharePrice) ok("vault.current_share_price", `${sample.vault.current_share_price}`);
  else fail("vault.current_share_price", "field is null or missing");

  // Try to find a triple position for downstream queries (atoms have no counter_term_id)
  const triplePos = positions.find((p) => p.vault.term?.triple);
  if (triplePos) {
    const t = triplePos.vault.term!.triple!;
    ok(
      "vault.term.triple",
      `term_id=${t.term_id.slice(0, 12)}…, counter_term_id=${t.counter_term_id?.slice(0, 12) ?? "null"}…`,
    );
    return { termId: t.term_id, counterTermId: t.counter_term_id };
  }
  info("no triple position in top 5 — Queries B/C will use a discovered triple");
  return null;
}

// ── Query B1: distinct_on [account_id, vault_term_id] ──

async function queryB1(termIds: string[]): Promise<boolean> {
  console.log("\n[B1] distinct_on: [account_id, term_id] (positions has direct term_id column)");
  const r = await gql<{
    positions: Array<{ account_id: string; term_id: string }>;
  }>(
    `query UniqueHoldersPerVault($termIds: [String!]!) {
       positions(
         where: { term_id: { _in: $termIds }, shares: { _gt: "0" } }
         distinct_on: [account_id, term_id]
       ) {
         account_id
         term_id
       }
     }`,
    { termIds },
  );

  if (r.errors?.length) {
    fail("Query B1", r.errors[0].message);
    return false;
  }
  const rows = r.data?.positions ?? [];
  ok("Query B1", `returned ${rows.length} (account, term) pairs`);
  return true;
}

// ── Query B2: distinct_on [account_id] ──

async function queryB2(termIds: string[]): Promise<boolean> {
  console.log("\n[B2] distinct_on: [account_id]");
  const r = await gql<{ positions: Array<{ account_id: string }> }>(
    `query UniqueHolders($termIds: [String!]!) {
       positions(
         where: { term_id: { _in: $termIds }, shares: { _gt: "0" } }
         distinct_on: [account_id]
       ) {
         account_id
       }
     }`,
    { termIds },
  );

  if (r.errors?.length) {
    fail("Query B2", r.errors[0].message);
    return false;
  }
  const rows = r.data?.positions ?? [];
  ok("Query B2", `returned ${rows.length} unique account_ids`);
  return true;
}

// ── Query C: counter_term_id mapping ──

async function queryC(termIds: string[]): Promise<boolean> {
  console.log("\n[C] triples → counter_term_id mapping");
  const r = await gql<{
    triples: Array<{ term_id: string; counter_term_id: string | null }>;
  }>(
    `query CounterTermIds($termIds: [String!]!) {
       triples(where: { term_id: { _in: $termIds } }) {
         term_id
         counter_term_id
       }
     }`,
    { termIds },
  );

  if (r.errors?.length) {
    fail("Query C", r.errors[0].message);
    return false;
  }
  const rows = r.data?.triples ?? [];
  ok("Query C", `mapped ${rows.length}/${termIds.length} triples`);
  rows.slice(0, 2).forEach((t) => {
    info(`  ${t.term_id.slice(0, 12)}… → counter ${t.counter_term_id?.slice(0, 12) ?? "null"}…`);
  });
  return true;
}

// ── Main ──

async function main() {
  console.log(`Endpoint: ${ENDPOINT}`);

  const addr = await findActiveAddress();
  if (!addr) {
    console.error("\nCannot proceed without an active address.");
    process.exit(1);
  }

  const queryAResult = await queryA(addr);

  // Find at least one triple termId to test B/C — fall back to discovering one
  let tripleTermId: string | null = queryAResult?.termId ?? null;
  let counterTermId: string | null = queryAResult?.counterTermId ?? null;

  if (!tripleTermId) {
    console.log("\n[0b] Discover any triple termId for B/C tests");
    const r = await gql<{ triples: Array<{ term_id: string; counter_term_id: string | null }> }>(
      `query AnyTriple { triples(limit: 1) { term_id counter_term_id } }`,
    );
    tripleTermId = r.data?.triples?.[0]?.term_id ?? null;
    counterTermId = r.data?.triples?.[0]?.counter_term_id ?? null;
    if (tripleTermId) ok("discovered triple", tripleTermId.slice(0, 12) + "…");
  }

  if (!tripleTermId) {
    console.error("\nCannot find any triple to test B/C.");
    process.exit(1);
  }

  const ids: string[] = [tripleTermId, counterTermId].filter((x): x is string => Boolean(x));

  const b1 = await queryB1(ids);
  const b2 = await queryB2(ids);
  const c = await queryC([tripleTermId]);

  console.log("\n── Summary ──");
  console.log(`Query A (portfolio):        ${queryAResult !== null ? "OK ✅" : "EMPTY (acceptable shape)"}`);
  console.log(`Query B1 (per-vault dedup): ${b1 ? "OK ✅" : "FAIL ❌"}`);
  console.log(`Query B2 (per-account):     ${b2 ? "OK ✅" : "FAIL ❌"}`);
  console.log(`Query C (counter_term_id):  ${c ? "OK ✅" : "FAIL ❌"}`);
}

main().catch((err) => {
  console.error("Spike failed with exception:", err);
  process.exit(1);
});
