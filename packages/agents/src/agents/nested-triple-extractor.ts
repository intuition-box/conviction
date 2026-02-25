import { z } from "zod";

export const FlatTripleSchema = z.object({
  subject: z.string().min(1),
  predicate: z.string().min(1),
  object: z.string().min(1),
});
export type FlatTriple = z.infer<typeof FlatTripleSchema>;

export const TripleNodeSchema = z.union([z.string().min(1), FlatTripleSchema]);
export type TripleNode = z.infer<typeof TripleNodeSchema>;

export const Nested2TripleSchema = z.object({
  subject: TripleNodeSchema,
  predicate: z.string().min(1),
  object: TripleNodeSchema,
});
export type Nested2Triple = z.infer<typeof Nested2TripleSchema>;
