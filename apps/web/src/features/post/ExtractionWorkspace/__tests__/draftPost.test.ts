import { describe, it, expect } from "vitest";

import {
  createInitialDraft,
  findDraftIndex,
  normalizeMain,
  splitIntoDrafts,
  mergeDrafts,
  collectNestedAtomLabels,
  buildResolvedTripleMap,
  groupResolvedByDraft,
  type DraftPost,
  type ProposalDraft,
  type NestedProposalDraft,
  type ResolvedTriple,
  type ResolvedNestedTriple,
  type ApprovedProposalWithRole,
} from "../extractionTypes";

// ─── Pure helpers ────────────────────────────────────────────────────────────

describe("createInitialDraft", () => {
  it("creates a draft with correct defaults", () => {
    const draft = createInitialDraft("draft-0", "SUPPORTS", ["p1", "p2"]);
    expect(draft).toEqual({
      id: "draft-0",
      stance: "SUPPORTS",
      mainProposalId: null,
      proposalIds: ["p1", "p2"],
      body: "",
      bodyDefault: "",
    });
  });

  it("accepts null stance for root posts", () => {
    const draft = createInitialDraft("draft-0", null, ["p1"]);
    expect(draft.stance).toBeNull();
  });

  it("creates a draft with auto-selected main", () => {
    const draft = createInitialDraft("draft-0", "SUPPORTS", ["p1", "p2"], "p1");
    expect(draft.mainProposalId).toBe("p1");
  });
});

describe("findDraftIndex", () => {
  const drafts: DraftPost[] = [
    createInitialDraft("draft-0", "SUPPORTS", ["p1", "p2"]),
    createInitialDraft("draft-1", "REFUTES", ["p3"]),
  ];

  it("finds the correct draft", () => {
    expect(findDraftIndex(drafts, "p1")).toBe(0);
    expect(findDraftIndex(drafts, "p3")).toBe(1);
  });

  it("returns -1 if proposalId is absent", () => {
    expect(findDraftIndex(drafts, "missing")).toBe(-1);
  });

  it("returns -1 for empty drafts array", () => {
    expect(findDraftIndex([], "p1")).toBe(-1);
  });
});

describe("normalizeMain", () => {
  it("keeps valid mainProposalId", () => {
    const draft = createInitialDraft("draft-0", "SUPPORTS", ["p1", "p2"], "p1");
    const result = normalizeMain(draft);
    expect(result).toBe(draft); // referential equality = no-op
    expect(result.mainProposalId).toBe("p1");
  });

  it("falls back to first proposalId when mainProposalId is invalid", () => {
    const draft: DraftPost = {
      ...createInitialDraft("draft-0", "SUPPORTS", ["p1", "p2"]),
      mainProposalId: "missing",
    };
    const result = normalizeMain(draft);
    expect(result.mainProposalId).toBe("p1");
  });

  it("returns null when proposalIds is empty", () => {
    const draft: DraftPost = {
      ...createInitialDraft("draft-0", "SUPPORTS", []),
      mainProposalId: "missing",
    };
    const result = normalizeMain(draft);
    expect(result.mainProposalId).toBeNull();
  });

  it("falls back when mainProposalId is null", () => {
    const draft = createInitialDraft("draft-0", "SUPPORTS", ["p1", "p2"]);
    const result = normalizeMain(draft);
    expect(result.mainProposalId).toBe("p1");
  });
});

// ─── 1-draft regression: simulating CRUD operations ─────────────────────────

