import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { resolveAtomIds } from "@/lib/intuition/intuition-read";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  labels: z.array(z.string().trim().min(1).max(500)).min(1).max(300),
});

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

    const atoms = await resolveAtomIds(parsed.data.labels);

    return NextResponse.json({ atoms });
  } catch (error) {
    console.error("POST /api/intuition/resolve-atoms failed:", error);
    return NextResponse.json(
      { error: "Failed to resolve atom IDs", code: "RESOLVE_ATOMS_FAILED" },
      { status: 502 },
    );
  }
}
