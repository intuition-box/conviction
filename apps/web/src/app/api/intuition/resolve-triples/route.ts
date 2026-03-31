import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isAddress } from "viem";

import { resolveTripleIds } from "@/lib/intuition/resolve";
import { fetchTripleDetailsBatch } from "@/lib/intuition/graphql-queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  address: z.string().refine(isAddress, "Invalid address").optional(),
  combinations: z
    .array(z.tuple([z.string().min(1), z.string().min(1), z.string().min(1)]))
    .max(300)
    .optional(),
  tripleIds: z
    .array(z.string().min(1))
    .max(100)
    .optional(),
}).refine(
  (d) => (d.combinations?.length ?? 0) > 0 || (d.tripleIds?.length ?? 0) > 0,
  "At least one of combinations or tripleIds must be provided",
);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = schema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid payload", code: "VALIDATION_ERROR" },
        { status: 400 },
      );
    }

    const { address, combinations, tripleIds } = parsed.data;

    // Anti-abuse logging
    if ((combinations?.length ?? 0) > 50) {
      console.warn(
        `[resolve-triples] large request: ${combinations!.length} combinations from ${request.headers.get("x-forwarded-for") ?? "unknown"}`,
      );
    }

    const byKey = combinations?.length && address
      ? await resolveTripleIds(address, combinations)
      : {};

    let byTripleId: Record<string, { sId: string; pId: string; oId: string; sLabel: string; pLabel: string; oLabel: string }> | undefined;
    if (tripleIds?.length) {
      const triples = await fetchTripleDetailsBatch(tripleIds);
      byTripleId = {};
      for (const t of triples) {
        const termId = t.term_id ? String(t.term_id) : null;
        if (!termId) continue;
        const sId = t.subject?.term_id ? String(t.subject.term_id) : null;
        const pId = t.predicate?.term_id ? String(t.predicate.term_id) : null;
        const oId = t.object?.term_id ? String(t.object.term_id) : null;
        if (!sId || !pId || !oId) continue;
        byTripleId[termId] = {
          sId, pId, oId,
          sLabel: t.subject?.label ?? "",
          pLabel: t.predicate?.label ?? "",
          oLabel: t.object?.label ?? "",
        };
      }
    }

    return NextResponse.json({ byKey, byTripleId });
  } catch (error) {
    console.error("POST /api/intuition/resolve-triples failed:", error);
    return NextResponse.json(
      { error: "Failed to resolve triple IDs", code: "RESOLVE_TRIPLES_FAILED" },
      { status: 502 },
    );
  }
}
