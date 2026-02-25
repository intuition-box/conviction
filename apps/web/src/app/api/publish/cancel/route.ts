import { NextResponse } from "next/server";

import { prisma } from "@/server/db/prisma";
import { requireSiweAuth } from "@/server/auth/siwe";
import { getErrorMessage } from "@/lib/getErrorMessage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    let auth: { userId: string };
    try {
      auth = await requireSiweAuth(request);
    } catch (error: unknown) {
      return NextResponse.json(
        { error: getErrorMessage(error, "Unauthorized.") },
        { status: 401 },
      );
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
    }

    const { submissionId, idempotencyKey, reason } = body as {
      submissionId?: string;
      idempotencyKey?: string;
      reason?: string;
    };

    if (!submissionId || typeof submissionId !== "string") {
      return NextResponse.json({ error: "submissionId is required." }, { status: 400 });
    }

    if (!idempotencyKey || typeof idempotencyKey !== "string") {
      return NextResponse.json({ error: "idempotencyKey is required." }, { status: 400 });
    }

    const submission = await prisma.submission.findUnique({
      where: { id: submissionId },
    });

    if (!submission) {
      return NextResponse.json({ error: "Submission not found." }, { status: 404 });
    }

    if (submission.userId !== auth.userId) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    if (submission.status !== "PUBLISHING") {
      return NextResponse.json(
        { error: `Submission is not in PUBLISHING state (current: "${submission.status}").` },
        { status: 409 },
      );
    }

    if (submission.publishIdempotencyKey !== idempotencyKey) {
      return NextResponse.json(
        { error: "Idempotency key mismatch." },
        { status: 409 },
      );
    }

    // Reset to READY_TO_PUBLISH — user can retry immediately
    await prisma.submission.update({
      where: { id: submissionId },
      data: {
        status: "READY_TO_PUBLISH",
        publishIdempotencyKey: null,
      },
    });

    return NextResponse.json({
      ok: true,
      status: "READY_TO_PUBLISH",
      reason: reason ?? "cancelled",
    });
  } catch (error: unknown) {
    console.error("Error in /api/publish/cancel:", error);
    return NextResponse.json(
      { error: getErrorMessage(error, "An unexpected error occurred.") },
      { status: 500 },
    );
  }
}