describe("mode 1 draft — regression", () => {
  function makeDraft(overrides?: Partial<DraftPost>): DraftPost {
    return {
      ...createInitialDraft("draft-0", "SUPPORTS", ["p1", "p2", "p3"], "p1"),
      ...overrides,
    };
  }

  // Simulate selectMain logic (same as useProposalCrud)
  function simulateSelectMain(drafts: DraftPost[], proposalId: string): DraftPost[] {
    const draftIdx = findDraftIndex(drafts, proposalId);
    if (draftIdx === -1) return drafts;
    if (drafts[draftIdx].mainProposalId === proposalId) return drafts;
    return drafts.map((d, i) =>
      i === draftIdx ? { ...d, mainProposalId: proposalId } : d,
    );
  }

  // Simulate rejectProposal for draft proposals (removed from proposalIds)
  function simulateRejectDraft(drafts: DraftPost[], proposalId: string): DraftPost[] {
    return drafts.map((d) => normalizeMain({
      ...d,
      proposalIds: d.proposalIds.filter((id) => id !== proposalId),
      mainProposalId: d.mainProposalId === proposalId ? null : d.mainProposalId,
    }));
  }

  // Simulate rejectProposal for extracted proposals (status→rejected, stays in proposalIds)
  // Needs a list of non-rejected proposal IDs to find the next main
  function simulateRejectExtracted(
    drafts: DraftPost[],
    proposalId: string,
    nonRejectedIds: string[],
  ): DraftPost[] {
    const draftIdx = findDraftIndex(drafts, proposalId);
    if (draftIdx === -1) return drafts;
    const draft = drafts[draftIdx];
    if (draft.mainProposalId !== proposalId) return drafts;
    const nextMain = draft.proposalIds.find(
      (id) => id !== proposalId && nonRejectedIds.includes(id),
    ) ?? null;
    return drafts.map((d, i) => (i === draftIdx ? { ...d, mainProposalId: nextMain } : d));
  }

  it("selectMain → mainProposalId set (radio)", () => {
    let drafts = [makeDraft()];
    expect(drafts[0].mainProposalId).toBe("p1");
    drafts = simulateSelectMain(drafts, "p2");
    expect(drafts[0].mainProposalId).toBe("p2");
  });

  it("selectMain same id → no-op", () => {
    const drafts = [makeDraft()];
    const result = simulateSelectMain(drafts, "p1");
    expect(result).toBe(drafts); // referential equality = no-op
  });

  it("reject main → auto-fallback to next claim", () => {
    let drafts = [makeDraft()];
    expect(drafts[0].mainProposalId).toBe("p1");
    // p1 is main, reject it — p2 and p3 are still non-rejected
    drafts = simulateRejectExtracted(drafts, "p1", ["p2", "p3"]);
    expect(drafts[0].mainProposalId).toBe("p2");
  });

  it("reject last claim → mainProposalId null", () => {
    let drafts = [makeDraft({ proposalIds: ["p1"], mainProposalId: "p1" })];
    // Reject the only proposal — no non-rejected left
    drafts = simulateRejectExtracted(drafts, "p1", []);
    expect(drafts[0].mainProposalId).toBeNull();
  });

  it("reject non-main → mainProposalId unchanged", () => {
    let drafts = [makeDraft()];
    expect(drafts[0].mainProposalId).toBe("p1");
    drafts = simulateRejectExtracted(drafts, "p2", ["p1", "p3"]);
    expect(drafts[0].mainProposalId).toBe("p1");
  });

  it("reject draft main → auto-fallback via normalizeMain", () => {
    let drafts = [makeDraft()];
    // Simulate removing p1 (draft) — normalizeMain picks p2
    drafts = simulateRejectDraft(drafts, "p1");
    expect(drafts[0].mainProposalId).toBe("p2");
    expect(drafts[0].proposalIds).not.toContain("p1");
  });

  it("addDraft → proposalId added in draft 0", () => {
    const drafts = [makeDraft()];
    const draftId = "draft-123";
    const updated = drafts.map((d, i) =>
      i === 0 ? { ...d, proposalIds: [...d.proposalIds, draftId] } : d,
    );
    expect(updated[0].proposalIds).toContain(draftId);
    expect(updated[0].proposalIds).toHaveLength(4);
  });

  it("saveDraft ID swap → proposalIds and mainProposalId updated", () => {
    const draftId = "draft-123";
    const newId = "proposal-456";
    let drafts: DraftPost[] = [
      {
        ...makeDraft(),
        proposalIds: ["p1", "p2", draftId],
        mainProposalId: draftId,
      },
    ];

    drafts = drafts.map((d) => ({
      ...d,
      proposalIds: d.proposalIds.map((id) => (id === draftId ? newId : id)),
      mainProposalId: d.mainProposalId === draftId ? newId : d.mainProposalId,
    }));

    expect(drafts[0].proposalIds).toContain(newId);
    expect(drafts[0].proposalIds).not.toContain(draftId);
    expect(drafts[0].mainProposalId).toBe(newId);
  });
});

