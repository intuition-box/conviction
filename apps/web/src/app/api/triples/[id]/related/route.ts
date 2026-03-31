import { NextResponse } from "next/server";
import { getTripleDetails } from "@0xintuition/sdk";
import { ensureIntuitionGraphql } from "@/lib/intuition";
import {
  fetchTriplesBySharedTopicAtoms,
  fetchTriplesByLabel,
  fetchSemanticAtoms,
  type GraphqlTriple,
} from "@/lib/intuition/graphql-queries";
import { resolveTripleDeep, type ResolvedTripleShape } from "@/lib/intuition/resolveTerm";
import { prisma } from "@/server/db/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_PER_BUCKET = 10;

type RouteProps = {
  params: Promise<{ id: string }>;
};

type RelatedPost = {
  id: string;
  body: string;
  createdAt: string;
  replyCount: number;
  author: {
    displayName: string | null;
    address: string;
    avatar: string | null;
  };
  mainTripleTermId: string;
  sharedAtom?: string;
};

const POST_SELECT = {
  id: true,
  body: true,
  createdAt: true,
  user: { select: { displayName: true, address: true, avatar: true } },
  _count: { select: { replies: true } },
} as const;

type PostRow = {
  id: string;
  body: string;
  createdAt: Date;
  user: { displayName: string | null; address: string; avatar: string | null };
  _count: { replies: number };
};

function toRelatedPost(
  post: PostRow,
  termId: string,
  sharedAtom?: string,
): RelatedPost {
  return {
    id: post.id,
    body: post.body,
    createdAt: post.createdAt.toISOString(),
    replyCount: post._count.replies,
    author: {
      displayName: post.user.displayName,
      address: post.user.address,
      avatar: post.user.avatar,
    },
    mainTripleTermId: termId,
    ...(sharedAtom ? { sharedAtom } : {}),
  };
}

/** Deduplicated, non-null array of IDs */
function uniqueIds(...ids: (string | null | undefined)[]): string[] {
  return [...new Set(ids.filter((id): id is string => id != null))];
}

function collectNestedTermIds(node: ResolvedTripleShape | null | undefined, out: Set<string>) {
  if (!node || out.has(node.termId)) return;
  out.add(node.termId);
  collectNestedTermIds(node.subjectNested, out);
  collectNestedTermIds(node.objectNested, out);
}

function compositeLabel(node: ResolvedTripleShape): string {
  const s = node.subjectNested ? compositeLabel(node.subjectNested) : node.subject;
  const o = node.objectNested ? compositeLabel(node.objectNested) : node.object;
  return `${s} · ${node.predicate} · ${o}`;
}

/** Find posts linked to candidate triples, deduplicating against seenPostIds */
async function findPostsForTriples(
  tripleToLabel: Map<string, string>,
  seenPostIds: Set<string>,
  excludeFilter: Record<string, unknown>,
): Promise<RelatedPost[]> {
  if (tripleToLabel.size === 0) return [];

  const links = await prisma.postTripleLink.findMany({
    where: {
      termId: { in: [...tripleToLabel.keys()] },
      role: "MAIN",
      ...excludeFilter,
    },
    include: { post: { select: POST_SELECT } },
    orderBy: { createdAt: "desc" },
  });

  const posts: RelatedPost[] = [];
  for (const link of links) {
    if (seenPostIds.has(link.post.id)) continue;
    if (posts.length >= MAX_PER_BUCKET) break;
    seenPostIds.add(link.post.id);
    posts.push(
      toRelatedPost(link.post, link.termId, tripleToLabel.get(link.termId)),
    );
  }
  return posts;
}

