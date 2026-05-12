"use client";

import Link from "next/link";
import { ThumbsUp, ThumbsDown, MessageSquare, CornerDownRight } from "lucide-react";

import { DebateCardView } from "@/app/_components/DebateThread/DebateCardView";
import { labels } from "@/lib/vocabulary";
import type { MePostListItem } from "@/app/api/me/posts/route";

import styles from "./MyPostRow.module.css";

const PARENT_PREVIEW_MAX = 60;

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max).trimEnd()}…`;
}

export function MyPostRow({ post }: { post: MePostListItem }) {
  return (
    <div className={styles.row}>
      {post.parent && (
        <Link href={`/posts/${post.parent.id}`} className={styles.replyTo}>
          <CornerDownRight size={12} aria-hidden="true" />
          <span className={styles.replyToLabel}>{labels.dashboardReplyTo}</span>
          <span className={styles.replyToBody}>{truncate(post.parent.body, PARENT_PREVIEW_MAX)}</span>
        </Link>
      )}

      <DebateCardView
        post={{
          id: post.id,
          body: post.body,
          createdAt: post.createdAt,
          user: post.user,
          replyCount: post.replyCount,
          stance: post.stance,
          mainTripleTermIds: post.mainTripleTermIds,
        }}
        stance={post.stance}
        dense
        interactive={false}
      />

      <div className={styles.statsRow} aria-label="Stats received">
        <span className={styles.statBadge} title={labels.dashboardSupportersTitle}>
          <ThumbsUp size={12} aria-hidden="true" />
          <span>{post.thumbvotes === null ? "—" : post.thumbvotes.support}</span>
        </span>
        <span className={styles.statBadge} title={labels.dashboardOpposersTitle}>
          <ThumbsDown size={12} aria-hidden="true" />
          <span>{post.thumbvotes === null ? "—" : post.thumbvotes.oppose}</span>
        </span>
        <span className={styles.statBadge} title={labels.dashboardReplyCountTitle}>
          <MessageSquare size={12} aria-hidden="true" />
          <span>{post.replyCount}</span>
        </span>
      </div>
    </div>
  );
}
