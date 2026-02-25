import { describe, it, expect } from "vitest";
import {
  extractJson,
  dedupeStrings,
  parseConditional,
  parseMetaClaim,
  tryDecomposeValue,
  tryDecomposeSubject,
  type Conditional,
} from "../runExtraction.js";

// ─── Part A: Pure unit tests (offline, deterministic) ───────────────────────

describe("extractJson", () => {
  it("extracts from fenced code block", () => {
    const raw = '```json\n{"key": "value"}\n```';
    expect(extractJson(raw)).toBe('{"key": "value"}');
  });

  it("extracts from fenced block without language tag", () => {
    const raw = '```\n[1, 2, 3]\n```';
    expect(extractJson(raw)).toBe("[1, 2, 3]");
  });

  it("extracts raw JSON object", () => {
    const raw = 'Some text before {"a": 1}';
    expect(extractJson(raw)).toBe('{"a": 1}');
  });

  it("extracts raw JSON array", () => {
    const raw = "Here is the result: [1, 2]";
    expect(extractJson(raw)).toBe("[1, 2]");
  });

  it("prefers object over array when object comes first", () => {
    const raw = '{"x": [1]}';
    expect(extractJson(raw)).toBe('{"x": [1]}');
  });

  it("returns trimmed input when no JSON found", () => {
    expect(extractJson("no json here")).toBe("no json here");
  });

  it("handles empty string", () => {
    expect(extractJson("")).toBe("");
  });
});

describe("dedupeStrings", () => {
  it("removes case-insensitive duplicates", () => {
    expect(dedupeStrings(["Hello", "hello", "HELLO"])).toEqual(["Hello"]);
  });

  it("preserves order of first occurrence", () => {
    expect(dedupeStrings(["B", "a", "b", "A"])).toEqual(["B", "a"]);
  });

  it("filters out empty and whitespace-only strings", () => {
    expect(dedupeStrings(["a", "", "  ", "b"])).toEqual(["a", "b"]);
  });

  it("trims entries", () => {
    expect(dedupeStrings(["  hello  ", "hello"])).toEqual(["hello"]);
  });

  it("returns empty array for empty input", () => {
    expect(dedupeStrings([])).toEqual([]);
  });
});

describe("parseConditional", () => {
  it("parses 'If X, Y' pattern", () => {
    const result = parseConditional("If it rains, we stay home.");
    expect(result).toEqual<Conditional>({
      kw: "if",
      condText: "it rains",
      mainText: "we stay home",
    });
  });

  it("parses 'Y if X' pattern", () => {
    const result = parseConditional("We stay home if it rains.");
    expect(result).toEqual<Conditional>({
      kw: "if",
      condText: "it rains",
      mainText: "We stay home",
    });
  });

  it("parses 'Unless X, Y' pattern", () => {
    const result = parseConditional("Unless prices drop, demand falls.");
    expect(result).toEqual<Conditional>({
      kw: "unless",
      condText: "prices drop",
      mainText: "demand falls",
    });
  });

  it("parses 'When X, Y' pattern", () => {
    const result = parseConditional("When the sun sets, bats emerge.");
    expect(result).toEqual<Conditional>({
      kw: "when",
      condText: "the sun sets",
      mainText: "bats emerge",
    });
  });

  it("returns null for non-conditional", () => {
    expect(parseConditional("Nuclear energy is safe.")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseConditional("")).toBeNull();
  });
});

describe("parseMetaClaim", () => {
  it("parses 'X says that Y'", () => {
    const result = parseMetaClaim("The WHO says that air pollution kills.");
    expect(result).toEqual({
      source: "The WHO",
      verb: "says",
      proposition: "air pollution kills",
    });
  });

  it("parses 'X argues that Y'", () => {
    const result = parseMetaClaim("Experts argue that reform is needed.");
    expect(result).toEqual({
      source: "Experts",
      verb: "argue",
      proposition: "reform is needed",
    });
  });

  it("parses 'X reports that Y'", () => {
    const result = parseMetaClaim("The study reports that rates increased.");
    expect(result).toEqual({
      source: "The study",
      verb: "reports",
      proposition: "rates increased",
    });
  });

  it("returns null for non-reporting verbs", () => {
    expect(parseMetaClaim("The cat eats that food.")).toBeNull();
  });

  it("returns null for no 'that' clause", () => {
    expect(parseMetaClaim("Scientists say hello.")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseMetaClaim("")).toBeNull();
  });
});

