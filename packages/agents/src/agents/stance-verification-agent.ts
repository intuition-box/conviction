import { Agent } from "@mastra/core/agent";
import { z } from "zod";
import { getGaia, getGaiaModelName } from "../providers/gaia.js";
import { getGroq } from "../providers/groq.js";
import { getGroqModelName } from "../providers/env.js";

export const StanceVerificationSchema = z.object({
  verifications: z.array(
    z.object({
      stableKey: z.string(),
      alignsWithStance: z.boolean(),
      suggestedStance: z.enum(["SUPPORTS", "REFUTES"]),
      reason: z.string().optional(),
    })
  ),
});

export type StanceVerification = z.infer<typeof StanceVerificationSchema>;

export const stanceVerificationAgent = new Agent({
  name: "Stance Verification (semantic alignment checker)",
  model: getGaia().chatModel(getGaiaModelName()),
  instructions: `
You are a semantic stance classifier.

Given a parent claim and a user's declared stance (SUPPORTS or REFUTES), determine whether each extracted child claim actually aligns with that stance.

Return ONLY JSON. No markdown. No code fences. No explanations.

INPUT JSON:
{
  "parentClaim": "...",
  "userStance": "SUPPORTS",
  "claims": [
    { "stableKey": "abc123", "text": "...", "triple": "S | P | O" }
  ]
}

OUTPUT JSON:
{
  "verifications": [
    { "stableKey": "abc123", "alignsWithStance": true, "suggestedStance": "SUPPORTS" }
  ]
}

CLASSIFICATION RULES:

Your classification is SEMANTIC, not grammatical.

SUPPORTS means the child claim reinforces, confirms, extends, provides evidence for, or agrees with the parent claim.
REFUTES means the child claim contradicts, limits, weakens, provides a counter-argument to, or disagrees with the parent claim.

KEY PRINCIPLES:
- A grammatically positive claim can REFUTE: "Solar is cheaper" refutes "Nuclear is the best energy source"
- A grammatically negative claim can SUPPORT: "Pollution isn't decreasing" supports "We need stronger climate policy"
- Focus on the semantic relationship between child and parent, not on the grammar of the child alone
- Consider the full meaning of the triple (S | P | O), not just individual terms

OUTPUT RULES:
- For EACH claim in the input, produce EXACTLY ONE entry in verifications with the SAME stableKey
- Set suggestedStance to SUPPORTS or REFUTES based on your semantic analysis
- Set alignsWithStance to true if suggestedStance matches userStance, false otherwise
- When alignsWithStance is false, provide a brief reason explaining the mismatch
- When alignsWithStance is true, reason is optional (omit it)

EXAMPLES:

Parent: "Nuclear energy is the safest form of power generation"
UserStance: SUPPORTS
Claim: "Nuclear has the lowest death rate per TWh" => SUPPORTS (provides evidence)
Claim: "Chernobyl caused thousands of deaths" => REFUTES (counter-argument)
Claim: "Solar is safer than nuclear" => REFUTES (contradicts parent)

Parent: "Remote work reduces productivity"
UserStance: REFUTES
Claim: "Studies show remote workers complete more tasks" => REFUTES (contradicts parent)
Claim: "Home distractions lower focus" => SUPPORTS (agrees with parent, misaligned with user stance)
`,
});

export const stanceVerificationAgentGroq = new Agent({
  name: "Stance Verification (Groq)",
  model: getGroq().chatModel(getGroqModelName()),
  instructions: stanceVerificationAgent.instructions,
});