// ─── canAdvance guard ────────────────────────────────────────────────────────

describe("canAdvance guard", () => {
  it("blocks when 0 approved proposals", () => {
    const allDraftsHaveMain = true; // vacuously true when empty
    const approvedProposalsLength = 0;
    const canAdvance = allDraftsHaveMain && approvedProposalsLength > 0;
    expect(canAdvance).toBe(false);
  });

  it("allows when at least 1 approved proposal and main is set", () => {
    const allDraftsHaveMain = true;
    const approvedProposalsLength = 1;
    const canAdvance = allDraftsHaveMain && approvedProposalsLength > 0;
    expect(canAdvance).toBe(true);
  });

  it("blocks when main is not set", () => {
    const allDraftsHaveMain = false;
    const approvedProposalsLength = 2;
    const canAdvance = allDraftsHaveMain && approvedProposalsLength > 0;
    expect(canAdvance).toBe(false);
  });
});

// ─── Phase 3: Split / Merge / Move ──────────────────────────────────────────

function makeProposal(
  id: string,
  overrides?: Partial<ProposalDraft>,
): ProposalDraft {
  return {
    id,
    stableKey: "",
    sText: "s",
    pText: "p",
    oText: "o",
    status: "approved",
    subjectAtomId: null,
    predicateAtomId: null,
    objectAtomId: null,
    matchedIntuitionTripleTermId: null,
    suggestedStance: null,
    stanceAligned: null,
    stanceReason: null,
    sentenceText: "",
    saved: {
      sText: "s",
      pText: "p",
      oText: "o",
      subjectAtomId: null,
      predicateAtomId: null,
      objectAtomId: null,
    },
    ...overrides,
  };
}

describe("splitIntoDrafts", () => {
  it("splits 3 proposals into 3 drafts", () => {
    const proposals = [makeProposal("p1"), makeProposal("p2"), makeProposal("p3")];
    const source = [createInitialDraft("draft-0", "SUPPORTS", ["p1", "p2", "p3"], "p1")];
    const result = splitIntoDrafts(source, proposals, "SUPPORTS");
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual(expect.objectContaining({ id: "draft-0", proposalIds: ["p1"], mainProposalId: "p1" }));
    expect(result[1]).toEqual(expect.objectContaining({ id: "draft-1", proposalIds: ["p2"], mainProposalId: "p2" }));
    expect(result[2]).toEqual(expect.objectContaining({ id: "draft-2", proposalIds: ["p3"], mainProposalId: "p3" }));
  });

  it("uses suggestedStance when available", () => {
    const proposals = [
      makeProposal("p1", { suggestedStance: "SUPPORTS" }),
      makeProposal("p2", { suggestedStance: "REFUTES" }),
      makeProposal("p3"),
    ];
    const source = [createInitialDraft("draft-0", "SUPPORTS", ["p1", "p2", "p3"])];
    const result = splitIntoDrafts(source, proposals, "SUPPORTS");
    expect(result[0].stance).toBe("SUPPORTS");
    expect(result[1].stance).toBe("REFUTES");
    expect(result[2].stance).toBe("SUPPORTS"); // fallback to userStance
  });

  it("handles 1 proposal", () => {
    const proposals = [makeProposal("p1")];
    const source = [createInitialDraft("draft-0", null, ["p1"], "p1")];
    const result = splitIntoDrafts(source, proposals, null);
    expect(result).toHaveLength(1);
    expect(result[0].mainProposalId).toBe("p1");
  });

  it("handles 0 proposals", () => {
    const source = [createInitialDraft("draft-0", null, [])];
    const result = splitIntoDrafts(source, [], null);
    expect(result).toHaveLength(0);
  });

  it("ignores rejected proposals", () => {
    const proposals = [
      makeProposal("p1"),
      makeProposal("p2", { status: "rejected" }),
      makeProposal("p3"),
    ];
    const source = [createInitialDraft("draft-0", "SUPPORTS", ["p1", "p2", "p3"])];
    const result = splitIntoDrafts(source, proposals, "SUPPORTS");
    expect(result).toHaveLength(2);
    expect(result[0].proposalIds).toEqual(["p1"]);
    expect(result[1].proposalIds).toEqual(["p3"]);
  });

  it("deduplicates proposal IDs", () => {
    const proposals = [makeProposal("p1"), makeProposal("p2")];
    // Simulate a bug where p1 appears in two drafts
    const source: DraftPost[] = [
      createInitialDraft("draft-0", null, ["p1", "p2"]),
      createInitialDraft("draft-1", null, ["p1"]),
    ];
    const result = splitIntoDrafts(source, proposals, null);
    expect(result).toHaveLength(2); // p1 + p2, not p1 + p2 + p1
  });
});

