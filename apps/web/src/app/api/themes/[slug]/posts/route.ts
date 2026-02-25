import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db/prisma";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "10", 10), 100);

    // Check if theme exists
    const theme = await prisma.theme.findUnique({
      where: { slug },
      select: { slug: true },
    });

    if (!theme) {
      return NextResponse.json(
        { error: "Theme not found" },
        { status: 404 }
      );
    }

    // Find root posts (posts with no parent) for this theme
    const posts = await prisma.post.findMany({
      where: {
        themeSlug: slug,
        parentPostId: null, // Root posts only
      },
      select: {
        id: true,
        body: true,
        createdAt: true,
        tripleLinks: {
          where: { role: "MAIN" },
          orderBy: { createdAt: "asc" },
          select: { termId: true },
        },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    return NextResponse.json({ posts });
  } catch (error) {
    console.error("Failed to fetch posts:", error);
    return NextResponse.json(
      { error: "Failed to fetch posts" },
      { status: 500 }
    );
  }
}
