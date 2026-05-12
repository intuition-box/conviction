import { NextResponse } from "next/server";

import { Prisma } from "@prisma/client";

import { prisma } from "@/server/db/prisma";
import { requireSiweAuth } from "@/server/auth/siwe";
import { getErrorMessage } from "@/lib/getErrorMessage";
import { ensureThemeInTransaction, toSlug } from "@/server/themes/ensureTheme";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_NAME_LENGTH = 100;
const MAX_DESCRIPTION_LENGTH = 500;
const HEX_ID_REGEX = /^0x[a-fA-F0-9]{1,128}$/;

export async function GET() {
  const themes = await prisma.theme.findMany({
    orderBy: { slug: "asc" },
  });

  const rootCounts = await prisma.postTheme.groupBy({
    by: ["themeSlug"],
    where: { post: { parentPostId: null } },
    _count: { postId: true },
  });

  const rootCountMap = new Map(rootCounts.map(r => [r.themeSlug, r._count.postId]));

  return NextResponse.json({
    themes: themes.map((theme) => ({
      slug: theme.slug,
      name: theme.name,
      rootPostCount: rootCountMap.get(theme.slug) ?? 0,
    })),
  });
}

// Legacy path: theme without an atom. No atomTermId race to worry about, just slug collision.
// For atom-bearing themes use `ensureThemeInTransaction`.
async function createThemeNoAtom(
  data: { name: string; description: string | null },
) {
  const baseSlug = toSlug(data.name);
  if (!baseSlug) throw new Error("Name must produce a valid slug.");

  for (let attempt = 0; attempt < 10; attempt++) {
    const slug = attempt === 0 ? baseSlug : `${baseSlug}-${attempt + 1}`;
    try {
      return await prisma.theme.create({
        data: { slug, name: data.name, description: data.description, atomTermId: null },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const target = (error.meta?.target as string[] | undefined) ?? [];
        if (target.includes("slug")) continue;
        throw error;
      }
      throw error;
    }
  }
  throw new Error("Unable to generate a unique slug. Try a different name.");
}

// ─── POST /api/themes ─────────────────────────────────────────────────────────

export async function POST(request: Request) {
  try {
    try {
      await requireSiweAuth(request);
    } catch (error: unknown) {
      return NextResponse.json(
        { error: getErrorMessage(error, "Unauthorized.") },
        { status: 401 },
      );
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
    }

    const { name, description, atomTermId } = body as {
      name?: string;
      description?: string;
      atomTermId?: string;
    };

    // Validate name
    if (!name || typeof name !== "string") {
      return NextResponse.json({ error: "name is required." }, { status: 400 });
    }
    const trimmedName = name.trim();
    if (trimmedName.length === 0 || trimmedName.length > MAX_NAME_LENGTH) {
      return NextResponse.json(
        { error: `name must be between 1 and ${MAX_NAME_LENGTH} characters.` },
        { status: 400 },
      );
    }

    // Validate description
    let trimmedDescription: string | null = null;
    if (description != null) {
      if (typeof description !== "string") {
        return NextResponse.json({ error: "description must be a string." }, { status: 400 });
      }
      const d = description.trim();
      if (d.length > MAX_DESCRIPTION_LENGTH) {
        return NextResponse.json(
          { error: `description must be at most ${MAX_DESCRIPTION_LENGTH} characters.` },
          { status: 400 },
        );
      }
      if (d.length > 0) trimmedDescription = d;
    }

    if (atomTermId != null && atomTermId !== "") {
      if (typeof atomTermId !== "string" || !HEX_ID_REGEX.test(atomTermId)) {
        return NextResponse.json(
          { error: "atomTermId must be a valid hex string (0x...)." },
          { status: 400 },
        );
      }

      const existingTheme = await prisma.theme.findUnique({ where: { atomTermId } });
      if (existingTheme) {
        // 409 includes `existing` so callers (notably the publish flow) can resolve
        // the slug transparently instead of erroring.
        return NextResponse.json(
          {
            error: `This atom is already linked to the theme "${existingTheme.name}".`,
            existing: {
              slug: existingTheme.slug,
              name: existingTheme.name,
              atomTermId: existingTheme.atomTermId,
            },
          },
          { status: 409 },
        );
      }

      const created = await prisma.$transaction(async (tx) =>
        ensureThemeInTransaction(tx, {
          name: trimmedName,
          atomTermId,
          description: trimmedDescription,
        }),
      );
      return NextResponse.json({
        slug: created.slug,
        name: created.name,
        atomTermId,
      }, { status: 201 });
    }

    const theme = await createThemeNoAtom({
      name: trimmedName,
      description: trimmedDescription,
    });

    return NextResponse.json({
      slug: theme.slug,
      name: theme.name,
      atomTermId: theme.atomTermId,
    }, { status: 201 });
  } catch (error: unknown) {
    console.error("Error in POST /api/themes:", error);
    return NextResponse.json(
      { error: getErrorMessage(error, "An unexpected error occurred.") },
      { status: 500 },
    );
  }
}
