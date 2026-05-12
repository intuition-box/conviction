export type ThemeItem =
  | { kind: "existing"; slug: string; name: string }
  | { kind: "pending-atom"; tempId: string; name: string; atomTermId: string };

/** Pending themes payload sent to /api/publish. */
export type PendingTheme = { name: string; atomTermId: string };

export function isPending(t: ThemeItem): t is Extract<ThemeItem, { kind: "pending-atom" }> {
  return t.kind === "pending-atom";
}

export function toPendingTheme(t: ThemeItem): PendingTheme | null {
  return t.kind === "pending-atom" ? { name: t.name, atomTermId: t.atomTermId } : null;
}

/** Stable React key + dedup key. Always unique per theme variant. */
export function getThemeKey(t: ThemeItem): string {
  return t.kind === "existing" ? `slug:${t.slug}` : `atom:${t.atomTermId}`;
}

/** Build a ThemeItem from an already-resolved DB theme. */
export function asExistingTheme(t: { slug: string; name: string }): ThemeItem {
  return { kind: "existing", slug: t.slug, name: t.name };
}