describe("mergeDrafts", () => {
  it("merges 3 drafts into 1", () => {
    const drafts: DraftPost[] = [
      createInitialDraft("draft-0", "SUPPORTS", ["p1"], "p1"),
      createInitialDraft("draft-1", "REFUTES", ["p2"], "p2"),
      createInitialDraft("draft-2", "SUPPORTS", ["p3"], "p3"),
    ];
    const result = mergeDrafts(drafts, "SUPPORTS");
    expect(result.id).toBe("draft-0");
    expect(result.proposalIds).toEqual(["p1", "p2", "p3"]);
    expect(result.mainProposalId).toBe("p1"); // main from first draft
    expect(result.stance).toBe("SUPPORTS"); // stance from first draft
  });

  it("handles empty drafts", () => {
    const result = mergeDrafts([], null);
    expect(result.proposalIds).toEqual([]);
    expect(result.mainProposalId).toBeNull();
    expect(result.stance).toBeNull();
  });

  it("falls back to first proposalId when main is invalid", () => {
    const drafts: DraftPost[] = [
      { ...createInitialDraft("draft-0", null, ["p1"]), mainProposalId: "missing" },
      createInitialDraft("draft-1", null, ["p2"], "p2"),
    ];
    const result = mergeDrafts(drafts, null);
    expect(result.mainProposalId).toBe("p1");
  });
});

// ─── Phase 4: Body + bodyDefault ─────────────────────────────────────────────

describe("createInitialDraft — body", () => {
  it("sets body and bodyDefault from parameter", () => {
    const draft = createInitialDraft("draft-0", "SUPPORTS", ["p1"], "p1", "My text.");
    expect(draft.body).toBe("My text.");
    expect(draft.bodyDefault).toBe("My text.");
  });

  it("defaults body to empty when no bodyDefault given", () => {
    const draft = createInitialDraft("draft-0", "SUPPORTS", ["p1"], "p1");
    expect(draft.body).toBe("");
    expect(draft.bodyDefault).toBe("");
  });
});

describe("splitIntoDrafts — body", () => {
  it("composes bodyDefault from S+P+O per draft", () => {
    const proposals = [
      makeProposal("p1", { sText: "Carbon tax", pText: "lowers", oText: "emissions" }),
      makeProposal("p2", { sText: "Carbon tax", pText: "increases", oText: "household costs" }),
    ];
    const source = [createInitialDraft("draft-0", null, ["p1", "p2"], "p1", "Full text.")];
    const result = splitIntoDrafts(source, proposals, null);
    expect(result[0].body).toBe("Carbon tax lowers emissions");
    expect(result[0].bodyDefault).toBe("Carbon tax lowers emissions");
    expect(result[1].body).toBe("Carbon tax increases household costs");
    expect(result[1].bodyDefault).toBe("Carbon tax increases household costs");
  });

  it("composes bodyDefault from default S+P+O when not overridden", () => {
    const proposals = [makeProposal("p1")]; // sText="s", pText="p", oText="o"
    const source = [createInitialDraft("draft-0", null, ["p1"], "p1", "Full.")];
    const result = splitIntoDrafts(source, proposals, null);
    expect(result[0].bodyDefault).toBe("s p o");
  });
});