export async function GET(request: Request, { params }: RouteProps) {
  const { id: tripleTermId } = await params;
  const exclude = new URL(request.url).searchParams.get("exclude");

  if (!tripleTermId || typeof tripleTermId !== "string") {
    return NextResponse.json({ error: "Invalid triple ID." }, { status: 400 });
  }

  try {
    ensureIntuitionGraphql();

    const excludeFilter = exclude ? { postId: { not: exclude } } : {};
    const seenPostIds = new Set<string>();
    if (exclude) seenPostIds.add(exclude);

    const [details, exactLinks] = await Promise.all([
      getTripleDetails(tripleTermId),
      prisma.postTripleLink.findMany({
        where: { termId: tripleTermId, role: "MAIN", ...excludeFilter },
        include: { post: { select: POST_SELECT } },
        orderBy: { createdAt: "desc" },
        take: MAX_PER_BUCKET,
      }),
    ]);

    if (!details) {
      return NextResponse.json({ error: "Triple not found." }, { status: 404 });
    }

    const sourceSubjectLabel = details.subject?.label || details.subject?.data || "Unknown";
    const sourceObjectLabel = details.object?.label || details.object?.data || "Unknown";

    const exactPosts: RelatedPost[] = exactLinks.map((link) =>
      toRelatedPost(link.post, link.termId),
    );
    for (const p of exactPosts) seenPostIds.add(p.id);

    type BodyRow = {
      id: string;
      body: string;
      created_at: Date;
      reply_count: bigint;
      display_name: string | null;
      address: string;
      avatar: string | null;
      main_term_id: string | null;
    };

    const bodySearchTerms = [sourceSubjectLabel, sourceObjectLabel]
      .filter((l) => l && l.length >= 2 && l !== "Unknown");
    const bodyQuery = bodySearchTerms.join(" OR ");

    let relatedPosts: RelatedPost[] = [];

    if (bodyQuery) {
      const excludeIds = [...seenPostIds];
      try {
        const bodyRows = await prisma.$queryRaw<BodyRow[]>`
          SELECT
            p.id,
            p.body,
            p."createdAt" AS created_at,
            (SELECT COUNT(*)::bigint FROM "Post" r WHERE r."parentPostId" = p.id) AS reply_count,
            u."displayName" AS display_name,
            u.address,
            u.avatar,
            (
              SELECT ptl."termId"
              FROM "PostTripleLink" ptl
              WHERE ptl."postId" = p.id AND ptl.role = 'MAIN'
              LIMIT 1
            ) AS main_term_id
          FROM "Post" p
          JOIN "User" u ON u.id = p."userId"
          WHERE to_tsvector('english', p.body) @@ websearch_to_tsquery('english', ${bodyQuery})
            AND p.id != ALL(${excludeIds})
          ORDER BY ts_rank(to_tsvector('english', p.body), websearch_to_tsquery('english', ${bodyQuery})) DESC
          LIMIT ${MAX_PER_BUCKET}
        `;

        for (const row of bodyRows) {
          if (seenPostIds.has(row.id)) continue;
          seenPostIds.add(row.id);
          relatedPosts.push({
            id: row.id,
            body: row.body,
            createdAt: row.created_at.toISOString(),
            replyCount: Number(row.reply_count),
            author: {
              displayName: row.display_name,
              address: row.address,
              avatar: row.avatar,
            },
            mainTripleTermId: row.main_term_id ?? "",
          });
        }
      } catch {
        // Full-text search failure is non-critical
      }
    }

    let sameSubjectPosts: RelatedPost[] = [];
    let sameObjectPosts: RelatedPost[] = [];

    if (exactPosts.length + relatedPosts.length === 0) {
      const sourceSubjectId = details.subject_id ? String(details.subject_id) : null;
      const sourceObjectId = details.object_id ? String(details.object_id) : null;

      // Resolve nested tree for deep atom IDs
      const { subjectNested, objectNested } = await resolveTripleDeep(details);

      const deepSubjectLabel = subjectNested
        ? compositeLabel(subjectNested)
        : sourceSubjectLabel;
      const deepObjectLabel = objectNested
        ? compositeLabel(objectNested)
        : sourceObjectLabel;

      const nestedSubjectIds = new Set<string>();
      collectNestedTermIds(subjectNested, nestedSubjectIds);
      const nestedObjectIds = new Set<string>();
      collectNestedTermIds(objectNested, nestedObjectIds);

      const subjectSearchIds = uniqueIds(sourceSubjectId, tripleTermId, ...nestedSubjectIds);
      const objectSearchIds = uniqueIds(sourceObjectId, ...nestedObjectIds);
      const objectOnlyIds = objectSearchIds.filter((id) => !subjectSearchIds.includes(id));
      const labelSearchTerms: string[] = [];
      if (subjectNested) {
        labelSearchTerms.push(subjectNested.subject, subjectNested.object);
      } else if (sourceSubjectLabel !== "Unknown") {
        labelSearchTerms.push(sourceSubjectLabel);
      }
      if (objectNested) {
        labelSearchTerms.push(objectNested.subject, objectNested.object);
      } else if (sourceObjectLabel !== "Unknown") {
        labelSearchTerms.push(sourceObjectLabel);
      }
      const filteredLabelTerms = labelSearchTerms.filter((l) => l && l.length >= 2);
      const semanticQuery = filteredLabelTerms.join(" ");

      const [pass1Subject, pass1Object, pass1Label, semanticAtoms] = await Promise.all([
        subjectSearchIds.length > 0
          ? fetchTriplesBySharedTopicAtoms(subjectSearchIds, tripleTermId, 50)
          : Promise.resolve([] as GraphqlTriple[]),
        objectOnlyIds.length > 0
          ? fetchTriplesBySharedTopicAtoms(objectOnlyIds, tripleTermId, 50)
          : Promise.resolve([] as GraphqlTriple[]),
        filteredLabelTerms.length > 0
          ? fetchTriplesByLabel(filteredLabelTerms, tripleTermId, 50)
          : Promise.resolve([] as GraphqlTriple[]),
        semanticQuery
          ? fetchSemanticAtoms(semanticQuery, 10).catch(() => [])
          : Promise.resolve([]),
      ]);

      const seen1 = new Set<string>();
      const dedupTriples = (items: GraphqlTriple[]) =>
        items.filter((t) => {
          if (!t.term_id || seen1.has(t.term_id)) return false;
          seen1.add(t.term_id);
          return true;
        });
      const allPass1 = dedupTriples([...pass1Subject, ...pass1Object, ...pass1Label]);

      const pass1Ids = allPass1
        .map((t) => t.term_id!)
        .filter((id) => !subjectSearchIds.includes(id) && !objectSearchIds.includes(id));

      const pass2 = pass1Ids.length > 0
        ? await fetchTriplesBySharedTopicAtoms(pass1Ids, tripleTermId, 50)
        : [];

      const allCandidates = [...allPass1, ...pass2];

      const pass1SubjectIds = new Set(
        pass1Subject.map((t) => t.term_id).filter((id): id is string => id != null),
      );
      const pass1ObjectIds = new Set(
        pass1Object.map((t) => t.term_id).filter((id): id is string => id != null),
      );

      // Build subject candidates
      const sameSubjectMap = new Map<string, string>();
      for (const t of allCandidates) {
        const tid = t.term_id;
        if (!tid) continue;
        const sid = t.subject?.term_id ? String(t.subject.term_id) : null;
        const oid = t.object?.term_id ? String(t.object.term_id) : null;
        const sLabel = t.subject?.label?.toLowerCase() ?? "";
        const oLabel = t.object?.label?.toLowerCase() ?? "";
        const srcLabel = deepSubjectLabel.toLowerCase();

        if (
          sid === sourceSubjectId || oid === sourceSubjectId ||
          sid === tripleTermId || oid === tripleTermId ||
          (sid && nestedSubjectIds.has(sid)) || (oid && nestedSubjectIds.has(oid)) ||
          ((sid && pass1SubjectIds.has(sid)) || (oid && pass1SubjectIds.has(oid))) ||
          sLabel === srcLabel || oLabel === srcLabel
        ) {
          sameSubjectMap.set(tid, deepSubjectLabel);
        }
      }

      // Build object candidates
      const sameObjectMap = new Map<string, string>();
      for (const t of allCandidates) {
        const tid = t.term_id;
        if (!tid || sameSubjectMap.has(tid)) continue;
        const sid = t.subject?.term_id ? String(t.subject.term_id) : null;
        const oid = t.object?.term_id ? String(t.object.term_id) : null;
        const sLabel = t.subject?.label?.toLowerCase() ?? "";
        const oLabel = t.object?.label?.toLowerCase() ?? "";
        const srcLabel = deepObjectLabel.toLowerCase();

        if (
          oid === sourceObjectId || sid === sourceObjectId ||
          (sid && nestedObjectIds.has(sid)) || (oid && nestedObjectIds.has(oid)) ||
          ((sid && pass1ObjectIds.has(sid)) || (oid && pass1ObjectIds.has(oid))) ||
          sLabel === srcLabel || oLabel === srcLabel
        ) {
          sameObjectMap.set(tid, deepObjectLabel);
        }
      }

      // Semantic candidates
      const allStructuralIds = new Set([...subjectSearchIds, ...objectSearchIds]);
      const semanticAtomIds = semanticAtoms
        .map((a) => (a.term_id ? String(a.term_id) : null))
        .filter((id): id is string => id != null && !allStructuralIds.has(id));

      let semanticMap = new Map<string, string>();
      if (semanticAtomIds.length > 0) {
        const semanticTriples = await fetchTriplesBySharedTopicAtoms(
          semanticAtomIds, tripleTermId, 50,
        );
        const semanticIdSet = new Set(semanticAtomIds);
        const atomLabelMap = new Map<string, string>();
        for (const a of semanticAtoms) {
          if (a.term_id && a.label) atomLabelMap.set(String(a.term_id), a.label);
        }
        for (const t of semanticTriples) {
          const tid = t.term_id;
          if (!tid || sameSubjectMap.has(tid) || sameObjectMap.has(tid)) continue;
          const sid = t.subject?.term_id ? String(t.subject.term_id) : null;
          const oid = t.object?.term_id ? String(t.object.term_id) : null;
          const matchedId = sid && semanticIdSet.has(sid) ? sid
            : oid && semanticIdSet.has(oid) ? oid
            : null;
          if (matchedId) {
            semanticMap.set(tid, atomLabelMap.get(matchedId) ?? "");
          }
        }
      }

      // DB lookups for all three buckets
      [sameSubjectPosts, sameObjectPosts, relatedPosts] = await Promise.all([
        findPostsForTriples(sameSubjectMap, new Set(seenPostIds), excludeFilter),
        findPostsForTriples(sameObjectMap, new Set(seenPostIds), excludeFilter),
        findPostsForTriples(semanticMap, new Set(seenPostIds), excludeFilter),
      ]);

      // Dedup across buckets (subject > object > related)
      const finalSeen = new Set(seenPostIds);
      sameSubjectPosts = sameSubjectPosts.filter((p) => {
        if (finalSeen.has(p.id)) return false;
        finalSeen.add(p.id);
        return true;
      });
      sameObjectPosts = sameObjectPosts.filter((p) => {
        if (finalSeen.has(p.id)) return false;
        finalSeen.add(p.id);
        return true;
      });
      relatedPosts = relatedPosts.filter((p) => {
        if (finalSeen.has(p.id)) return false;
        finalSeen.add(p.id);
        return true;
      });
    }

    return NextResponse.json({
      exact: exactPosts,
      sameSubject: sameSubjectPosts,
      sameObject: sameObjectPosts,
      related: relatedPosts,
    });
  } catch (error) {
    console.error("[GET /api/triples/[id]/related] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch related posts." },
      { status: 500 },
    );
  }
}
