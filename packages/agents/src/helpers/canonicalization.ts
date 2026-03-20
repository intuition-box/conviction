import { normalize, tokenSimilarity } from "../utils/similarity.js";

import { parseCausal } from "./parse.js";
import { trackFallback } from "./fallbackTracker.js";
import { shouldSplitOnAnd } from "./andSplitClassifier.js";
import {
  CLAIM_DEDUP_THRESHOLD,
  TRIPLE_DEDUP_THRESHOLD,
  REPLY_PARENT_MATCH_THRESHOLD,
  COMPOUND_CONDITIONAL_KW,
} from "./rules/extractionRules.js";
import type { DecomposedClaim, FlatTriple } from "../types.js";
import type { ClaimPlan, GraphResult } from "./claimPlanner.js";

export function fixCompoundPredicate(core: FlatTriple): FlatTriple {
  const oLower = core.object.toLowerCase();
  const pLower = core.predicate.toLowerCase();

  for (const kw of Object.keys(COMPOUND_CONDITIONAL_KW)) {
    const parts = kw.split(" ");

    // Pattern 1: P ends with first part, O starts with second part
    // "works only" + "when citizens are educated"
    if (parts.length === 2
      && pLower.endsWith(" " + parts[0])
      && oLower.startsWith(parts[1] + " ")) {
      return {
        subject: core.subject,
        predicate: core.predicate + " " + core.object.slice(0, parts[1].length),
        object: core.object.slice(parts[1].length).trim(),
      };
    }

    // Pattern 2: O starts with full compound keyword
    // "works" + "only when citizens are educated"
    if (oLower.startsWith(kw + " ")) {
      return {
        subject: core.subject,
        predicate: core.predicate + " " + core.object.slice(0, kw.length),
        object: core.object.slice(kw.length).trim(),
      };
    }
  }

  return core;
}

export function areTriplesDuplicate(a: FlatTriple, b: FlatTriple, threshold = TRIPLE_DEDUP_THRESHOLD): boolean {
  return (
    tokenSimilarity(normalize(a.subject), normalize(b.subject)) >= threshold &&
    tokenSimilarity(normalize(a.predicate), normalize(b.predicate)) >= threshold &&
    tokenSimilarity(normalize(a.object), normalize(b.object)) >= threshold
  );
}

function deduplicateClaimsStructured(claims: DecomposedClaim[], threshold = CLAIM_DEDUP_THRESHOLD): DecomposedClaim[] {
  const kept: DecomposedClaim[] = [];
  for (const claim of claims) {
    const text = claim.text.trim();
    if (!text) continue;
    const isDup = kept.some(
      (k) => tokenSimilarity(normalize(k.text), normalize(text)) >= threshold,
    );
    if (!isDup) kept.push(claim);
  }
  return kept;
}

export type CanonicalizePreGraphOptions = {
  parentClaimText?: string | null;
  sourceSentence?: string | null;
};

const REPLY_CAUSAL_COREF_RE = /^it\s+/i;

function extractMainSubject(text: string): string | null {
  const m = text.match(
    /^(.+?)\s+(?:is|are|was|were|has|have|had|can|will|shall|should|must|may|might|could|would|do|does|did)\b/i,
  );
  return m?.[1]?.trim() || null;
}

function projectReplyCausalToReasons(
  claims: DecomposedClaim[],
  parentClaimText?: string | null,
): DecomposedClaim[] {
  const parentNorm = normalize(parentClaimText ?? "");
  if (!parentNorm) return claims;

  return claims.map((claim) => {
    if (claim.role !== "MAIN") return claim;

    const causal = parseCausal(claim.text);
    if (!causal) return claim;

    const similarity = tokenSimilarity(normalize(causal.mainText), parentNorm);
    if (similarity < REPLY_PARENT_MATCH_THRESHOLD) return claim;

    let reason = causal.reasonText.trim();
    if (REPLY_CAUSAL_COREF_RE.test(reason)) {
      const subject = extractMainSubject(causal.mainText);
      if (subject) {
        reason = reason.replace(REPLY_CAUSAL_COREF_RE, `${subject} `);
      }
    }

    return { ...claim, text: reason.trim() };
  });
}

