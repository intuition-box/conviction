"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

import { labels } from "@/lib/vocabulary";

import { useMyPositions } from "./useMyPositions";
import styles from "./PositionsSection.module.css";

export function PositionsSection() {
  const { positions, totalValueTrust, hasMore, loading, loadingMore, error, loadMore } =
    useMyPositions();

  if (error) {
    return <div className={styles.error}>{labels.dashboardPositionsError}</div>;
  }

  if (loading && positions.length === 0) {
    return <div className={styles.empty}>{labels.dashboardLoadingMore}</div>;
  }

  if (!loading && positions.length === 0) {
    return <div className={styles.empty}>{labels.dashboardEmptyPositions}</div>;
  }

  return (
    <div className={styles.wrapper}>
      {totalValueTrust !== null && (
        <div className={styles.totalCard}>
          <span className={styles.totalLabel}>{labels.dashboardTotalValue}</span>
          <span className={styles.totalValue}>{totalValueTrust}</span>
        </div>
      )}

      <ul className={styles.list}>
        {positions.map((p) => (
          <li key={p.termId} className={styles.item}>
            <span className={styles.itemLabel} title={p.label}>
              {p.label}
            </span>
            <span className={styles.itemValue}>{p.valueTrust}</span>
            {p.postId && (
              <Link
                href={`/posts/${p.postId}`}
                className={styles.itemLink}
                aria-label={labels.dashboardPositionLinkPost}
                title={labels.dashboardPositionLinkPost}
              >
                <ArrowUpRight size={14} />
              </Link>
            )}
          </li>
        ))}
      </ul>

      {hasMore && (
        <div className={styles.loadMoreRow}>
          <button
            type="button"
            className={styles.loadMoreBtn}
            onClick={loadMore}
            disabled={loadingMore}
          >
            {loadingMore ? labels.dashboardLoadingMore : labels.dashboardLoadMore}
          </button>
        </div>
      )}
    </div>
  );
}
