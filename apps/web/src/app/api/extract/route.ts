import { NextResponse } from "next/server";
import { runExtraction } from "@db/agents";

import { prisma } from "@/server/db/prisma";
import { normalizeLabelForChain } from "@/lib/format/normalizeLabel";
import { validateSubmissionRequest } from "@/server/api/validateSubmission";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AgentTriple = {
  subject: string;
  predicate: string;
  object: string;
  stableKey?: string;
};

type AgentClaim = {
  triple: AgentTriple | null;
  suggestedStance?: "SUPPORTS" | "REFUTES";
  stanceAligned?: boolean;
  stanceReason?: string;
};

type AgentSegment = {
  claims: AgentClaim[];
  sentence: string;
};

type AgentTermRef =
  | { type: "atom"; atomKey: string; label: string }
  | { type: "triple"; tripleKey: string };

type AgentNestedEdge = {
  kind: string;
  origin: string;
  predicate: string;
  subject: AgentTermRef;
  object: AgentTermRef;
  stableKey: string;
};

type AgentExtractionResult = {
  perSegment: AgentSegment[];
  nested: AgentNestedEdge[];
};

type ProposalSeed = {
  sText: string;
  pText: string;
  oText: string;
  key: string;
  stableKey: string | null;
  suggestedStance?: "SUPPORTS" | "REFUTES";
  stanceAligned?: boolean;
  stanceReason?: string;
  segmentIndex: number;
  sentenceText: string;
};

type NestedProposalSeed = {
  edgeKind: string;
  predicate: string;
  subject: AgentTermRef;
  object: AgentTermRef;
  stableKey: string;
};

type ErrorInfo = {
  message: string;
  name?: string;
  stack?: string | null;
};

// Chain normalization: use normalizeLabelForChain from @/lib/normalizeLabel
const normalizeText = normalizeLabelForChain;

function normalizeKey(text: string): string {
  return normalizeText(text).toLowerCase();
}

function buildKey(sText: string, pText: string, oText: string): string {
  return `${normalizeKey(sText)}|${normalizeKey(pText)}|${normalizeKey(oText)}`;
}

function collectCandidates(result: AgentExtractionResult): ProposalSeed[] {
  const seen = new Map<string, ProposalSeed>();
  const out: ProposalSeed[] = [];

  for (let segIdx = 0; segIdx < result.perSegment.length; segIdx++) {
    const segment = result.perSegment[segIdx];
    for (const claim of segment.claims) {
      const triple = claim.triple;
      if (!triple) continue;

      const sText = normalizeText(triple.subject);
      const pText = normalizeText(triple.predicate);
      const oText = normalizeText(triple.object);
      if (!sText || !pText || !oText) continue;

      const key = buildKey(sText, pText, oText);

      if (seen.has(key)) {
        // DT-2: merge — stanceAligned=false wins
        const existing = seen.get(key)!;
        if (claim.stanceAligned === false) {
          if (existing.stanceAligned !== false) {
            existing.suggestedStance = claim.suggestedStance;
            existing.stanceAligned = false;
            existing.stanceReason = claim.stanceReason;
          } else {
            if (!existing.stanceReason && claim.stanceReason) {
              existing.stanceReason = claim.stanceReason;
            }
            if (!existing.suggestedStance && claim.suggestedStance) {
              existing.suggestedStance = claim.suggestedStance;
            }
          }
        }
        continue;
      }

      const seed: ProposalSeed = {
        sText, pText, oText, key,
        stableKey: triple.stableKey ?? null,
        suggestedStance: claim.suggestedStance,
        stanceAligned: claim.stanceAligned,
        stanceReason: claim.stanceReason,
        segmentIndex: segIdx,
        sentenceText: segment.sentence ?? "",
      };
      seen.set(key, seed);
      out.push(seed);
    }
  }

  return out;
}

function collectNestedProposals(nested: AgentNestedEdge[]): NestedProposalSeed[] {
  const seen = new Set<string>();
  const out: NestedProposalSeed[] = [];

  for (const edge of nested) {
    if (seen.has(edge.stableKey)) continue;
    seen.add(edge.stableKey);

    out.push({
      edgeKind: edge.kind,
      predicate: edge.predicate,
      subject: edge.subject,
      object: edge.object,
      stableKey: edge.stableKey,
    });
  }

  return out;
}

function toSafeError(error: unknown): ErrorInfo {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack ?? null,
    };
  }

  return {
    message: typeof error === "string" ? error : "Unknown error",
    stack: null,
  };
}

export async function POST(request: Request) {
  const result = await validateSubmissionRequest(request, { includeParentBody: true });
  if (!result.ok) return result.response;

  const {
    userId, themeSlug, trimmedInput,
    normalizedParentPostId, normalizedStance,
    theme, parentBody: parentClaimText,
  } = result.data;

  // Create submission to track workflow
  const submission = await prisma.submission.create({
    data: {
      userId,
      themeSlug,
      parentPostId: normalizedParentPostId,
      stance: normalizedStance,
      inputText: trimmedInput,
      status: "EXTRACTING",
    },
  });

  const themeName = theme.name;

  try {
    const extraction = await runExtraction(trimmedInput, {
      themeTitle: themeName,
      parentClaimText,
      userStance: normalizedStance,
    });
    const candidates = collectCandidates(extraction);
    const nestedSeeds = collectNestedProposals(extraction.nested ?? []);

    // Update submission status to READY_TO_PUBLISH
    await prisma.submission.update({
      where: { id: submission.id },
      data: {
        status: "READY_TO_PUBLISH",
      },
    });

    // Return extraction results directly (proposals live in React state, not DB)
    return NextResponse.json({
      submission: {
        id: submission.id,
        status: "READY_TO_PUBLISH",
        createdAt: submission.createdAt.toISOString(),
        userId: submission.userId,
        themeSlug: submission.themeSlug,
        parentPostId: submission.parentPostId,
        stance: submission.stance,
      },
      proposals: candidates.map((candidate, index) => ({
        id: `proposal_${submission.id}_${index}`,
        kind: "TRIPLE" as const,
        payload: {
          subject: candidate.sText,
          predicate: candidate.pText,
          object: candidate.oText,
          stableKey: candidate.stableKey,
          suggestedStance: candidate.suggestedStance ?? null,
          stanceAligned: candidate.stanceAligned ?? null,
          stanceReason: candidate.stanceReason ?? null,
          sentenceText: candidate.sentenceText,
          segmentIndex: candidate.segmentIndex,
        },
        decision: "PENDING" as const,
      })),
      nestedProposals: nestedSeeds.map((seed, index) => ({
        id: `nested_${submission.id}_${index}`,
        kind: "NESTED_TRIPLE" as const,
        payload: {
          edgeKind: seed.edgeKind,
          predicate: seed.predicate,
          subject: seed.subject,
          object: seed.object,
          stableKey: seed.stableKey,
        },
        decision: "PENDING" as const,
      })),
    });
  } catch (error) {
    const safeError = toSafeError(error);

    await prisma.submission.update({
      where: { id: submission.id },
      data: {
        status: "FAILED",
      },
    });

    return NextResponse.json(
      { error: "Extraction failed.", details: safeError.message },
      { status: 500 }
    );
  }
}
