import { NextResponse } from "next/server";

import { prisma } from "@/server/db/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const themes = await prisma.theme.findMany({
    orderBy: { slug: "asc" },
  });

  // Count root posts per theme using aggregation (not loading all posts)
  const rootCounts = await prisma.post.groupBy({
    by: ["themeSlug"],
    where: { parentPostId: null },
    _count: { id: true },
  });

  const rootCountMap = new Map(rootCounts.map(r => [r.themeSlug, r._count.id]));

  return NextResponse.json({
    themes: themes.map((theme) => ({
      slug: theme.slug,
      name: theme.name,
      rootPostCount: rootCountMap.get(theme.slug) ?? 0,
    })),
  });
}
