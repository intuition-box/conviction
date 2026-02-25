import type { ReactNode } from "react";

import { ThemeBadge } from "@/components/ThemeBadge/ThemeBadge";

import styles from "./FocusCard.module.css";

type FocusCardProps = {
  post: {
    body: string;
    tripleLinks: { termId: string; role: string }[];
  };
  themeName: string;
  totalReplies: number;
  supportCount: number;
  refuteCount: number;
  onOpenInspector: () => void;
  children?: ReactNode;
};

export function FocusCard({
  post,
  themeName,
  totalReplies,
  supportCount,
  refuteCount,
  onOpenInspector,
  children,
}: FocusCardProps) {
  const stancesActive = [supportCount, refuteCount].filter((n) => n > 0).length;
  const supportPct =
    totalReplies > 0 ? `${Math.round((supportCount / totalReplies) * 100)}%` : "\u2014";

  return (
    <section className={styles.card}>
      <ThemeBadge>{themeName}</ThemeBadge>
      <p className={styles.body}>{post.body}</p>
      <div className={styles.statsRow}>
        <div className={styles.statItem}>
          <span className={styles.statValue}>{totalReplies}</span>
          <span className={styles.statLabel}>Arguments</span>
        </div>
        <div className={styles.statItem}>
          <span className={styles.statValue}>{supportPct}</span>
          <span className={styles.statLabel}>Support</span>
        </div>
        <div className={styles.statItem}>
          <span className={styles.statValue}>{stancesActive}</span>
          <span className={styles.statLabel}>Stances</span>
        </div>
      </div>
      {children}
      {post.tripleLinks.length > 0 && (
        <button
          className={styles.protocolBadge}
          onClick={onOpenInspector}
          aria-label="Open protocol inspector"
        >
          Inspector
        </button>
      )}
    </section>
  );
}
