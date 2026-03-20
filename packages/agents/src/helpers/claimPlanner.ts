import type { DecomposedClaim, FlatTriple } from "../types.js";
export type RecursiveSlot = string | { subject: RecursiveSlot; predicate: string; object: RecursiveSlot };

export type GraphResult = {
  core: FlatTriple;
  modifiers: Array<{ prep: string; value: string }>;
  recursiveSubject?: RecursiveSlot;
  recursiveObject?: RecursiveSlot;
};

export type ClaimPlanKind = "standard";
export type KindSource = "rule" | "agent" | "fallback";

export type ClaimPlan = {
  kind: "standard";
  claim: string;
  role: "MAIN" | "SUPPORTING";
  group: number;
  graphKeys: string[];
  kindSource: KindSource;
};

export function buildClaimPlans(
  claims: DecomposedClaim[],
  sentenceContext: string,
  graphFromClaim: (claimText: string, sentenceContext: string) => Promise<GraphResult | null>,
): { plans: ClaimPlan[]; graphJobs: Map<string, Promise<GraphResult | null>> } {
  const plans: ClaimPlan[] = [];
  const graphJobs = new Map<string, Promise<GraphResult | null>>();

  for (const dc of claims) {
    const claim = dc.text;
    const key = `std:${claim}`;
    graphJobs.set(key, graphFromClaim(claim, sentenceContext));
    plans.push({ kind: "standard", claim, role: dc.role, group: dc.group, graphKeys: [key], kindSource: "rule" });
  }

  return { plans, graphJobs };
}
