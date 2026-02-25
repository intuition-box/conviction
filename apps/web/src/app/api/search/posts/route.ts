import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/server/db/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SearchParams = {
  query?: string;
  themeSlug?: string;
  stance?: string;
  limit?: number;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as SearchParams | null;

    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
    }

    const query = typeof body.query === "string" ? body.query.trim() : "";
    const themeSlug = typeof body.themeSlug === "string" ? body.themeSlug : undefined;
    const stanceRaw = typeof body.stance === "string" ? body.stance : undefined;
    const stance = (stanceRaw === "SUPPORTS" || stanceRaw === "REFUTES") ? stanceRaw : undefined;
    const limit = typeof body.limit === "number" ? Math.min(body.limit, 100) : 20;

    if (query.length < 2) {
      return NextResponse.json({ posts: [] });
    }

    // Build where clause
    const where: Prisma.PostWhereInput = {
      publishedAt: { not: null }, // Only published posts
      body: { contains: query, mode: "insensitive" },
    };

    if (themeSlug) {
      where.themeSlug = themeSlug;
    }

    // Filter by stance directly on Post (source of truth since Phase 0 migration)
    if (stance) {
      where.stance = stance;
    }

    // Search posts
    const posts = await prisma.post.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            address: true,
            displayName: true,
            avatar: true,
          },
        },
        theme: {
          select: {
            slug: true,
            name: true,
          },
        },
        tripleLinks: {
          where: { role: "MAIN" },
          orderBy: { createdAt: "asc" as const },
          select: { termId: true },
        },
        parent: {
          select: {
            id: true,
            body: true,
            tripleLinks: {
              where: { role: "MAIN" },
              orderBy: { createdAt: "asc" as const },
              select: { termId: true },
            },
          },
        },
      },
      orderBy: [
        { publishedAt: "desc" },
      ],
      take: limit,
    });

    const filteredPosts = posts;

    // Format results
    const results = filteredPosts.map((post) => ({
      id: post.id,
      body: post.body,
      publishedAt: post.publishedAt?.toISOString(),
      user: {
        id: post.user.id,
        address: post.user.address,
        displayName: post.user.displayName,
        avatar: post.user.avatar,
      },
      theme: {
        slug: post.theme.slug,
        name: post.theme.name,
      },
      mainTripleTermIds: post.tripleLinks.map((l) => l.termId),
      isReply: post.parentPostId !== null,
      parent: post.parent ? {
        id: post.parent.id,
        body: post.parent.body,
        mainTripleTermIds: post.parent.tripleLinks.map((l) => l.termId),
      } : null,
    }));

    return NextResponse.json({ posts: results });
  } catch (error: unknown) {
    console.error("Error in /api/search/posts:", error);
    return NextResponse.json(
      { error: "Search failed.", posts: [] },
      { status: 500 }
    );
  }
}
