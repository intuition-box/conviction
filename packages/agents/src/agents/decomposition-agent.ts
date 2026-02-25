import { Agent } from "@mastra/core/agent";
import { z } from "zod";
import { getGaia, getGaiaModelName } from "../providers/gaia.js";
import { getGroq } from "../providers/groq.js";
import { getGroqModelName } from "../providers/env.js";

export const ClaimsSchema = z.object({
  claims: z.array(z.string().min(1)).min(1),
});

export const decompositionAgent = new Agent({
  name: "Claimify-Decomposition",
  model: getGaia().chatModel(getGaiaModelName()),
  instructions: `
Return ONLY JSON: { "claims": ["..."] }. No markdown. No explanations.

INPUT:
{ "header_context": "...", "sentence": "..." }

GOAL (Claimify-inspired, meaning-first):
Extract a SMALL set of high-quality, standalone claims that are ENTAILED by the sentence.
Claims must be usable as debate units: clear, atomic, and minimally decontextualized.

FAITHFULNESS:
- Preserve meaning. Do NOT add new entities, new events, new numbers, or new causal relations.
- Keep all numbers/units/dates exactly as written.
- Keep polarity exactly (not/never).
- Keep conditional keywords exactly: if / unless / when.
- Keep "because" and "but" exactly if present.

LIGHT REWORDING (ALLOWED ONLY WHEN NECESSARY for standalone clarity):
✅ Allowed:
- remove leading first-person hedges ("I think", "In my opinion", etc).
- resolve pronouns ONLY when obvious and local (use header_context if needed).
- replace "which" with an explicit referent from the SAME sentence.
- convert fragments into full clauses.

STRICTLY FORBIDDEN:
- Do NOT introduce causal verbs/phrases ("led to", "resulted in", "due to", "as a result") unless present in the sentence.
- Do NOT re-attach qualifiers to a different clause (e.g., do NOT move "especially ..." onto a different verb).
- Do NOT create new abstractions ("promotion of", "reduction of", etc.) unless present.

SPLITTING:
Split ONLY when there are explicit discourse markers in the sentence.
Prefer 1–3 claims. Max 5.

Split markers:
- Contrast: but / however / although / though / yet
- Cause: because / therefore / so
- Condition/time: if / unless / when / whenever
- Which-clause: ", which ..."
- "and" if it connects:
  • two independent propositions, OR
  • two objects or subjects sharing the same verb, where each makes a distinct debatable claim
    (e.g., "increases transparency and public trust" → 2 claims:
     "X increases transparency." + "X increases public trust.")
  Do NOT split compound nouns or fixed expressions: "rock and roll", "supply and demand",
  "trial and error", "research and development", "law and order", "pros and cons", etc.
  Do NOT split simple enumerations of non-debatable items: "apples and oranges".

NEVER SPLIT on prepositional phrases:
- Prepositions (to, by, in, for, from, within, since, of, at, with, than, as) are NOT split markers.
- A sentence with a prepositional complement is ONE claim, not two.
- The prepositional part belongs to the same claim as the main verb.

DO NOT SPLIT (output exactly 1 claim):
- "The minimum wage should be raised to 20 dollars per hour." → 1 claim
- "Immigration has increased GDP by 2% in the last decade." → 1 claim
- "AI will replace most jobs within the next 10 years." → 1 claim
- "Social media should be banned for children under 16." → 1 claim
- "Nuclear energy is the safest form of power generation." → 1 claim
- "Global temperatures have risen by 1.2°C since pre-industrial levels." → 1 claim

REPORTING FRAMES (important for nested triples):
If the sentence has a reporting frame (said/suggested/found/reported/estimated/predicted/argued/promised/etc):
1) Output the PROPOSITION as its own standalone claim.
2) Output the META claim that attributes the proposition, using the exact pattern:
   "<source> <reporting verb> that <proposition>."

Example:
- Proposition: "Average saturated fat intake fell by 9% within six months."
- Meta: "A national health agency report found that average saturated fat intake fell by 9% within six months."

META + CONDITIONAL:
If the proposition contains if/when/unless:
- Keep the FULL conditional proposition as a claim.
- Add the CONDITION-ONLY claim (as a full clause, without the marker).
- Add the META claim that attributes the FULL conditional proposition (using the exact "<source> <verb> that <...>" pattern).

CONDITIONALS (non-meta):
If/when/unless:
1) Output the FULL conditional claim (must include the marker).
2) Output the CONDITION-ONLY claim as a full clause WITHOUT the marker.
3) ALSO output the MAIN-ONLY claim as a full clause WITHOUT the marker IF (and only if)
   the main clause is independently meaningful *and* still entailed without the condition.
   (Often it is NOT entailed, so prefer NOT to output it.)

WHICH-CLAUSE:
If the sentence contains ", which ...":
- Output a separate claim for the which-clause.
- Replace "which" with the nearest preceding EVENT/PROPOSITION (not merely the last noun).
- Do NOT repeat reporting frames inside the which-clause claim.

OUTPUT ORDER (important for downstream linking):
1) Proposition claims
2) Conditional full claims (then condition-only)
3) Which-clause claims
4) Meta attribution claims

DEDUPE:
Avoid duplicates or near-duplicates.
`,
});

export const decompositionAgentGroq = new Agent({
  name: "Claimify-Decomposition (Groq)",
  model: getGroq().chatModel(getGroqModelName()),
  instructions: decompositionAgent.instructions,
});
