import type { NestedEdge, TermRef } from "../core.js";
import type { DerivedTriple, FlatTriple, ClaimAtomMatches } from "../types.js";
import type { ClaimPlan, GraphResult, RecursiveSlot } from "./claimPlanner.js";
import { flattenSlot } from "./llmAdapters.js";
import { tryExtractSubProposition, isReportingVerb } from "./parse.js";
import { tripleKeyed, termAtom, termTriple, pushEdge } from "./termRef.js";
import { checkReflexive } from "./validate.js";
import { normalizeForCompare } from "./text.js";
import { trackFallback } from "./fallbackTracker.js";

export type ClaimResult = {
  index: number;
  claim: string;
  role: "MAIN" | "SUPPORTING";
  group: number;
  triple: (FlatTriple & { stableKey: string } & ClaimAtomMatches) | null;
  outermostMainKey?: string | null;
  isMeta?: boolean;
};

function nullClaimResult(
  index: number,
  claim: string,
  role: "MAIN" | "SUPPORTING",
  group: number,
): ClaimResult {
  return { index, claim, role, group, triple: null, outermostMainKey: null };
}

function keyedCoreIfValid(
  graph: GraphResult | null,
): (FlatTriple & { stableKey: string }) | null {
  if (!graph) return null;
  const keyed = tripleKeyed(graph.core);
  if (!checkReflexive(keyed).valid) return null;
  return keyed;
}

function isDuplicateSubjectObject(core: FlatTriple): boolean {
  const s = normalizeForCompare(core.subject);
  const o = normalizeForCompare(core.object);
  return !!s && !!o && s === o;
}

function processStandard(
  plan: ClaimPlan,
  graphMap: Map<string, GraphResult | null>,
  segmentIndex: number,
  tripleIdx: number,
  nested: NestedEdge[],
  existingNestedKeys: Set<string>,
  derivedTriples: DerivedTriple[],
): ClaimResult {
  const graph = graphMap.get(plan.graphKeys[0]) ?? null;
  if (!graph) return nullClaimResult(tripleIdx, plan.claim, plan.role, plan.group);

  const groupKey = `${segmentIndex}:${plan.group}`;
  const core = keyedCoreIfValid(graph);
  if (!core) return nullClaimResult(tripleIdx, plan.claim, plan.role, plan.group);

  if (isReportingVerb(core.predicate)) {
    const subProp = tryExtractSubProposition(core.object);
    if (subProp) {
      trackFallback("processStandard:reportingVerbRecovery");
      const objectTriple = tripleKeyed(subProp);
      const recoveryMetaKey = pushEdge(nested, existingNestedKeys, {
        kind: "meta",
        origin: "agent",
        predicate: core.predicate,
        subject: termAtom(core.subject),
        object: termTriple(objectTriple),
      });
      return {
        index: tripleIdx, claim: plan.claim, role: plan.role, group: plan.group,
        triple: objectTriple, outermostMainKey: recoveryMetaKey, isMeta: true,
      };
    }
  }

  if (graph.recursiveSubject || graph.recursiveObject) {
    trackFallback("processStandard:recursiveSlots");
    const extraClaims: Array<{ claim: string; triple: FlatTriple & { stableKey: string } }> = [];

    const subjRef = graph.recursiveSubject
      ? buildTermRefFromSlot(graph.recursiveSubject, groupKey, nested, existingNestedKeys, extraClaims)
      : termAtom(core.subject);
    const objRef = graph.recursiveObject
      ? buildTermRefFromSlot(graph.recursiveObject, groupKey, nested, existingNestedKeys, extraClaims)
      : termAtom(core.object);

    const rootEdgeKey = pushEdge(nested, existingNestedKeys, {
      kind: "modifier",
      origin: "agent",
      predicate: core.predicate,
      subject: subjRef,
      object: objRef,
    });

    for (const ec of extraClaims) {
      if (!derivedTriples.some((d) => d.stableKey === ec.triple.stableKey)) {
        derivedTriples.push({ ...ec.triple, ownerGroupKey: groupKey });
      }
    }

    return {
      index: tripleIdx, claim: plan.claim, role: plan.role, group: plan.group,
      triple: core, outermostMainKey: rootEdgeKey,
    };
  }

  return { index: tripleIdx, claim: plan.claim, role: plan.role, group: plan.group, triple: core, outermostMainKey: null };
}

export function processClaimPlan(
  plan: ClaimPlan,
  graphMap: Map<string, GraphResult | null>,
  segmentIndex: number,
  tripleIdx: number,
  nested: NestedEdge[],
  existingNestedKeys: Set<string>,
  derivedTriples: DerivedTriple[],
): ClaimResult {
  const result = processStandard(plan, graphMap, segmentIndex, tripleIdx, nested, existingNestedKeys, derivedTriples);
  if (!result.triple) {
    const failedKeys = plan.graphKeys.filter((k) => !graphMap.get(k));
    console.warn("[graph-fail]", {
      claimText: plan.claim,
      planKind: plan.kind,
      segmentIndex,
      group: plan.group,
      graphKeys: failedKeys.length > 0 ? failedKeys : plan.graphKeys,
    });
  }
  return result;
}

type ExtraClaim = { claim: string; triple: FlatTriple & { stableKey: string } };

function buildTermRefFromSlot(
  slot: RecursiveSlot,
  groupKey: string,
  localNested: NestedEdge[],
  localNestedKeys: Set<string>,
  extraClaims: ExtraClaim[],
): TermRef {
  if (typeof slot === "string") return termAtom(slot);

  const subjRef = buildTermRefFromSlot(slot.subject, groupKey, localNested, localNestedKeys, extraClaims);
  const objRef = buildTermRefFromSlot(slot.object, groupKey, localNested, localNestedKeys, extraClaims);

  const flatSubj = flattenSlot(slot.subject);
  const flatObj = flattenSlot(slot.object);
  const subKeyed = tripleKeyed({ subject: flatSubj, predicate: slot.predicate, object: flatObj });

  if (!checkReflexive(subKeyed).valid || isDuplicateSubjectObject(subKeyed)) {
    return termAtom(`${flatSubj} ${slot.predicate} ${flatObj}`);
  }

  if (subjRef.type === "atom" && objRef.type === "atom") {
    extraClaims.push({ claim: `${flatSubj} ${slot.predicate} ${flatObj}`, triple: subKeyed });
    return termTriple(subKeyed);
  }

  const edgeKey = pushEdge(localNested, localNestedKeys, {
    kind: "modifier",
    origin: "agent",
    predicate: slot.predicate,
    subject: subjRef,
    object: objRef,
  });
  return { type: "triple", tripleKey: edgeKey };
}