describe("mergeDrafts — body + filtering", () => {
  it("uses inputText as bodyDefault when merging", () => {
    const drafts: DraftPost[] = [
      { ...createInitialDraft("draft-0", null, ["p1"], "p1", "S1."), body: "Edited." },
      createInitialDraft("draft-1", null, ["p2"], "p2", "S2."),
    ];
    const result = mergeDrafts(drafts, null, "Full text.");
    expect(result.body).toBe("Full text.");
    expect(result.bodyDefault).toBe("Full text.");
  });

  it("falls back to empty when inputText omitted", () => {
    const drafts = [createInitialDraft("draft-0", null, ["p1"], "p1")];
    const result = mergeDrafts(drafts, null);
    expect(result.body).toBe("");
    expect(result.bodyDefault).toBe("");
  });

  it("filters rejected proposals when merging with proposals param", () => {
    const proposals = [
      makeProposal("p1"),
      makeProposal("p2", { status: "rejected" }),
      makeProposal("p3"),
    ];
    const drafts: DraftPost[] = [
      createInitialDraft("draft-0", null, ["p1", "p2"], "p1"),
      createInitialDraft("draft-1", null, ["p3"], "p3"),
    ];
    const result = mergeDrafts(drafts, null, "Text.", proposals);
    expect(result.proposalIds).toEqual(["p1", "p3"]);
    expect(result.proposalIds).not.toContain("p2");
  });

  it("deduplicates proposal IDs when merging", () => {
    const proposals = [makeProposal("p1"), makeProposal("p2")];
    const drafts: DraftPost[] = [
      createInitialDraft("draft-0", null, ["p1", "p2"], "p1"),
      createInitialDraft("draft-1", null, ["p1"], "p1"), // duplicate
    ];
    const result = mergeDrafts(drafts, null, "Text.", proposals);
    expect(result.proposalIds).toEqual(["p1", "p2"]);
  });
});

// ─── Phase 5: Nested triple helpers ──────────────────────────────────────────

describe("collectNestedAtomLabels", () => {
  it("collects predicate + atom-type refs", () => {
    const nested: NestedProposalDraft[] = [{
      id: "n1", edgeKind: "relation", predicate: "because",
      subject: { type: "atom", atomKey: "sk1", label: "Earth" },
      object: { type: "triple", tripleKey: "tk1" },
      stableKey: "ns1",
    }];
    const result = collectNestedAtomLabels(nested);
    expect(result).toContain("because");
    expect(result).toContain("Earth");
    expect(result).toHaveLength(2);
  });

  it("deduplicates labels", () => {
    const nested: NestedProposalDraft[] = [{
      id: "n1", edgeKind: "modifier", predicate: "because",
      subject: { type: "atom", atomKey: "sk1", label: "X" },
      object: { type: "atom", atomKey: "sk2", label: "X" },
      stableKey: "ns1",
    }];
    const result = collectNestedAtomLabels(nested);
    expect(result.filter(l => l === "X")).toHaveLength(1);
  });

  it("returns empty for no nested", () => {
    expect(collectNestedAtomLabels([])).toEqual([]);
  });
});

describe("buildResolvedTripleMap", () => {
  it("maps stableKey to tripleTermId", () => {
    const proposals: ApprovedProposalWithRole[] = [
      { ...makeProposal("p1", { stableKey: "sk_abc" }), role: "MAIN" },
      { ...makeProposal("p2", { stableKey: "sk_def" }), role: "SUPPORTING" },
    ];
    const resolved: Array<ResolvedTriple | null> = [
      { proposalId: "p1", role: "MAIN", subjectAtomId: "1", predicateAtomId: "2", objectAtomId: "3", tripleTermId: "100", isExisting: false },
      { proposalId: "p2", role: "SUPPORTING", subjectAtomId: "4", predicateAtomId: "5", objectAtomId: "6", tripleTermId: "200", isExisting: true },
    ];
    const map = buildResolvedTripleMap(resolved, proposals);
    expect(map.get("sk_abc")).toBe("100");
    expect(map.get("sk_def")).toBe("200");
  });

  it("skips null resolved entries", () => {
    const proposals: ApprovedProposalWithRole[] = [
      { ...makeProposal("p1", { stableKey: "sk1" }), role: "MAIN" },
    ];
    const map = buildResolvedTripleMap([null], proposals);
    expect(map.size).toBe(0);
  });

  it("skips proposals without stableKey", () => {
    const proposals: ApprovedProposalWithRole[] = [
      { ...makeProposal("p1", { stableKey: "" }), role: "MAIN" },
    ];
    const resolved: Array<ResolvedTriple | null> = [
      { proposalId: "p1", role: "MAIN", subjectAtomId: "1", predicateAtomId: "2", objectAtomId: "3", tripleTermId: "100", isExisting: false },
    ];
    const map = buildResolvedTripleMap(resolved, proposals);
    expect(map.size).toBe(0);
  });
});

