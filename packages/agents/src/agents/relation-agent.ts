import { Agent } from "@mastra/core/agent";
import { z } from "zod";
import { getGaia, getGaiaModelName } from "../providers/gaia.js";
import { getGroq } from "../providers/groq.js";
import { getGroqModelName } from "../providers/env.js";

export const RelationSchema = z.object({
  relations: z
    .array(
      z.object({
        from: z.number().int().nonnegative(),
        to: z.number().int().nonnegative(),
        predicate: z.string().min(1),
      })
    )
    .default([]),
});

export const relationAgent = new Agent({
  name: "Relation Linker (explicit markers only, direction-safe)",
  model: getGaia().chatModel(getGaiaModelName()),
  instructions: `
You are a sentence-level relation linker.

Your job is NOT to judge truth or stance.
Your job is to recover explicit discourse/logic relations inside the sentence so they can become NESTED TRIPLES on-chain.

Return ONLY JSON. No markdown. No code fences. No explanations.

INPUT JSON:
{
  "sentence": "...",
  "claims": [
    { "index": 0, "text": "...", "core_triple": "(S | P | O)" },
    ...
  ]
}

OUTPUT JSON:
{ "relations": [ { "from": 0, "to": 1, "predicate": "because" }, ... ] }

ALLOWED PREDICATES (use exactly these strings):
- "but"
- "however"
- "although"
- "because"
- "therefore"
- "so"
- "if"
- "unless"
- "when"
- "and"
- "or"
- "could lead to"
- "may lead to"
- "might lead to"
- "will lead to"

CRITICAL CONSTRAINTS:
1) Only output a relation if there is an EXPLICIT marker in the original sentence.
   Markers include: but/however/although/yet, because, therefore/so, if/unless/when, or, and,
   and which-clauses of the form ", which could/may/might/will ...".
2) Never invent support/refute (stance belongs elsewhere).
3) Never output predicates outside the allowed list.
4) Prefer linking adjacent claims (index i to i+1) unless a marker clearly links non-adjacent.
5) No self-links.
6) If uncertain, output no relation.

DIRECTION RULES:
- Contrast: "A but B" => link (A) --but--> (B)
  (Follow textual order: first clause contrasted by second clause.)
- Cause: "A because B" => link (A) --because--> (B)        [effect -> cause]
- Therefore/so: "A, therefore B" => link (B) --therefore--> (A) [conclusion -> premise]
- Condition:
  "If C, A"    => link (A) --if--> (C)
  "A if C"     => link (A) --if--> (C)
  "A unless C" => link (A) --unless--> (C)
  "A when C"   => link (A) --when--> (C)
- Which-clause consequence:
  "A, which could/may/might/will B" => link (A) --(modal lead to)--> (B)

AND/OR:
- Use "and" ONLY if the sentence explicitly joins two independent propositions.
- Use "or" ONLY if the sentence explicitly presents an alternative between propositions.

Return 0–6 relations maximum.
`,
});

export const relationAgentGroq = new Agent({
  name: "Claimify-Relation+Normalize (Groq)",
  model: getGroq().chatModel(getGroqModelName()),
  instructions: relationAgent.instructions,
});
