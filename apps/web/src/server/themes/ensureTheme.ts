import type { Prisma } from "@prisma/client";

export function toSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

const MAX_SLUG_ATTEMPTS = 10;

export type EnsureThemeInput = {
  name: string;
  atomTermId: string;
  description?: string | null;
};

export type EnsureThemeOutput = {
  slug: string;
  name: string;
};

export async function ensureThemeInTransaction(
  tx: Prisma.TransactionClient,
  data: EnsureThemeInput,
): Promise<EnsureThemeOutput> {
  const base = toSlug(data.name);
  if (!base) throw new Error("Theme name produces an invalid slug.");

  // Fast path: atom already linked.
  const existing = await tx.theme.findUnique({ where: { atomTermId: data.atomTermId } });
  if (existing) return { slug: existing.slug, name: existing.name };

  const description = data.description ?? null;

  for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt++) {
    const candidateSlug = attempt === 0 ? base : `${base}-${attempt + 1}`;
    const rows = await tx.$queryRaw<Array<{ slug: string; name: string }>>`
      INSERT INTO "Theme" (slug, name, description, "atomTermId")
      VALUES (${candidateSlug}, ${data.name}, ${description}, ${data.atomTermId})
      ON CONFLICT DO NOTHING
      RETURNING slug, name;
    `;
    if (rows.length === 1) return { slug: rows[0].slug, name: rows[0].name };

    // 0 rows = conflict (slug unique OR atomTermId unique). Check atomTermId race first.
    const raced = await tx.theme.findUnique({ where: { atomTermId: data.atomTermId } });
    if (raced) return { slug: raced.slug, name: raced.name };

    // Otherwise the slug exists with a different atomTermId → try next suffix.
  }
  throw new Error(`Unable to materialize theme "${data.name}" — slug exhausted after ${MAX_SLUG_ATTEMPTS} attempts.`);
}
