export type ID = string;

export type Stance = "supports" | "refutes";

export type TermRef =
  | {
      type: "atom";
      atomKey: string;
      label: string; // canonical label (normalized)
    }
  | {
      type: "triple";
      tripleKey: string;
      label?: string; // human-readable "S · P · O" for display
    };

export type TermRefId = `atom:${string}` | `triple:${string}`;

/**
 * A Triple is the ONLY semantic primitive.
 * Nested statements are also Triples.
 */
export type Triple = {
  subject: TermRef;
  predicate: TermRef; // MUST be an atom ref
  object: TermRef;

  stableKey: string; // keccak(triple:...)
  origin?: "app" | "agent" | "user" | "import" | "seed";
  createdAt?: number;
};

// --- Nested edges (extraction-time) ---

export type NestedEdgeKind = "relation" | "meta" | "conditional" | "modifier";
export type NestedEdgeOrigin = "agent" | "user";

/**
 * A NestedEdge is a lightweight extracted relation between two TermRefs.
 * (Different from storing stance as a Triple in Neo4j; but hashes the same way: from/predicate/to).
 */
export type NestedEdge = {
  kind: NestedEdgeKind;
  origin: NestedEdgeOrigin;

  // textual predicate ("supports", "if", "said", etc.) — hashed as an atom TermRef when building stableKey
  predicate: string;

  subject: TermRef; // from
  object: TermRef;  // to

  stableKey: string; // keccak(edge:...)
};

/**
 * Post is a purely editorial container.
 * It NEVER defines graph structure.
 * A Post (claim) always has a MAIN triple in the DB layer.
 */
export type Post = {
  id: ID;
  text: string;

  // Navigation / focus helper
  mainTripleKey?: string;

  // Extraction / validation lifecycle
  proposedTriples: Triple[];
  validatedTriples: Triple[];

  isValidated: boolean;
  createdAt: number;
};

/**
 * Topic is an optional grouping (theme).
 * It can have multiple root posts (threads) under the same theme.
 */
export type Topic = {
  id: ID;
  title?: string;
  createdAt: number;
};
