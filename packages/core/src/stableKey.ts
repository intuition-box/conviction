import { keccak256, toHex } from "viem";
import type { TermRef, TermRefId } from "./types.js";

export function normalizeKeyPart(s: string): string {
  return (s ?? "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function keccakText(input: string): string {
  return keccak256(toHex(input));
}

/**
 * Atom key from label
 */
export function atomKeyFromLabel(label: string): string {
  return keccakText(`atom:${normalizeKeyPart(label)}`);
}

/**
 * Serialize a TermRef into a stable id string
 */
export function termRefToId(ref: TermRef): TermRefId {
  if (ref.type === "atom") {
    return `atom:${ref.atomKey}`;
  }
  return `triple:${ref.tripleKey}`;
}

/**
 * Stable key for ANY triple (atomic or nested)
 */
export function stableKeyFromTripleParts(params: {
  subject: TermRef;
  predicate: TermRef; // must be atom
  object: TermRef;
}): string {
  const s = termRefToId(params.subject);
  const p = termRefToId(params.predicate);
  const o = termRefToId(params.object);

  return keccakText(`triple:${s}|${p}|${o}`);
}

/**
 * Alias ergonomique: stable key à partir d'un objet triple.
 */
export function stableKeyFromTriple(triple: {
  subject: TermRef;
  predicate: TermRef; // atom
  object: TermRef;
}): string {
  return stableKeyFromTripleParts({
    subject: triple.subject,
    predicate: triple.predicate,
    object: triple.object,
  });
}

/**
 * Stable key pour un "edge" (NestedEdge) / relation stance.
 * Objectif: keccak déterministe basé sur (from, predicate, to).
 *
 * NB: on encode volontairement la même structure que les triples,
 * mais avec un préfixe différent pour éviter collision éventuelle.
 */
export function stableKeyFromEdge(params: {
  from: TermRef;
  predicate: TermRef; // atom
  to: TermRef;
}): string {
  const s = termRefToId(params.from);
  const p = termRefToId(params.predicate);
  const o = termRefToId(params.to);

  return keccakText(`edge:${s}|${p}|${o}`);
}
