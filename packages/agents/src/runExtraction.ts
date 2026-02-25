import { splitMarkdownIntoSentences } from "./claimify/split.js";
import { SelectionSchema, selectionAgent, selectionAgentGroq } from "./agents/selection-agent.js";
import { ClaimsSchema, decompositionAgent, decompositionAgentGroq } from "./agents/decomposition-agent.js";
import { GraphOutSchema, graphExtractorAgent, graphExtractorAgentGroq } from "./agents/graph-extractor.js";
import { RelationSchema, relationAgent, relationAgentGroq } from "./agents/relation-agent.js";
import { StanceVerificationSchema, stanceVerificationAgent, stanceVerificationAgentGroq } from "./agents/stance-verification-agent.js";

import type { NestedEdge, TermRef } from "@db/core";
import { atomKeyFromLabel, stableKeyFromEdge, stableKeyFromTriple } from "@db/core";
import { type FlatTriple } from "./agents/nested-triple-extractor.js";

export type ExtractionResult = {
  perSegment: Array<{
    headerPath: string[];
    sentence: string;
    selectedSentence: string | null;
    claims: Array<{
      index: number;
      claim: string;
      triple: (FlatTriple & { stableKey: string }) | null;
      suggestedStance?: "SUPPORTS" | "REFUTES";
      stanceAligned?: boolean;
      stanceReason?: string;
    }>;
  }>;
  nested: NestedEdge[];
};

export type ExtractionOptions = {
  themeTitle?: string | null;
  parentClaimText?: string | null;   // Body of the parent post (truncated)
  userStance?: "SUPPORTS" | "REFUTES" | null; // Used by stance verification agent (Phase 2.2)
};

const MAX_STANCE_CLAIMS = 100;

type LlmResponse = { text?: string | null };

// Helpers exported for unit tests
export function extractJson(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) return fenced[1].trim();
  const i = raw.indexOf("{");
  const j = raw.indexOf("[");
  const start = i === -1 ? j : j === -1 ? i : Math.min(i, j);
  return start === -1 ? raw.trim() : raw.slice(start).trim();
}

function parseJsonOrNull<T = unknown>(raw: string): T | null {
  try {
    return JSON.parse(extractJson(raw)) as T;
  } catch {
    return null;
  }
}

const safeTrim = (s: unknown) => (s ?? "").toString().trim();

