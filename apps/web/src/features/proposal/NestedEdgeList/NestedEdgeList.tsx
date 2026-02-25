"use client";

import type { NestedProposalDraft } from "@/features/post/ExtractionWorkspace/extractionTypes";
import { labels } from "@/lib/vocabulary";
import styles from "./NestedEdgeList.module.css";

type NestedTermRef =
  | { type: "atom"; atomKey: string; label: string }
  | { type: "triple"; tripleKey: string; label?: string };

type NestedEdgeListProps = {
  edges: NestedProposalDraft[];
  /** Map from tripleKey (stableKey) → readable "S · P · O" label */
  nestedRefLabels: Map<string, string>;
  /** Optional: enables reject/restore buttons per edge */
  onReject?: (nestedId: string) => void;
  onRestore?: (nestedId: string) => void;
  disabled?: boolean;
};

function badgeClass(kind: string): string {
  if (kind === "conditional") return styles.badgeConditional;
  if (kind === "meta") return styles.badgeMeta;
  if (kind === "modifier") return styles.badgeModifier;
  return styles.badgeRelation;
}

function badgeLabel(kind: string): string {
  if (kind === "conditional") return labels.nestedBadgeCondition;
  if (kind === "meta") return labels.nestedBadgeMeta;
  if (kind === "relation") return labels.nestedBadgeRelation;
  if (kind === "modifier") return labels.nestedBadgeModifier;
  return kind;
}

function renderTermRef(ref: NestedTermRef, nestedRefLabels: Map<string, string>): string {
  if (ref.type === "atom") {
    return ref.label || ref.atomKey;
  }
  // Prefer label from extraction (enriched TermRef), then fallback to map lookup
  if (ref.label) return ref.label;
  const label = nestedRefLabels.get(ref.tripleKey);
  if (label) return label;
  // Truncate stableKey for display (should rarely be reached after C0+C1)
  const key = ref.tripleKey;
  return key.length > 16 ? `${key.slice(0, 8)}...${key.slice(-8)}` : key;
}

export function NestedEdgeList({ edges, nestedRefLabels, onReject, onRestore, disabled }: NestedEdgeListProps) {
  if (edges.length === 0) return null;

  const interactive = Boolean(onReject && onRestore);

  return (
    <div className={styles.section}>
      <div className={styles.title}>{labels.nestedEdgeListTitle}</div>
      {!interactive && (
        <div className={styles.subtitle}>
          {labels.nestedEdgeListSubtitle}
        </div>
      )}
      <div className={styles.list}>
        {edges.map((edge) => {
          const isRejected = edge.status === "rejected";
          return (
            <div
              key={edge.id}
              className={`${styles.edge} ${isRejected ? styles.edgeRejected : ""}`}
            >
              <span className={`${styles.badge} ${badgeClass(edge.edgeKind)}`}>
                {badgeLabel(edge.edgeKind)}
              </span>
              <span className={styles.termRef}>
                {renderTermRef(edge.subject, nestedRefLabels)}
              </span>
              <span className={styles.arrow}>&mdash;</span>
              <span className={styles.predicate}>{edge.predicate}</span>
              <span className={styles.arrow}>&rarr;</span>
              <span className={styles.termRef}>
                {renderTermRef(edge.object, nestedRefLabels)}
              </span>
              {interactive && (
                <span className={styles.edgeActions}>
                  {isRejected ? (
                    <button
                      type="button"
                      className={styles.edgeActionBtn}
                      onClick={() => onRestore!(edge.id)}
                      disabled={disabled}
                      aria-label="Restore"
                      title="Restore"
                    >
                      ↺
                    </button>
                  ) : (
                    <button
                      type="button"
                      className={styles.edgeActionBtn}
                      onClick={() => onReject!(edge.id)}
                      disabled={disabled}
                      aria-label="Remove"
                      title="Remove"
                    >
                      ✕
                    </button>
                  )}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
