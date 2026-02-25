import { NextResponse } from "next/server";

import { prisma } from "@/server/db/prisma";
import { validateSubmissionRequest } from "@/server/api/validateSubmission";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const result = await validateSubmissionRequest(request);
  if (!result.ok) return result.response;

  const {
    userId, themeSlug,
    normalizedParentPostId, normalizedStance, trimmedInput,
  } = result.data;

  const submission = await prisma.submission.create({
    data: {
      userId,
      themeSlug,
      parentPostId: normalizedParentPostId,
      stance: normalizedStance,
      inputText: trimmedInput,
      status: "READY_TO_PUBLISH",
    },
  });

  return NextResponse.json({
    submission: {
      id: submission.id,
      status: submission.status,
      createdAt: submission.createdAt.toISOString(),
    },
  });
}
