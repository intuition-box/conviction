import { Agent } from "@mastra/core/agent";
import { z } from "zod";
import { getGaia, getGaiaModelName } from "../providers/gaia.js";
import { getGroq } from "../providers/groq.js";
import { getGroqModelName } from "../providers/env.js";


export const SelectionSchema = z.union([
  z.object({
    keep: z.literal(true),
    // Minimally normalized sentence, entailed by the original sentence + provided context.
    sentence: z.string().min(1),
    // High-level type. Used for UI + downstream heuristics.
    kind: z.enum(["factual", "normative", "preference", "question", "meta", "other"]),
    // If the sentence still contains unresolved references, tell downstream.
    needs_context: z.boolean().default(false),
    missing: z.array(z.string().min(1)).default([]),
  }),
  z.object({ keep: z.literal(false), reason: z.string().min(1) }),
]);

export const selectionAgent = new Agent({
  name: "Claimify-Selection+Normalize",
  model: getGaia().chatModel(getGaiaModelName()),
  instructions: `
You are the Selection + Minimal Normalization stage of a claim extraction pipeline for a debate app.

Return ONLY JSON. No markdown. No code fences. No explanations.

INPUT JSON:
{ "header_context": "...", "previous_sentence": "...", "sentence": "..." }

OUTPUT must be EXACTLY one of:
- { "keep": false, "reason": "..." }
- { "keep": true, "sentence": "...", "kind": "factual|normative|preference|question|meta|other", "needs_context": true|false, "missing": ["..."] }

SELECTION RULES (keep=true when at least one applies):
1) Factual / descriptive proposition (can be true or false).
2) Causal / conditional / comparative proposition.
3) Normative claim ("should", "must", "ought", "policy should").
4) Preference claim ("X is better than Y", "I prefer X to Y").
5) Attribution/meta claim that contains a proposition ("Researchers found that ...").

DROP (keep=false) when it's mostly:
- Pure rhetoric or emotion with no proposition ("This is ridiculous", "lol", "wow").
- Politeness / filler / backchannel.
- Procedural/meta with no content ("Let's discuss", "In conclusion").
- A question with no embedded proposition.

KIND CLASSIFICATION:
- "normative" if it includes should/must/ought/recommend/ban/allow.
- "preference" if it expresses subjective preference or better/worse WITHOUT a verifiable proposition.
- "meta" if it is about someone saying/reporting/finding/arguing a proposition.
- "question" if it's a question.
- otherwise "factual" or "other".

MINIMAL NORMALIZATION (allowed ONLY if it increases standalone clarity; must remain entailed):
1) Remove leading personal hedges ONLY at the start:
   "I think", "I believe", "In my opinion", "In my view", "Personally", "From my perspective", "To me".
2) Remove leading discourse fluff ONLY at the start:
   "Overall,", "Basically,", "In short,", "To be clear,".
3) Resolve anaphora ONLY when obvious and local:
   - If the sentence STARTS with "It/This/They/These/Those" and previous_sentence contains a clear noun phrase subject,
     replace ONLY that leading pronoun with that noun phrase.
   - If you cannot resolve safely, set needs_context=true and add a short missing hint (e.g., "Who is 'they'?").
4) Keep numbers/units/dates EXACTLY.
5) Keep negations EXACTLY (not/never/no).

STRICTLY FORBIDDEN:
- Do NOT paraphrase.
- Do NOT merge sentences.
- Do NOT add new entities, causes, or quantifiers.
- Do NOT delete internal clauses ("especially ...", "within six months", etc.).
`,
});

export const selectionAgentGroq = new Agent({
  name: "Claimify-Selection+Normalize (Groq)",
  model: getGroq().chatModel(getGroqModelName()),
  instructions: selectionAgent.instructions,
});