function stripOuterQuotes(s: string): string {
  return (s ?? "")
    .toString()
    .trim()
    .replace(/^[\s"'“”‘’]+/, "")
    .replace(/[\s"'“”‘’]+$/, "")
    .trim();
}

function ensurePeriod(s: string): string {
  const t = s.trim();
  if (!t) return t;
  return /[.!?]$/.test(t) ? t : t + ".";
}

export function dedupeStrings(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const it of items) {
    const key = it.trim().toLowerCase();
    if (!key) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(it.trim());
  }
  return out;
}

function normalizeAtomValue(s: string): string {
  return s.trim().replace(/\s+/g, " ");
}

function tripleKeyed(t: FlatTriple): FlatTriple & { stableKey: string } {
  const stableKey = stableKeyFromTriple({
    subject: termAtom(t.subject),
    predicate: termAtom(t.predicate),
    object: termAtom(t.object),
  });
  return { ...t, stableKey };
}

function termAtom(value: string): TermRef {
  const label = normalizeAtomValue(value);
  return { type: "atom", atomKey: atomKeyFromLabel(label), label };
}

function termTriple(t: FlatTriple & { stableKey: string }): TermRef {
  return {
    type: "triple",
    tripleKey: t.stableKey,
    label: `${t.subject} · ${t.predicate} · ${t.object}`,
  };
}

function ensureEdgeKey(e: Omit<NestedEdge, "stableKey">): NestedEdge {
  const pred = safeTrim(e.predicate);
  if (!pred) {
    throw new Error(`[extract] NestedEdge missing predicate: ${JSON.stringify(e)}`);
  }
  if (!e.subject || !e.object) {
    throw new Error(`[extract] NestedEdge missing subject/object: ${JSON.stringify(e)}`);
  }

  return {
    ...e,
    stableKey: stableKeyFromEdge({
      from: e.subject,
      predicate: termAtom(pred),
      to: e.object,
    }),
  };
}

function pushEdge(nested: NestedEdge[], existing: Set<string>, edge: Omit<NestedEdge, "stableKey">) {
  const normalized = ensureEdgeKey(edge);
  if (existing.has(normalized.stableKey)) return;
  existing.add(normalized.stableKey);
  nested.push(normalized);
}

// Marker detection to skip unnecessary LLM calls
const DECOMPOSE_MARKERS = /\b(but|however|although|though|yet|because|therefore|so|if|unless|when|whenever|and)\b|,\s*which\b/i;
const RELATION_MARKERS = /\b(but|however|although|because|therefore|so|if|unless|when|and|or)\b|\b(could|may|might|will)\s+lead\s+to\b/i;

// Fallback LLM glue
function extractStatusCode(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;
  const e = error as Record<string, unknown>;
  const direct = e.statusCode ?? e.status;
  if (typeof direct === "number") return direct;
  const response = e.response;
  if (response && typeof response === "object") {
    const status = (response as Record<string, unknown>).status;
    if (typeof status === "number") return status;
  }
  return null;
}

function isGaiaFailure(error: unknown) {
  const status = extractStatusCode(error);
  if (status !== null && [404, 408, 429].includes(status)) return true;
  if (typeof status === "number" && status >= 500) return true;

  const msg = error instanceof Error ? error.message : String(error);
  return (
    msg.includes("Not Found") ||
    msg.includes("fetch failed") ||
    msg.includes("ECONNREFUSED") ||
    msg.includes("ETIMEDOUT") ||
    msg.includes("ENOTFOUND")
  );
}

async function generateWithFallback<M>(
  agent: { generate: (messages: M) => Promise<LlmResponse> },
  agentGroq: { generate: (messages: M) => Promise<LlmResponse> },
  messages: M,
) {
  try {
    return await agent.generate(messages);
  } catch (error) {
    if (!isGaiaFailure(error)) throw error;
    console.warn("[extract] Gaia failed -> fallback Groq");
    return await agentGroq.generate(messages);
  }
}

// Meta parsing
const REPORTING_VERBS = new Set([
  "said",
  "says",
  "suggest",
  "suggests",
  "suggested",
  "find",
  "finds",
  "found",
  "report",
  "reports",
  "reported",
  "estimate",
  "estimates",
  "estimated",
  "predict",
  "predicts",
  "predicted",
  "argue",
  "argues",
  "argued",
  "promise",
  "promises",
  "promised",
]);

export function parseMetaClaim(claim: string): { source: string; verb: string; proposition: string } | null {
  const c = claim.trim().replace(/\.$/, "");
  const m = c.match(/^(.+?)\s+([a-z]+)\s+that\s+(.+)$/i);
  if (!m) return null;
  const sourceRaw = m[1].trim();
  const verb = m[2].trim();
  const proposition = m[3].trim();
  if (!REPORTING_VERBS.has(verb.toLowerCase())) return null;
  if (!proposition) return null;
  return { source: sourceRaw, verb, proposition };
}

// Conditional parsing (depth<=2)
export type Conditional = { kw: "if" | "unless" | "when"; condText: string; mainText: string };

function parseConditionalKeyword(value: string): Conditional["kw"] | null {
  const lower = value.toLowerCase();
  return lower === "if" || lower === "unless" || lower === "when" ? lower : null;
}

export function parseConditional(text: string): Conditional | null {
  const s = text.trim().replace(/\.$/, "");

  let m = s.match(/^(If|Unless|When)\s+(.+?),\s+(.+)$/i);
  if (m) {
    const kw = parseConditionalKeyword(m[1]);
    if (!kw) return null;
    return { kw, condText: m[2].trim(), mainText: m[3].trim() };
  }

  m = s.match(/^(.+?)\s+(if|unless|when)\s+(.+)$/i);
  if (m) {
    const kw = parseConditionalKeyword(m[2]);
    if (!kw) return null;
    return { kw, condText: m[3].trim(), mainText: m[1].trim() };
  }

  return null;
}

// LLM wrappers
async function selectAndNormalizeSentence(header_context: string, previous_sentence: string, sentence: string) {
  const payload = JSON.stringify({ header_context, previous_sentence, sentence }, null, 2);

  const res = await generateWithFallback(
    selectionAgent,
    selectionAgentGroq,
    [{ role: "user", content: payload }]
  );

  const parsed = parseJsonOrNull(res.text ?? "");
  const out = SelectionSchema.safeParse(parsed);

  if (!out.success) {
    return {
      keep: true as const,
      sentence: sentence.trim(),
      kind: "other" as const,
      needs_context: false,
      missing: [],
    };
  }
  if (out.data.keep === false) return out.data;
  return out.data;
}

async function decomposeToClaims(header_context: string, sentence: string) {
  const payload = JSON.stringify({ header_context, sentence }, null, 2);

  const res = await generateWithFallback(
    decompositionAgent,
    decompositionAgentGroq,
    [{ role: "user", content: payload }]
  );

  const parsed = parseJsonOrNull(res.text ?? "");
  const out = ClaimsSchema.safeParse(parsed);
  if (!out.success) return [sentence.trim()];
  return out.data.claims.map(safeTrim).filter(Boolean);
}

// Graph extraction

type GraphResult = {
  core: FlatTriple;
  modifiers: Array<{ prep: string; value: string }>;
};

const DECOMPOSE_PREPS = /^(.+?)\s+(under|over|above|below|before|after|between|within|of|for|in|at|from|to|with|without|against)\s+(.+)$/i;

export function tryDecomposeValue(value: string): FlatTriple | null {
  const trimmed = value.trim();
  const words = trimmed.split(/\s+/);
  if (words.length < 3) return null;

  const match = trimmed.match(DECOMPOSE_PREPS);
  if (!match) return null;

  const subject = match[1].trim();
  const predicate = match[2].trim();
  const object = match[3].trim();

  if (!subject || !predicate || !object) return null;
  return { subject, predicate, object };
}

export function tryDecomposeSubject(core: FlatTriple): { prep: string; subTriple: FlatTriple } | null {
  const subj = core.subject.trim();
  const words = subj.split(/\s+/);
  if (words.length < 3) return null;

  const match = subj.match(DECOMPOSE_PREPS);
  if (!match) return null;

  const subject = match[1].trim();
  const prep = match[2].trim();
  const object = match[3].trim();

  if (!subject || !prep || !object) return null;
  return { prep, subTriple: { subject, predicate: prep, object } };
}

async function graphFromClaim(claimText: string, sentenceContext: string): Promise<GraphResult | null> {
  const payload = JSON.stringify({ claim: claimText, sentence_context: sentenceContext }, null, 2);

  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await generateWithFallback(
      graphExtractorAgent,
      graphExtractorAgentGroq,
      [{ role: "user", content: payload }],
    );

    const parsedAny = parseJsonOrNull(res.text ?? "");
    if (!parsedAny) continue;

    try {
      const parsed = GraphOutSchema.parse(parsedAny);
      const c = parsed.core;
      if (!c.subject?.trim() || !c.predicate?.trim() || !c.object?.trim()) continue;
      if (["for", "in", "of", "to", "by", "with"].includes(c.predicate.trim().toLowerCase())) continue;

      return {
        core: { subject: c.subject.trim(), predicate: c.predicate.trim(), object: c.object.trim() },
        modifiers: parsed.modifiers
          .map((m) => ({ prep: m.prep.trim(), value: m.value.trim() }))
          .filter((m) => m.prep && m.value),
      };
    } catch {
      continue;
    }
  }
  return null;
}

function pushModifierEdges(
  nested: NestedEdge[],
  existing: Set<string>,
  coreKeyed: FlatTriple & { stableKey: string },
  modifiers: GraphResult["modifiers"],
) {
  for (const mod of modifiers) {
    const decomposed = tryDecomposeValue(mod.value);
    if (decomposed) {
      const subTriple = tripleKeyed(decomposed);
      // Sub-triples from modifiers are NOT discourse units — they only exist as nested edges.
      // Do NOT push to item.claims (would cause index collision in relation linking).
      pushEdge(nested, existing, {
        kind: "modifier",
        origin: "agent",
        predicate: mod.prep,
        subject: termTriple(coreKeyed),
        object: termTriple(subTriple),
      });
    } else {
      pushEdge(nested, existing, {
        kind: "modifier",
        origin: "agent",
        predicate: mod.prep,
        subject: termTriple(coreKeyed),
        object: termAtom(mod.value),
      });
    }
  }
}

export async function runExtraction(inputText: string, options: ExtractionOptions = {}): Promise<ExtractionResult> {
  const segments = splitMarkdownIntoSentences(inputText);

  const perSegment: ExtractionResult["perSegment"] = [];
  const nested: ExtractionResult["nested"] = [];
  const themeContext = safeTrim(options.themeTitle);
  const parentContext = safeTrim(options.parentClaimText);

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const headerPath = (seg.headerPath ?? []).join(" > ");
    let header_context = themeContext
      ? (headerPath ? `${themeContext} > ${headerPath}` : themeContext)
      : headerPath;

    if (parentContext) {
      header_context = header_context
        ? `${header_context} | In reply to: "${parentContext}"`
        : `In reply to: "${parentContext}"`;
    }

    const prev = i > 0 ? segments[i - 1].sentence : "";

    const raw = stripOuterQuotes(seg.sentence);
    const selected = await selectAndNormalizeSentence(header_context, prev, raw);

    if (selected.keep === false) {
      perSegment.push({
        headerPath: seg.headerPath ?? [],
        sentence: seg.sentence,
        selectedSentence: null,
        claims: [],
      });
      continue;
    }

    const selectedSentence = safeTrim(selected.sentence) || raw;
    const sentenceContext = [parentContext, prev, selectedSentence].filter(Boolean).join(" ");

    const metaSentence = parseMetaClaim(ensurePeriod(selectedSentence));
    const rawClaims = metaSentence
      ? [ensurePeriod(selectedSentence)]
      : DECOMPOSE_MARKERS.test(selectedSentence)
        ? await decomposeToClaims(header_context, selectedSentence)
        : [ensurePeriod(selectedSentence)];

    const claims = dedupeStrings(rawClaims.map(ensurePeriod));

    const item: ExtractionResult["perSegment"][number] = {
      headerPath: seg.headerPath ?? [],
      sentence: seg.sentence,
      selectedSentence: selectedSentence || null,
      claims: [],
    };

    const existingNestedKeys = new Set<string>(nested.map((n) => n.stableKey));

    let tripleIdx = 0;
    for (let ci = 0; ci < claims.length; ci++) {
      const claim = claims[ci];

      const meta = parseMetaClaim(claim);
      if (meta) {
        const propGraph = await graphFromClaim(meta.proposition, sentenceContext);
        if (!propGraph) {
          item.claims.push({ index: tripleIdx++, claim, triple: null });
          continue;
        }

        const objectTriple = tripleKeyed(propGraph.core);
        item.claims.push({ index: tripleIdx++, claim, triple: objectTriple });

        pushEdge(nested, existingNestedKeys, {
          kind: "meta",
          origin: "agent",
          predicate: meta.verb,
          subject: termAtom(meta.source),
          object: termTriple(objectTriple),
        });

        pushModifierEdges(nested, existingNestedKeys, objectTriple, propGraph.modifiers);
        const metaSubjDecomp = tryDecomposeSubject(propGraph.core);
        if (metaSubjDecomp) {
          const subTriple = tripleKeyed(metaSubjDecomp.subTriple);
          pushEdge(nested, existingNestedKeys, {
            kind: "modifier",
            origin: "agent",
            predicate: metaSubjDecomp.prep,
            subject: termTriple(objectTriple),
            object: termTriple(subTriple),
          });
        }

        continue;
      }

      const cond = parseConditional(claim);
      if (cond) {
        const mainGraph = await graphFromClaim(cond.mainText, sentenceContext);
        const condGraph = await graphFromClaim(cond.condText, sentenceContext);

        if (mainGraph) {
          const mainKeyed = tripleKeyed(mainGraph.core);
          item.claims.push({ index: tripleIdx++, claim, triple: mainKeyed });
          pushModifierEdges(nested, existingNestedKeys, mainKeyed, mainGraph.modifiers);
          const mainSubjDecomp = tryDecomposeSubject(mainGraph.core);
          if (mainSubjDecomp) {
            const subTriple = tripleKeyed(mainSubjDecomp.subTriple);
            pushEdge(nested, existingNestedKeys, {
              kind: "modifier",
              origin: "agent",
              predicate: mainSubjDecomp.prep,
              subject: termTriple(mainKeyed),
              object: termTriple(subTriple),
            });
          }

          if (condGraph) {
            const condKeyed = tripleKeyed(condGraph.core);
            item.claims.push({ index: tripleIdx++, claim: cond.condText, triple: condKeyed });
            pushModifierEdges(nested, existingNestedKeys, condKeyed, condGraph.modifiers);
            const condSubjDecomp = tryDecomposeSubject(condGraph.core);
            if (condSubjDecomp) {
              const subTriple = tripleKeyed(condSubjDecomp.subTriple);
              pushEdge(nested, existingNestedKeys, {
                kind: "modifier",
                origin: "agent",
                predicate: condSubjDecomp.prep,
                subject: termTriple(condKeyed),
                object: termTriple(subTriple),
              });
            }

            pushEdge(nested, existingNestedKeys, {
              kind: "conditional",
              origin: "agent",
              predicate: cond.kw,
              subject: termTriple(mainKeyed),
              object: termTriple(condKeyed),
            });
          }
        } else {
          item.claims.push({ index: tripleIdx++, claim, triple: null });
        }

        continue;
      }

      const graph = await graphFromClaim(claim, sentenceContext);
      if (!graph) {
        item.claims.push({ index: tripleIdx++, claim, triple: null });
        continue;
      }

      const core = tripleKeyed(graph.core);
      item.claims.push({ index: tripleIdx++, claim, triple: core });
      pushModifierEdges(nested, existingNestedKeys, core, graph.modifiers);
      const stdSubjDecomp = tryDecomposeSubject(graph.core);
      if (stdSubjDecomp) {
        const subTriple = tripleKeyed(stdSubjDecomp.subTriple);
        pushEdge(nested, existingNestedKeys, {
          kind: "modifier",
          origin: "agent",
          predicate: stdSubjDecomp.prep,
          subject: termTriple(core),
          object: termTriple(subTriple),
        });
      }
    }

    // Discourse relations -> unified edges
    const idxToTriple = new Map<number, FlatTriple & { stableKey: string }>();
    for (const c of item.claims) {
      if (c.triple) idxToTriple.set(c.index, c.triple);
    }

    if (idxToTriple.size >= 2 && RELATION_MARKERS.test(selectedSentence)) {
      const relInput = {
        sentence: selectedSentence,
        claims: item.claims
          .filter((c) => c.triple)
          .map((c) => ({
            index: c.index,
            text: c.claim,
            core_triple: `(${c.triple!.subject} | ${c.triple!.predicate} | ${c.triple!.object})`,
          })),
      };

      const relRes = await generateWithFallback(
        relationAgent,
        relationAgentGroq,
        [{ role: "user", content: JSON.stringify(relInput, null, 2) }]
      );

      const relParsed = parseJsonOrNull(relRes.text ?? "");
      const relOut = RelationSchema.safeParse(relParsed);

      const ALLOWED_RELATION_PREDICATES = new Set([
        "but", "however", "although", "because", "therefore", "so",
        "if", "unless", "when", "and", "or",
        "could lead to", "may lead to", "might lead to", "will lead to",
      ]);

      if (relOut.success && Array.isArray(relOut.data.relations)) {
        for (const r of relOut.data.relations) {
          const normalizedPred = String(r.predicate).trim().toLowerCase();
          if (!ALLOWED_RELATION_PREDICATES.has(normalizedPred)) continue;
          const from = idxToTriple.get(r.from);
          const to = idxToTriple.get(r.to);
          if (!from || !to) continue;

          if (normalizedPred === "if" || normalizedPred === "unless" || normalizedPred === "when") {
            const maybe = stableKeyFromEdge({
              from: termTriple(from),
              predicate: termAtom(normalizedPred),
              to: termTriple(to),
            });
            if (existingNestedKeys.has(maybe)) continue;
          }

          pushEdge(nested, existingNestedKeys, {
            kind: "relation",
            origin: "agent",
            predicate: normalizedPred,
            subject: termTriple(from),
            object: termTriple(to),
          });
        }
      }
    }

    perSegment.push(item);
  }

  // Stance verification (global, all claims across segments)
  if (parentContext && options.userStance) {
    const seenKeys = new Set<string>();
    const allClaims: Array<{ stableKey: string; text: string; triple: string }> = [];
    for (const seg of perSegment) {
      for (const c of seg.claims) {
        if (!c.triple) continue;
        if (seenKeys.has(c.triple.stableKey)) continue;
        seenKeys.add(c.triple.stableKey);
        allClaims.push({
          stableKey: c.triple.stableKey,
          text: c.claim,
          triple: `${c.triple.subject} | ${c.triple.predicate} | ${c.triple.object}`,
        });
      }
    }

    if (allClaims.length > 0 && allClaims.length <= MAX_STANCE_CLAIMS) {
      const stanceInput = {
        parentClaim: parentContext,
        userStance: options.userStance,
        claims: allClaims,
      };

      try {
        const stanceRes = await generateWithFallback(
          stanceVerificationAgent,
          stanceVerificationAgentGroq,
          [{ role: "user", content: JSON.stringify(stanceInput, null, 2) }]
        );

        const stanceParsed = parseJsonOrNull(stanceRes.text ?? "");
        const stanceOut = StanceVerificationSchema.safeParse(stanceParsed);

        if (stanceOut.success) {
          const verificationMap = new Map(
            stanceOut.data.verifications.map((v) => [v.stableKey, v])
          );

          const matched = allClaims.filter((c) => verificationMap.has(c.stableKey)).length;
          if (matched < allClaims.length) {
            console.warn(
              `[stance-verification] Agent returned ${matched}/${allClaims.length} verifications`
            );
          }

          for (const seg of perSegment) {
            for (const c of seg.claims) {
              if (!c.triple) continue;
              const v = verificationMap.get(c.triple.stableKey);
              if (v) {
                c.suggestedStance = v.suggestedStance;
                c.stanceAligned = v.suggestedStance === options.userStance;
                c.stanceReason = v.reason;
              }
            }
          }
        } else {
          console.warn("[stance-verification] Schema parse failed:", stanceOut.error.message);
        }
      } catch (err) {
        console.warn("[stance-verification] Agent error (non-blocking):", err);
      }
    } else if (allClaims.length > MAX_STANCE_CLAIMS) {
      console.warn(
        `[stance-verification] Skipped: ${allClaims.length} claims exceeds limit of ${MAX_STANCE_CLAIMS}`
      );
    }
  }

  return { perSegment, nested };
}