function splitCompoundAndClaims(claims: DecomposedClaim[]): DecomposedClaim[] {
  let nextGroup = claims.length > 0 ? Math.max(...claims.map((c) => c.group)) + 1 : 0;
  const out: DecomposedClaim[] = [];

  for (const claim of claims) {
    if (claim.role !== "MAIN") {
      out.push(claim);
      continue;
    }

    const result = shouldSplitOnAnd(claim.text);
    if (result.action === "keep") {
      out.push(claim);
      continue;
    }

    trackFallback("andSplitClassifier:split");
    for (const part of result.parts) {
      out.push({
        ...claim,
        text: part.trim(),
        group: nextGroup++,
      });
    }
  }

  return out;
}

export function canonicalizePreGraph(
  claims: DecomposedClaim[],
  options: CanonicalizePreGraphOptions = {},
): DecomposedClaim[] {
  const afterDedup = deduplicateClaimsStructured(claims);
  const afterAndSplit = splitCompoundAndClaims(afterDedup);
  const afterReplyProjection = projectReplyCausalToReasons(afterAndSplit, options.parentClaimText);
  return deduplicateClaimsStructured(afterReplyProjection);
}

export function deduplicateGraphPlans(
  plans: ClaimPlan[],
  graphMap: Map<string, GraphResult | null>,
): ClaimPlan[] {
  const result: ClaimPlan[] = [];
  const seenCores: Array<{ core: FlatTriple; index: number }> = [];

  for (const plan of plans) {
    const graph = graphMap.get(plan.graphKeys[0]);
    if (!graph) { result.push(plan); continue; }
    const core = graph.core;

    const existing = seenCores.find((s) => areTriplesDuplicate(s.core, core));

    if (!existing) {
      seenCores.push({ core, index: result.length });
      result.push(plan);
    }
  }
  return result;
}

function splitMultiMainGroups(
  claims: Array<{ claim: string; role: "MAIN" | "SUPPORTING"; group: number }>,
): void {
  if (claims.length === 0) return;
  let nextGroup = Math.max(...claims.map(c => c.group)) + 1;

  const groups = new Map<number, typeof claims>();
  for (const c of claims) {
    const g = groups.get(c.group) || [];
    g.push(c);
    groups.set(c.group, g);
  }

  for (const [, groupClaims] of groups) {
    const mains = groupClaims.filter(c => c.role === "MAIN");
    if (mains.length <= 1) continue;

    for (let i = 1; i < mains.length; i++) {
      mains[i].group = nextGroup++;
    }

    const supportings = groupClaims.filter(c => c.role === "SUPPORTING");
    for (const sup of supportings) {
      let bestMain = mains[0];
      let bestScore = -1;
      for (const m of mains) {
        const score = tokenSimilarity(normalize(sup.claim), normalize(m.claim));
        if (score > bestScore) {
          bestScore = score;
          bestMain = m;
        }
      }
      sup.group = bestMain.group;
    }
  }
}

function enforceOneMainPerGroup(
  claims: Array<{ claim: string; role: "MAIN" | "SUPPORTING"; group: number }>,
  referenceText: string,
): void {
  const groups = new Map<number, typeof claims>();
  for (const c of claims) {
    const g = groups.get(c.group) || [];
    g.push(c);
    groups.set(c.group, g);
  }

  const refNorm = normalize(referenceText);

  for (const [, groupClaims] of groups) {
    if (groupClaims.length === 0) continue;

    let best = groupClaims[0];
    let bestScore = -1;
    for (const c of groupClaims) {
      const score = tokenSimilarity(normalize(c.claim), refNorm);
      if (score > bestScore) {
        bestScore = score;
        best = c;
      }
    }

    for (const c of groupClaims) {
      c.role = c === best ? "MAIN" : "SUPPORTING";
    }
  }
}

export function enforceRoles(
  claims: Array<{ claim: string; role: "MAIN" | "SUPPORTING"; group: number }>,
  referenceText: string,
): void {
  splitMultiMainGroups(claims);
  enforceOneMainPerGroup(claims, referenceText);
}

