import { Agent } from "@mastra/core/agent";
import { z } from "zod";
import { getGaia, getGaiaModelName } from "../providers/gaia.js";
import { getGroq } from "../providers/groq.js";
import { getGroqModelName } from "../providers/env.js";

export const GraphOutSchema = z.object({
  core: z.object({
    subject: z.string().min(1),
    predicate: z.string().min(1),
    object: z.string().min(1),
  }),
  modifiers: z
    .array(
      z.object({
        prep: z.string().min(1),
        value: z.string().min(1),
      }),
    )
    .default([]),
});

export type GraphOut = z.infer<typeof GraphOutSchema>;

export const graphExtractorAgent = new Agent({
  name: "Graph Extractor (core triple + modifiers)",
  model: getGaia().chatModel(getGaiaModelName()),
  instructions: `
Extract ONE core semantic triple + prepositional modifiers from a claim.

Return ONLY JSON. No markdown. No code fences. No explanations.

Input JSON:
{ "claim": "...", "sentence_context": "..." }

Output EXACTLY:
{ "core": { "subject":"...", "predicate":"...", "object":"..." }, "modifiers": [...] }

RULE PRIORITY (when rules conflict):
1. Faithfulness — preserve the original meaning, tense, modality, and negation exactly.
2. Reusability — prefer short, reusable atoms (subject/object).
3. Fluency — natural English phrasing in the predicate.
Never sacrifice meaning for shorter atoms.

CORE TRIPLE:
- Keep subject/predicate/object MINIMAL. Strip prepositional phrases into modifiers.
- Subject = grammatical subject (may include more than a word like "Carbon emissions").
- Predicate = main verb/copula + modals (should/must/can/will) + negation (not/never).
  Include adjective complements in the predicate when the verb requires them:
  "makes X worse" => predicate "makes worse", object "X".
- Object = direct complement only. No trailing "by X", "for X", "in X", etc.
  Adverbs that are part of the verbal phrase stay in the object:
  "drives capital offshore" => object "capital offshore".
- When a preposition is essential to the verb's meaning (hide X about Y, spread lies about Y,
  invest in Y, rely on Y, profit from Y, spy on Y, worry about Y), fold "verb + [noun] + prep"
  into the predicate so the object is a reusable atom. Only split into a modifier when the prep
  phrase is truly optional context (time, place, quantity).
- Do NOT output a bare preposition as predicate (for/in/of/to/by/with).

ATOM REUSABILITY:
- Target 1-4 words for subject and object. Longer is acceptable for proper nouns,
  fixed terms, or compound concepts (e.g. "Ultra-processed foods", "Carbon emissions from aviation").
- Prefer common nouns/noun phrases that others would independently use as atoms.
- If subject or object exceeds 4 words AND can be restructured without losing meaning, do so.

DENOMINALIZATION:
- If the subject is a nominalization (The impact/effect/influence/role/growth/decline/
  failure/adoption/increase/lack/rise/cost of X), extract X as subject and fold the
  nominalization into an active predicate.
- Preserve tense/modality/negation from the original: "will be positive" → "will positively impact"
  (keep "will"), "has not reduced" → keep "has not".
- Avoid copula + vague adjective (is/will be + positive/negative/important/significant)
  ONLY when the sentence is a nominalization. Keep copula when it is structurally
  informative: comparatives (is safer than), classification (is a type of), identity (is the capital of).

COMPARATIVES (than / as...as):
- "X is ADJ-er than Y" → predicate includes "is ADJ-er than", object is Y.
- "X is more ADJ than Y" → predicate includes "is more ADJ than", object is Y.
- "X is as ADJ as Y" → predicate includes "is as ADJ as", object is Y.
- NEVER strip "than" or comparative "as" into a modifier.

PRONOUN RESOLUTION:
- Use sentence_context ONLY to resolve an obvious leading pronoun subject (It/This/They/These/Those).
- Do NOT rewrite other words.

MODIFIERS:
- Each modifier = { "prep": "<preposition>", "value": "<complement>" }
- Common preps: about, by, for, in, of, since, within, to, from, at, as, with, on, through, over, against
- Only extract modifiers EXPLICIT in the claim. Do not invent.
- If no modifiers, output empty array.

EXAMPLES:

Claim: "Social media should be banned for children under 16."
=> { "core": { "subject": "Social media", "predicate": "should be", "object": "banned" },
     "modifiers": [{ "prep": "for", "value": "children under 16" }] }

Claim: "Global temperatures have risen by 1.2°C since pre-industrial levels."
=> { "core": { "subject": "Global temperatures", "predicate": "have", "object": "risen" },
     "modifiers": [{ "prep": "by", "value": "1.2°C" }, { "prep": "since", "value": "pre-industrial levels" }] }

Claim: "The US national debt exceeded 34 trillion dollars in 2024."
=> { "core": { "subject": "The US national debt", "predicate": "exceeded", "object": "34 trillion dollars" },
     "modifiers": [{ "prep": "in", "value": "2024" }] }

Claim: "Ultra-processed foods increase cancer risk by 30%."
=> { "core": { "subject": "Ultra-processed foods", "predicate": "increase", "object": "cancer risk" },
     "modifiers": [{ "prep": "by", "value": "30%" }] }

Claim: "Remote work increases productivity."
=> { "core": { "subject": "Remote work", "predicate": "increases", "object": "productivity" },
     "modifiers": [] }

Claim: "Nuclear energy is the safest form of power generation."
=> { "core": { "subject": "Nuclear energy", "predicate": "is", "object": "the safest form" },
     "modifiers": [{ "prep": "of", "value": "power generation" }] }

Claim: "Rent control makes housing shortages worse."
=> { "core": { "subject": "Rent control", "predicate": "makes worse", "object": "housing shortages" },
     "modifiers": [] }

Claim: "Carbon emissions from aviation account for 3% of global warming."
=> { "core": { "subject": "Carbon emissions from aviation", "predicate": "account for", "object": "3%" },
     "modifiers": [{ "prep": "of", "value": "global warming" }] }

Claim: "AI will replace most jobs within the next 10 years."
=> { "core": { "subject": "AI", "predicate": "will replace", "object": "most jobs" },
     "modifiers": [{ "prep": "within", "value": "the next 10 years" }] }

Claim: "The minimum wage should be raised to 20 dollars per hour."
=> { "core": { "subject": "The minimum wage", "predicate": "should be", "object": "raised" },
     "modifiers": [{ "prep": "to", "value": "20 dollars per hour" }] }

Claim: "Vaccines are safe for children over 5."
=> { "core": { "subject": "Vaccines", "predicate": "are", "object": "safe" },
     "modifiers": [{ "prep": "for", "value": "children over 5" }] }

Claim: "Taxing the rich drives capital offshore."
=> { "core": { "subject": "Taxing the rich", "predicate": "drives", "object": "capital offshore" },
     "modifiers": [] }

Claim: "Free speech doesn't mean freedom from consequences."
=> { "core": { "subject": "Free speech", "predicate": "doesn't mean", "object": "freedom" },
     "modifiers": [{ "prep": "from", "value": "consequences" }] }

Claim: "Student loan debt in the US has exceeded 1.7 trillion dollars."
=> { "core": { "subject": "Student loan debt", "predicate": "has exceeded", "object": "1.7 trillion dollars" },
     "modifiers": [{ "prep": "in", "value": "the US" }] }

Claim: "Remote work is better than office work."
=> { "core": { "subject": "Remote work", "predicate": "is better than", "object": "office work" },
     "modifiers": [] }

Claim: "Nuclear energy is safer than coal."
=> { "core": { "subject": "Nuclear energy", "predicate": "is safer than", "object": "coal" },
     "modifiers": [] }

Claim: "Public transport is more efficient than driving for daily commutes."
=> { "core": { "subject": "Public transport", "predicate": "is more efficient than", "object": "driving" },
     "modifiers": [{ "prep": "for", "value": "daily commutes" }] }

Claim: "The impact of AI in the creative sector will be positive."
=> { "core": { "subject": "AI", "predicate": "will positively impact", "object": "the creative sector" },
     "modifiers": [] }

Claim: "The influence of social media on teenagers is harmful."
=> { "core": { "subject": "Social media", "predicate": "harms", "object": "teenagers" },
     "modifiers": [] }

Claim: "The adoption of renewable energy will reduce emissions."
=> { "core": { "subject": "Renewable energy", "predicate": "will reduces", "object": "emissions" },
     "modifiers": [] }

Claim: "The growth of e-commerce has hurt small businesses."
=> { "core": { "subject": "E-commerce", "predicate": "has hurt", "object": "small businesses" },
     "modifiers": [] }

Claim: "Public trust depends on transparency in scientific research."
=> { "core": { "subject": "Public trust", "predicate": "depends on", "object": "transparency" },
     "modifiers": [{ "prep": "in", "value": "scientific research" }] }

Claim: "Governments hide information about the true shape of the Earth."
=> { "core": { "subject": "Governments", "predicate": "hide information about", "object": "the shape of the Earth" },
     "modifiers": [] }
`,
});

export const graphExtractorAgentGroq = new Agent({
  name: "Graph Extractor (Groq)",
  model: getGroq().chatModel(getGroqModelName()),
  instructions: graphExtractorAgent.instructions,
});
