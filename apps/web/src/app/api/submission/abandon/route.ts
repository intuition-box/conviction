import { NextResponse } from "next/server";

import { prisma } from "@/server/db/prisma";
import { requireSiweAuth } from "@/server/auth/siwe";
import { isRecord } from "@/lib/isRecord";
import { getErrorMessage } from "@/lib/getErrorMessage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ABANDONABLE_STATUSES = new Set(["DRAFT", "EXTRACTING", "READY_TO_PUBLISH"]);

export async function POST(request: Request) {
  let auth: { userId: string };
  try {
    auth = await requireSiweAuth(request);
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error, "Unauthorized.") }, { status: 401 });
  }

  const body: unknown = await request.json().catch(() => null);
  if (!isRecord(body)) {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const submissionId = body.submissionId;
  if (typeof submissionId !== "string" || !submissionId.trim()) {
    return NextResponse.json({ error: "submissionId is required." }, { status: 400 });
  }

  const submission = await prisma.submission.findUnique({ where: { id: submissionId } });
  if (!submission) {
    return NextResponse.json({ error: "Submission not found." }, { status: 404 });
  }
  if (submission.userId !== auth.userId) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  if (!ABANDONABLE_STATUSES.has(submission.status)) {
    return NextResponse.json(
      { error: `Cannot abandon submission in ${submission.status} state.` },
      { status: 409 },
    );
  }

  await prisma.submission.update({ where: { id: submissionId }, data: { status: "FAILED" } });

  return NextResponse.json({ ok: true });
}