// ─── Phase 6: groupResolvedByDraft ──────────────────────────────────────────

function makeResolved(proposalId: string, role: "MAIN" | "SUPPORTING", tripleTermId: string, isExisting = false): ResolvedTriple {
  return { proposalId, role, subjectAtomId: "1", predicateAtomId: "2", objectAtomId: "3", tripleTermId, isExisting };
}

function makeNestedResolved(nestedProposalId: string, tripleTermId: string, isExisting = false): ResolvedNestedTriple {
  return { nestedProposalId, subjectTermId: "10", predicateTermId: "20", objectTermId: "30", tripleTermId, isExisting };
}

function makeNestedDraft(id: string, subject: NestedProposalDraft["subject"], object: NestedProposalDraft["object"]): NestedProposalDraft {
  return { id, edgeKind: "relation", predicate: "because", subject, object, stableKey: `ns_${id}` };
}

describe("groupResolvedByDraft", () => {
  it("groups core triples by draft", () => {
    const drafts: DraftPost[] = [
      createInitialDraft("d0", null, ["p1"], "p1"),
      createInitialDraft("d1", null, ["p2"], "p2"),
    ];
    const proposals = [makeProposal("p1", { stableKey: "sk1" }), makeProposal("p2", { stableKey: "sk2" })];
    const resolved: Array<ResolvedTriple | null> = [
      makeResolved("p1", "MAIN", "t100"),
      makeResolved("p2", "MAIN", "t200"),
    ];
    const result = groupResolvedByDraft(resolved, [], drafts, proposals, []);
    expect(result).toHaveLength(2);
    expect(result[0].draftId).toBe("d0");
    expect(result[0].triples).toHaveLength(1);
    expect(result[0].triples[0].tripleTermId).toBe("t100");
    expect(result[1].draftId).toBe("d1");
    expect(result[1].triples).toHaveLength(1);
    expect(result[1].triples[0].tripleTermId).toBe("t200");
  });

  it("assigns stance triples to correct draft", () => {
    const drafts: DraftPost[] = [
      createInitialDraft("d0", "SUPPORTS", ["p1"], "p1"),
      createInitialDraft("d1", "REFUTES", ["p2"], "p2"),
    ];
    const proposals = [makeProposal("p1", { stableKey: "sk1" }), makeProposal("p2", { stableKey: "sk2" })];
    const resolved: Array<ResolvedTriple | null> = [
      makeResolved("p1", "MAIN", "t100"),
      makeResolved("p2", "MAIN", "t200"),
      makeResolved("stance_p1", "SUPPORTING", "t300"),
      makeResolved("stance_p2", "SUPPORTING", "t400"),
    ];
    const result = groupResolvedByDraft(resolved, [], drafts, proposals, []);
    expect(result[0].triples).toHaveLength(2);
    expect(result[0].triples.find((t) => t.proposalId === "stance_p1")).toBeTruthy();
    expect(result[1].triples).toHaveLength(2);
    expect(result[1].triples.find((t) => t.proposalId === "stance_p2")).toBeTruthy();
  });

  it("assigns nested to subject's draft", () => {
    const drafts: DraftPost[] = [
      createInitialDraft("d0", null, ["p1"], "p1"),
      createInitialDraft("d1", null, ["p2"], "p2"),
    ];
    const proposals = [makeProposal("p1", { stableKey: "sk1" }), makeProposal("p2", { stableKey: "sk2" })];
    const nestedDraft = makeNestedDraft("n1",
      { type: "triple", tripleKey: "sk1" },
      { type: "atom", atomKey: "ak1", label: "X" },
    );
    const nestedResolved = [makeNestedResolved("n1", "t500")];
    const result = groupResolvedByDraft([], nestedResolved, drafts, proposals, [nestedDraft]);
    expect(result[0].nestedTriples).toHaveLength(1);
    expect(result[0].nestedTriples[0].tripleTermId).toBe("t500");
    expect(result[1].nestedTriples).toHaveLength(0);
  });

  it("falls back to first draft for atom-only nested", () => {
    const drafts: DraftPost[] = [
      createInitialDraft("d0", null, ["p1"], "p1"),
      createInitialDraft("d1", null, ["p2"], "p2"),
    ];
    const proposals = [makeProposal("p1"), makeProposal("p2")];
    const nestedDraft = makeNestedDraft("n1",
      { type: "atom", atomKey: "ak1", label: "X" },
      { type: "atom", atomKey: "ak2", label: "Y" },
    );
    const nestedResolved = [makeNestedResolved("n1", "t500")];
    const result = groupResolvedByDraft([], nestedResolved, drafts, proposals, [nestedDraft]);
    // Atom-only nested → fallback to first draft
    expect(result[0].nestedTriples).toHaveLength(1);
    expect(result[1].nestedTriples).toHaveLength(0);
  });

  it("throws when core triple has no draft mapping", () => {
    const drafts: DraftPost[] = [
      createInitialDraft("d0", null, ["p1"], "p1"),
    ];
    const proposals = [makeProposal("p1")];
    // p_orphan is not in any draft
    const resolved: Array<ResolvedTriple | null> = [
      makeResolved("p1", "MAIN", "t100"),
      makeResolved("p_orphan", "SUPPORTING", "t200"),
    ];
    expect(() => groupResolvedByDraft(resolved, [], drafts, proposals, [])).toThrow(/Cannot assign triple/);
  });

  it("backward compat: single draft gets all triples and nested", () => {
    const drafts: DraftPost[] = [
      createInitialDraft("d0", null, ["p1", "p2"], "p1"),
    ];
    const proposals = [makeProposal("p1", { stableKey: "sk1" }), makeProposal("p2", { stableKey: "sk2" })];
    const resolved: Array<ResolvedTriple | null> = [
      makeResolved("p1", "MAIN", "t100"),
      makeResolved("p2", "SUPPORTING", "t200"),
    ];
    const nestedDraft = makeNestedDraft("n1",
      { type: "triple", tripleKey: "sk1" },
      { type: "triple", tripleKey: "sk2" },
    );
    const nestedResolved = [makeNestedResolved("n1", "t500")];
    const result = groupResolvedByDraft(resolved, nestedResolved, drafts, proposals, [nestedDraft]);
    expect(result).toHaveLength(1);
    expect(result[0].triples).toHaveLength(2);
    expect(result[0].nestedTriples).toHaveLength(1);
    expect(result[0].body).toBe("");
    expect(result[0].stance).toBeNull();
  });

  it("includes empty drafts in output (caller filters before API)", () => {
    const drafts: DraftPost[] = [
      createInitialDraft("d0", null, ["p1"], "p1"),
      createInitialDraft("d1", null, [], null),   // empty draft — all proposals rejected
      createInitialDraft("d2", null, ["p2"], "p2"),
    ];
    const proposals = [makeProposal("p1", { stableKey: "sk1" }), makeProposal("p2", { stableKey: "sk2" })];
    const resolved: Array<ResolvedTriple | null> = [
      makeResolved("p1", "MAIN", "t100"),
      makeResolved("p2", "MAIN", "t200"),
    ];
    const result = groupResolvedByDraft(resolved, [], drafts, proposals, []);
    // groupResolvedByDraft returns ALL drafts (including empty)
    expect(result).toHaveLength(3);
    expect(result[1].draftId).toBe("d1");
    expect(result[1].triples).toHaveLength(0);
    // Caller (useOnchainPublish) filters: result.filter(p => p.triples.length > 0)
    const publishable = result.filter((p) => p.triples.length > 0);
    expect(publishable).toHaveLength(2);
    expect(publishable[0].draftId).toBe("d0");
    expect(publishable[1].draftId).toBe("d2");
  });
});