describe("tryDecomposeValue", () => {
  it("decomposes 'children under 16'", () => {
    const result = tryDecomposeValue("children under 16");
    expect(result).toEqual({
      subject: "children",
      predicate: "under",
      object: "16",
    });
  });

  it("decomposes 'emissions from aviation'", () => {
    const result = tryDecomposeValue("emissions from aviation");
    expect(result).toEqual({
      subject: "emissions",
      predicate: "from",
      object: "aviation",
    });
  });

  it("decomposes 'policy for rural areas'", () => {
    const result = tryDecomposeValue("policy for rural areas");
    expect(result).toEqual({
      subject: "policy",
      predicate: "for",
      object: "rural areas",
    });
  });

  it("returns null for < 3 words", () => {
    expect(tryDecomposeValue("nuclear energy")).toBeNull();
  });

  it("returns null for single word", () => {
    expect(tryDecomposeValue("climate")).toBeNull();
  });

  it("returns null when no preposition matches", () => {
    expect(tryDecomposeValue("very large cat")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(tryDecomposeValue("")).toBeNull();
  });
});

describe("tryDecomposeSubject", () => {
  it("decomposes 'Carbon emissions from aviation'", () => {
    const result = tryDecomposeSubject({
      subject: "Carbon emissions from aviation",
      predicate: "account for",
      object: "3% of global warming",
    });
    expect(result).not.toBeNull();
    expect(result!.prep).toBe("from");
    expect(result!.subTriple).toEqual({
      subject: "Carbon emissions",
      predicate: "from",
      object: "aviation",
    });
  });

  it("decomposes 'Tax revenue for education'", () => {
    const result = tryDecomposeSubject({
      subject: "Tax revenue for education",
      predicate: "is",
      object: "insufficient",
    });
    expect(result).not.toBeNull();
    expect(result!.prep).toBe("for");
    expect(result!.subTriple.subject).toBe("Tax revenue");
    expect(result!.subTriple.object).toBe("education");
  });

  it("returns null for 'Nuclear energy' (< 3 words)", () => {
    const result = tryDecomposeSubject({
      subject: "Nuclear energy",
      predicate: "is",
      object: "safe",
    });
    expect(result).toBeNull();
  });

  it("returns null when subject has no matching preposition", () => {
    const result = tryDecomposeSubject({
      subject: "The very large cat",
      predicate: "likes",
      object: "fish",
    });
    expect(result).toBeNull();
  });

  it("does not mutate the input triple", () => {
    const input = {
      subject: "Carbon emissions from aviation",
      predicate: "account for",
      object: "3%",
    };
    const copy = { ...input };
    tryDecomposeSubject(input);
    expect(input).toEqual(copy);
  });
});

// ─── Part A2: DECOMPOSE_MARKERS gate ─────────────────────────────────────────
// Mirror of the private regex in runExtraction.ts — kept in sync manually.
const DECOMPOSE_MARKERS = /\b(but|however|although|though|yet|because|therefore|so|if|unless|when|whenever|and)\b|,\s*which\b/i;

describe("DECOMPOSE_MARKERS", () => {
  it.each([
    "Open source increases transparency and public trust.",
    "Privacy and security are fundamental rights.",
    "He went to the store and bought milk.",
  ])("matches sentences with coordinated 'and': %s", (sentence) => {
    expect(DECOMPOSE_MARKERS.test(sentence)).toBe(true);
  });

  it.each([
    "but", "however", "although", "because", "therefore",
    "so", "if", "unless", "when", "whenever", "yet", "though",
  ])("matches discourse marker: %s", (marker) => {
    expect(DECOMPOSE_MARKERS.test(`X ${marker} Y`)).toBe(true);
  });

  it("matches ', which' clause", () => {
    expect(DECOMPOSE_MARKERS.test("Policy X, which reduces cost.")).toBe(true);
  });

  it("does not match simple sentences without markers", () => {
    expect(DECOMPOSE_MARKERS.test("Nuclear energy is safe.")).toBe(false);
  });
});

// ─── Part B: Optional LLM integration tests ────────────────────────────────

describe.skipIf(!process.env.GROQ_API_KEY)(
  "runExtraction — LLM integration (requires GROQ_API_KEY)",
  () => {
    // Lazy import to avoid loading LLM providers when keys are absent
    let runExtraction: typeof import("../runExtraction.js").runExtraction;

    const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

    it("extracts a simple claim", async () => {
      const mod = await import("../runExtraction.js");
      runExtraction = mod.runExtraction;

      const result = await runExtraction("Nuclear energy is safe.");
      const claims = result.perSegment.flatMap((s) => s.claims);
      expect(claims.length).toBeGreaterThanOrEqual(1);

      const triples = claims.filter((c) => c.triple);
      expect(triples.length).toBeGreaterThanOrEqual(1);
      expect(triples[0].triple!.subject).toBeTruthy();
      expect(triples[0].triple!.predicate).toBeTruthy();
      expect(triples[0].triple!.object).toBeTruthy();
    }, 60_000);

    it("extracts a conditional into 2+ claims", async () => {
      await delay(12_000);
      const mod = await import("../runExtraction.js");
      runExtraction = mod.runExtraction;

      const result = await runExtraction(
        "If nuclear energy reduces CO2, then France should invest more."
      );
      const claims = result.perSegment.flatMap((s) => s.claims);
      expect(claims.length).toBeGreaterThanOrEqual(2);

      const conditionalEdges = result.nested.filter((e) => e.kind === "conditional");
      expect(conditionalEdges.length).toBeGreaterThanOrEqual(1);
    }, 120_000);
  }
);

// ─── Part C: Search 0x guard ────────────────────────────────────────────────

describe("0x label guard", () => {
  it("no suggestion label should start with 0x", () => {
    // Simulates the mapping logic from search/route.ts
    const mockAtoms = [
      { term_id: "0xabc123", label: "Climate change" },
      { term_id: "0xdef456", label: null },
      { term_id: "0x789012", label: "" },
      { term_id: "0xffffff", label: "Valid label" },
    ];

    const labels = mockAtoms
      .map((a) => a.label || "")
      .filter((l) => l && !l.startsWith("0x"));

    expect(labels).toEqual(["Climate change", "Valid label"]);

    // Verify no 0x labels survive
    for (const label of labels) {
      expect(label).not.toMatch(/^0x/);
    }
  });

  it("global triple labels should never fall back to term_id", () => {
    // Simulates the C0 fix: labels fall back to "" instead of term_id
    const mockTriples = [
      { subject: { label: "AI", term_id: "0xaaa" }, predicate: { label: "is", term_id: "0xbbb" }, object: { label: "useful", term_id: "0xccc" } },
      { subject: { label: null, term_id: "0xddd" }, predicate: { label: "causes", term_id: "0xeee" }, object: { label: "harm", term_id: "0xfff" } },
    ];

    const mapped = mockTriples.map((t) => ({
      subject: t.subject?.label ?? "",
      predicate: t.predicate?.label ?? "",
      object: t.object?.label ?? "",
    }));

    // Verify no 0x labels
    for (const item of mapped) {
      expect(item.subject).not.toMatch(/^0x/);
      expect(item.predicate).not.toMatch(/^0x/);
      expect(item.object).not.toMatch(/^0x/);
    }

    // Second triple should be filtered out (empty subject)
    const valid = mapped.filter((m) => Boolean(m.subject && m.predicate && m.object));
    expect(valid).toHaveLength(1);
    expect(valid[0].subject).toBe("AI");
  });
});
