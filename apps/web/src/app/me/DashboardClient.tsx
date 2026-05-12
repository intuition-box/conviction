"use client";

import { useState } from "react";

import { Avatar } from "@/components/Avatar/Avatar";
import { Chip } from "@/components/Chip/Chip";
import { SentimentCircle } from "@/components/SentimentBar/SentimentCircle";
import { labels } from "@/lib/vocabulary";

import { EngagementSection } from "./EngagementSection";
import { MyPostRow } from "./MyPostRow";
import { PositionsSection } from "./PositionsSection";
import { ThemesSection } from "./ThemesSection";
import { useMyPosts, type PostsFilter } from "./useMyPosts";
import { useMySummary } from "./useMySummary";
import { useMyEngagement } from "./useMyEngagement";

import styles from "./DashboardClient.module.css";

type DashboardClientProps = {
  address: string;
  displayName: string | null;
  avatar: string | null;
};

function truncateAddress(addr: string): string {
  if (addr.length <= 10) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function DashboardClient({ address, displayName, avatar }: DashboardClientProps) {
  const identity = displayName ?? truncateAddress(address);
  const [filter, setFilter] = useState<PostsFilter>("all");
  const { posts, hasMore, loading, loadingMore, error, loadMore } = useMyPosts(filter);
  const { summary } = useMySummary();
  const { data: engagement, loading: engagementLoading } = useMyEngagement();

  const totalVotes = (summary?.supportsReceived ?? 0) + (summary?.refutesReceived ?? 0);
  const supportPct = totalVotes === 0 ? 0 : ((summary?.supportsReceived ?? 0) / totalVotes) * 100;
  const receptionAvailable =
    summary?.supportsReceived !== null && summary?.refutesReceived !== null;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Avatar src={avatar} name={identity} size="lg" />
        <div className={styles.headerText}>
          <h1 className={styles.title}>{labels.dashboardTitle}</h1>
          <p className={styles.identity}>{identity}</p>
        </div>
      </header>

      <dl className={styles.stats} aria-label="Stats">
        <div className={styles.statCell}>
          <dt className={styles.statLabel}>{labels.dashboardStatPosts}</dt>
          <dd className={styles.statValue}>{summary?.postsTotal ?? "—"}</dd>
        </div>
        <div className={styles.statCell}>
          <dt
            className={styles.statLabel}
            title={labels.dashboardStatSupportsTooltip}
          >
            {labels.dashboardStatSupports}
          </dt>
          <dd className={styles.statValue}>
            {summary?.supportsReceived ?? "—"}
          </dd>
        </div>
        <div className={styles.statCell}>
          <dt
            className={styles.statLabel}
            title={labels.dashboardStatRefutesTooltip}
          >
            {labels.dashboardStatRefutes}
          </dt>
          <dd className={styles.statValue}>
            {summary?.refutesReceived ?? "—"}
          </dd>
        </div>
        <div className={styles.statCell}>
          <dt
            className={styles.statLabel}
            title={labels.dashboardStatReceptionTooltip}
          >
            {labels.dashboardStatReception}
          </dt>
          <dd className={styles.statValueCircle}>
            {receptionAvailable ? (
              <SentimentCircle
                supportPct={supportPct}
                totalParticipants={totalVotes}
                mode="compact"
              />
            ) : (
              <span className={styles.statValue}>—</span>
            )}
          </dd>
        </div>
      </dl>

      <section className={styles.section} aria-labelledby="section-themes">
        <h2 id="section-themes" className={styles.sectionTitle}>
          {labels.dashboardSectionThemes}
        </h2>
        <ThemesSection data={engagement} loading={engagementLoading} />
      </section>

      <section className={styles.section} aria-labelledby="section-engagement">
        <h2 id="section-engagement" className={styles.sectionTitle}>
          {labels.dashboardSectionEngagement}
        </h2>
        <EngagementSection data={engagement} loading={engagementLoading} />
      </section>

      <section className={styles.section} aria-labelledby="section-posts">
        <div className={styles.sectionHeader}>
          <h2 id="section-posts" className={styles.sectionTitle}>
            {labels.dashboardSectionPosts}
          </h2>
          <div className={styles.filters} role="tablist" aria-label="Filter posts">
            <Chip
              size="sm"
              active={filter === "all"}
              onClick={() => setFilter("all")}
              aria-label={labels.dashboardFilterAll}
            >
              {labels.dashboardFilterAll}
            </Chip>
            <Chip
              size="sm"
              active={filter === "root"}
              onClick={() => setFilter("root")}
              aria-label={labels.dashboardFilterRoot}
            >
              {labels.dashboardFilterRoot}
            </Chip>
            <Chip
              size="sm"
              active={filter === "replies"}
              onClick={() => setFilter("replies")}
              aria-label={labels.dashboardFilterReplies}
            >
              {labels.dashboardFilterReplies}
            </Chip>
          </div>
        </div>

        {error && <div className={styles.error}>{labels.dashboardPostsError}</div>}

        {!error && loading && posts.length === 0 && (
          <div className={styles.empty}>{labels.dashboardLoadingMore}</div>
        )}

        {!error && !loading && posts.length === 0 && (
          <div className={styles.empty}>{labels.dashboardEmptyPosts}</div>
        )}

        {posts.length > 0 && (
          <div className={styles.postList}>
            {posts.map((p) => (
              <MyPostRow key={p.id} post={p} />
            ))}
          </div>
        )}

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
      </section>

      <section className={styles.section} aria-labelledby="section-positions">
        <h2 id="section-positions" className={styles.sectionTitle}>
          {labels.dashboardSectionPositions}
        </h2>
        <PositionsSection />
      </section>
    </div>
  );
}
