"use client";

import { ThumbsUp, ThumbsDown } from "lucide-react";

import { ThemeBadge } from "@/components/ThemeBadge/ThemeBadge";
import { labels } from "@/lib/vocabulary";
import type { MeEngagementResponse } from "@/app/api/me/engagement/route";

import styles from "./ThemesSection.module.css";

export function ThemesSection({ data, loading }: { data: MeEngagementResponse | null; loading: boolean }) {
  if (loading && !data) {
    return <div className={styles.empty}>{labels.dashboardLoadingMore}</div>;
  }

  if (!data || data.themes.length === 0) {
    return <div className={styles.empty}>{labels.dashboardThemesEmpty}</div>;
  }

  const showRatios = !data.partial;

  return (
    <div className={styles.wrapper}>
      {data.partial && (
        <p className={styles.partialBanner}>{labels.dashboardThemesPartial}</p>
      )}
      <ul className={styles.list}>
        {data.themes.map((theme) => (
          <li key={theme.slug} className={styles.item}>
            <span className={styles.themeBadge}>
              <ThemeBadge size="sm" slug={theme.slug}>
                {theme.name}
              </ThemeBadge>
            </span>
            <span
              className={styles.postCount}
              title={labels.dashboardThemePostsTooltip}
            >
              {theme.postCount} {theme.postCount === 1 ? "post" : "posts"}
            </span>
            {showRatios && theme.supportTotal !== null && theme.opposeTotal !== null && (
              <span className={styles.ratio}>
                <span className={styles.ratioBadge} title={labels.dashboardSupportersTitle}>
                  <ThumbsUp size={11} aria-hidden="true" />
                  {theme.supportTotal}
                </span>
                <span className={styles.ratioBadge} title={labels.dashboardOpposersTitle}>
                  <ThumbsDown size={11} aria-hidden="true" />
                  {theme.opposeTotal}
                </span>
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
