import { NextResponse } from "next/server";
import { prisma } from "@/server/db/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TriplePostsPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(request: Request, { params }: TriplePostsPageProps) {
  const { id: tripleTermId } = await params;

  if (!tripleTermId || typeof tripleTermId !== "string") {
    return NextResponse.json({ error: "Invalid triple ID." }, { status: 400 });
  }

  try {
    // Find all posts linked to this triple via PostTripleLink
    const links = await prisma.postTripleLink.findMany({
      where: {
        termId: tripleTermId,
      },
      include: {
        post: {
          select: {
            id: true,
            body: true,
            createdAt: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 20, // Limit to 20 most recent
    });

    const posts = links.map((link) => ({
      id: link.post.id,
      body: link.post.body,
      createdAt: link.post.createdAt.toISOString(),
      role: link.role,
    }));

    return NextResponse.json({ posts });
  } catch (error) {
    console.error("[GET /api/triples/[id]/posts] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch related posts." },
      { status: 500 }
    );
  }
}
