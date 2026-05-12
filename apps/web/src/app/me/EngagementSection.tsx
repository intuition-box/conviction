"use client";

import Link from "next/link";
import { ThumbsUp, ThumbsDown, MessageSquare } from "lucide-react";

import { SentimentCircle } from "@/components/SentimentBar/SentimentCircle";
import { labels } from "@/lib/vocabulary";
import type { EngagementPostSummary, MeEngagementResponse } from "@/app/api/me/engagement/route";

import styles from "./EngagementSection.module.css";

const BODY_MAX = 80;

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max).trimEnd()}…`;
}

function PostLine({ post }: { post: EngagementPostSummary }) {
  const totalVotes = post.support + post.oppose;
  const supportPct = totalVotes === 0 ? 0 : (post.support / totalVotes) * 100;

  return (
    <li className={styles.line}>
      <Link href={`/posts/${post.id}`} className={styles.lineLink}>
        <span className={styles.sentiment}>
          <SentimentCircle
            supportPct={supportPct}
            totalParticipants={totalVotes}
            mode="tiny"
          />
        </span>
        <span className={styles.body}>{truncate(post.body, BODY_MAX)}</span>
        <span className={styles.stats}>
          <span className={styles.badge} title={labels.dashboardSupportersTitle}>
            <ThumbsUp size={11} aria-hidden="true" />
            {post.support}
          </span>
          <span className={styles.badge} title={labels.dashboardOpposersTitle}>
            <ThumbsDown size={11} aria-hidden="true" />
            {post.oppose}
          </span>
          <span className={styles.badge} title={labels.dashboardReplyCountTitle}>
            <MessageSquare size={11} aria-hidden="true" />
            {post.replyCount}
          </span>
          <span className={styles.score} title={labels.dashboardScoreTooltip}>
            {post.score}
          </span>
        </span>
      </Link>
    </li>
  );
}

export function EngagementSection({ data, loading }: { data: MeEngagementResponse | null; loading: boolean }) {
  if (loading && !data) {
    return <div className={styles.empty}>{labels.dashboardLoadingMore}</div>;
  }

  if (!data || data.partial || data.topPosts === null) {
    return <div className={styles.degraded}>{labels.dashboardEngagementUnavailable}</div>;
  }

  if (data.topPosts.length === 0) {
    return <div className={styles.empty}>{labels.dashboardEngagementEmpty}</div>;
  }

  return (
    <div className={styles.wrapper}>
      <ul className={styles.list}>
        {data.topPosts.map((p) => (
          <PostLine key={p.id} post={p} />
        ))}
      </ul>
      {data.cappedAt500 && (
        <p className={styles.capNote}>{labels.dashboardEngagementCapNote}</p>
      )}
    </div>
  );
}
