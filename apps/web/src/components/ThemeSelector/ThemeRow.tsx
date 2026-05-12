"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Plus, X } from "lucide-react";

import { ThemeBadge } from "@/components/ThemeBadge/ThemeBadge";
import { ThemePicker } from "@/components/ThemePicker/ThemePicker";
import { getThemeKey, type ThemeItem } from "@/features/theme/types";

import styles from "./ThemeRow.module.css";

type ThemeRowProps = {
  selected: ThemeItem[];
  onChange: (themes: ThemeItem[]) => void;
  min?: number;
  lockedSlugs?: string[];
  /** When omitted, the picker hides the "Create new" affordance. */
  onCreateTheme?: (name: string) => Promise<{ slug: string; name: string } | null>;
  placeholder?: string;
};

function newTempId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `tmp-${Math.random().toString(36).slice(2)}-${Date.now()}`;
}

export function ThemeRow({
  selected,
  onChange,
  min = 1,
  lockedSlugs,
  onCreateTheme,
  placeholder,
}: ThemeRowProps) {
  const [showPicker, setShowPicker] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  const lockedSet = lockedSlugs ? new Set(lockedSlugs) : null;

  useEffect(() => {
    if (!showPicker) return;
    function handleClick(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setShowPicker(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showPicker]);

  function canRemove(t: ThemeItem) {
    if (t.kind === "existing" && lockedSet?.has(t.slug)) return false;
    if (selected.length <= min) return false;
    return true;
  }

  function handleRemove(target: ThemeItem) {
    if (!canRemove(target)) return;
    const key = getThemeKey(target);
    onChange(selected.filter((t) => getThemeKey(t) !== key));
  }

  const handlePickTheme = useCallback(
    (theme: { slug: string; name: string }) => {
      onChange([...selected, { kind: "existing", slug: theme.slug, name: theme.name }]);
      setShowPicker(false);
    },
    [selected, onChange],
  );

  const handleLinkAtom = useCallback(
    (atom: { id: string; label: string }) => {
      // Picked atom is held locally; persisted by /api/publish in the post transaction.
      onChange([
        ...selected,
        { kind: "pending-atom", tempId: newTempId(), name: atom.label, atomTermId: atom.id },
      ]);
      setShowPicker(false);
    },
    [selected, onChange],
  );

  const handleCreateNew = useCallback(
    async (name: string) => {
      if (!onCreateTheme) return;
      const result = await onCreateTheme(name);
      if (result) {
        onChange([...selected, { kind: "existing", slug: result.slug, name: result.name }]);
        setShowPicker(false);
      }
    },
    [selected, onChange, onCreateTheme],
  );

  return (
    <div className={styles.row}>
      {selected.map((t) => {
        const key = getThemeKey(t);
        const removable = canRemove(t);
        const isPending = t.kind === "pending-atom";
        return (
          <span key={key} className={`${styles.chip}${isPending ? ` ${styles.pendingChip}` : ""}`}>
            <ThemeBadge size="sm" slug={t.kind === "existing" ? t.slug : undefined}>
              {t.name}
            </ThemeBadge>
            {removable && (
              <button
                type="button"
                className={styles.removeBtn}
                onClick={() => handleRemove(t)}
                aria-label={`Remove ${t.name}`}
              >
                <X size={10} />
              </button>
            )}
          </span>
        );
      })}
      <div className={styles.addWrapper} ref={popoverRef}>
        <button
          type="button"
          className={styles.ghostBtn}
          onClick={() => setShowPicker(!showPicker)}
          aria-label="Add theme"
        >
          {selected.length === 0 && <span className={styles.ghostLabel}>Add theme</span>}
          <Plus size={12} />
        </button>
        {showPicker && (
          <div className={styles.popover}>
            <ThemePicker
              selected={selected}
              onPickTheme={handlePickTheme}
              onLinkAtom={handleLinkAtom}
              onCreateNew={onCreateTheme ? handleCreateNew : undefined}
              placeholder={placeholder ?? "Search or create a theme…"}
            />
          </div>
        )}
      </div>
    </div>
  );
}
