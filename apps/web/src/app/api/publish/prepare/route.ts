import { NextResponse } from "next/server";

import { prisma } from "@/server/db/prisma";
import { requireSiweAuth } from "@/server/auth/siwe";
import { canTransitionStatus } from "@/server/validation";
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
        { status: 401 }
      );
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
    }

    const { submissionId, idempotencyKey } = body as {
      submissionId?: string;
      idempotencyKey?: string;
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

    // Idempotent replay: already published
    if (submission.status === "PUBLISHED") {
      if (submission.publishedPostId) {
        return NextResponse.json({
          alreadyPublished: true,
          postId: submission.publishedPostId,
        });
      }
      return NextResponse.json(
        { error: "Submission is already published but has no associated post." },
        { status: 409 }
      );
    }

    // Already PUBLISHING with same key → OK (idempotent retry)
    if (submission.status === "PUBLISHING" && submission.publishIdempotencyKey === idempotencyKey) {
      return NextResponse.json({ ok: true });
    }

    // Already PUBLISHING with different key → conflict (suggest auto-cancel)
    if (submission.status === "PUBLISHING" && submission.publishIdempotencyKey !== idempotencyKey) {
      return NextResponse.json(
        {
          error: "Submission is already being published by another process.",
          existingKey: submission.publishIdempotencyKey,
        },
        { status: 409 }
      );
    }

    // Validate transition READY_TO_PUBLISH → PUBLISHING
    if (!canTransitionStatus(submission.status, "PUBLISHING")) {
      return NextResponse.json(
        { error: `Cannot transition from "${submission.status}" to PUBLISHING.` },
        { status: 409 }
      );
    }

    // Lock submission for publishing
    await prisma.submission.update({
      where: { id: submissionId },
      data: {
        status: "PUBLISHING",
        publishIdempotencyKey: idempotencyKey,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    console.error("Error in /api/publish/prepare:", error);
    return NextResponse.json(
      { error: getErrorMessage(error, "An unexpected error occurred.") },
      { status: 500 }
    );
  }
}
