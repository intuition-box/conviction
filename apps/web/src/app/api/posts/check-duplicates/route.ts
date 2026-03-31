import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db/prisma";
import { resolveTripleIdsByLabels } from "@/lib/intuition/resolve";
import { intuitionGraphqlUrl } from "@/lib/intuition/intuition";
import { makeLabelKey } from "@/lib/format/makeLabelKey";

async function fetchParentTripleIds(
  childTermIds: string[],
): Promise<Map<string, string[]>> {
  const result = new Map<string, string[]>();
  if (!childTermIds.length) return result;

  const query = `
    query FindParentTriples($where: triples_bool_exp, $limit: Int) {
      triples(where: $where, limit: $limit) { term_id subject_id object_id }
    }
  `;
  const orClauses = childTermIds.flatMap((id) => [
    { subject_id: { _eq: id } },
    { object_id: { _eq: id } },
  ]);
  try {
    const res = await fetch(intuitionGraphqlUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables: { where: { _or: orClauses }, limit: 100 } }),
      cache: "no-store",
    });
    if (!res.ok) return result;
    const payload = await res.json();
    const triples = payload?.data?.triples as Array<{ term_id: string; subject_id: string; object_id: string }> | undefined;
    if (!Array.isArray(triples)) return result;
    const childSet = new Set(childTermIds);
    for (const parent of triples) {
      if (childSet.has(parent.subject_id)) {
        const existing = result.get(parent.subject_id) ?? [];
        existing.push(parent.term_id);
        result.set(parent.subject_id, existing);
      }
      if (childSet.has(parent.object_id) && parent.object_id !== parent.subject_id) {
        const existing = result.get(parent.object_id) ?? [];
        existing.push(parent.term_id);
        result.set(parent.object_id, existing);
      }
    }
    return result;
  } catch {
    return result;
  }
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const tripleSchema = z.object({
  key: z.string().min(1),
  tripleTermId: z.string().optional(),
  sLabel: z.string().min(1),
  pLabel: z.string().min(1),
  oLabel: z.string().min(1),
  draftId: z.string().min(1),
});

const schema = z.object({
  triples: z.array(tripleSchema).min(1).max(50),
});

const POST_SELECT = {
  id: true,
  body: true,
  createdAt: true,
  parentPostId: true,
  _count: { select: { replies: true } },
  user: { select: { displayName: true, address: true, avatar: true } },
  parent: { select: { id: true, body: true } },
} as const;

type PostRow = {
  id: string;
  body: string;
  createdAt: Date;
  parentPostId: string | null;
  _count: { replies: number };
  user: { displayName: string | null; address: string; avatar: string | null };
  parent: { id: string; body: string } | null;
};

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const { triples } = parsed.data;

  try {
    const resolved = triples.filter((t) => t.tripleTermId);
    const unresolved = triples.filter((t) => !t.tripleTermId);

    const termIdToKeys = new Map<string, string[]>();

    for (const t of resolved) {
      const existing = termIdToKeys.get(t.tripleTermId!) ?? [];
      existing.push(t.key);
      termIdToKeys.set(t.tripleTermId!, existing);
    }

    if (unresolved.length > 0) {
      const labelCombos = unresolved.map((t) => ({
        s: t.sLabel,
        p: t.pLabel,
        o: t.oLabel,
      }));

      const byLabelKey = await resolveTripleIdsByLabels(labelCombos);

      for (const t of unresolved) {
        const lk = makeLabelKey(t.sLabel, t.pLabel, t.oLabel);
        const match = byLabelKey[lk];
        if (match?.tripleTermId) {
          const existing = termIdToKeys.get(match.tripleTermId) ?? [];
          existing.push(t.key);
          termIdToKeys.set(match.tripleTermId, existing);
        }
      }
    }

    const allTermIds = [...termIdToKeys.keys()];
    if (allTermIds.length === 0) {
      return NextResponse.json({ matches: [] });
    }

    const parentMap = await fetchParentTripleIds(allTermIds);
    const parentTermIdToKeys = new Map<string, string[]>();
    for (const [childTermId, parentTermIds] of parentMap) {
      const originalKeys = termIdToKeys.get(childTermId) ?? [];
      for (const parentId of parentTermIds) {
        if (termIdToKeys.has(parentId)) continue;
        const existing = parentTermIdToKeys.get(parentId) ?? [];
        existing.push(...originalKeys);
        parentTermIdToKeys.set(parentId, existing);
      }
    }

    const combinedTermIds = [...new Set([...allTermIds, ...parentTermIdToKeys.keys()])];

    const links = await prisma.postTripleLink.findMany({
      where: { termId: { in: combinedTermIds } },
      include: { post: { select: POST_SELECT } },
      orderBy: { createdAt: "desc" },
    });

    const matches = links.flatMap((link) => {
      const directKeys = termIdToKeys.get(link.termId) ?? [];
      const indirectKeys = parentTermIdToKeys.get(link.termId) ?? [];

      const post = link.post as PostRow;
      const postPayload = {
        id: post.id,
        body: post.body,
        createdAt: post.createdAt.toISOString(),
        replyCount: post._count.replies,
        parentPostId: post.parentPostId,
        authorDisplayName: post.user.displayName,
        authorAddress: post.user.address,
        authorAvatar: post.user.avatar,
        parentPostBody: post.parent?.body ?? null,
      };

      const results: {
        key: string;
        matchType: "exact";
        role: "MAIN" | "SUPPORTING";
        post: typeof postPayload;
      }[] = [];

      for (const key of directKeys) {
        results.push({ key, matchType: "exact", role: link.role as "MAIN" | "SUPPORTING", post: postPayload });
      }

      for (const key of indirectKeys) {
        if (directKeys.includes(key)) continue;
        results.push({ key, matchType: "exact", role: "SUPPORTING", post: postPayload });
      }

      return results;
    });

    return NextResponse.json({ matches });
  } catch {
    return NextResponse.json(
      { error: "Duplicate check failed." },
      { status: 502 },
    );
  }
}
