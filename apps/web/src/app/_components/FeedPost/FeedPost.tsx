"use client";

import { useRouter } from "next/navigation";
import { MessageSquare } from "lucide-react";

import { ThemeBadge } from "@/components/ThemeBadge/ThemeBadge";
import { TripleTooltip } from "@/components/TripleTooltip/TripleTooltip";
import { SentimentCircle } from "@/components/SentimentBar/SentimentCircle";
import { ConnectedThumbVote } from "@/components/ThumbVote";
import type { FeedPostData } from "@/app/HomePageClient";
import type { SentimentMap } from "@/hooks/useSentimentBatch";
import type { ReplyTarget } from "./FeedThread";
import { displayName, formatRelativeTime } from "./helpers";
import styles from "./FeedPost.module.css";

type FeedPostProps = {
  post: FeedPostData;
  onBadgeClick?: (tripleTermIds: string[]) => void;
  onReply?: (target: ReplyTarget) => void;
  sentimentMap?: SentimentMap;
};

export function FeedPost({ post, onBadgeClick, onReply, sentimentMap }: FeedPostProps) {
  const router = useRouter();

  const mainTripleTermId = post.mainTripleTermIds?.[0] ?? null;

  function handleClick() {
    router.push(`/posts/${post.id}`);
  }

  return (
    <div className={styles.post} onClick={handleClick} role="link" tabIndex={0}>
      <div className={styles.avatar}>
        {post.user.avatar ? (
          <img src={post.user.avatar} alt="" className={styles.avatarImg} />
        ) : (
          <div className={styles.avatarPlaceholder}>
            {displayName(post.user).charAt(0).toUpperCase()}
          </div>
        )}
      </div>
      <div className={styles.content}>
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <span className={styles.name}>{displayName(post.user)}</span>
            <span className={styles.time}>{formatRelativeTime(post.createdAt)}</span>
          </div>
          <div className={styles.headerRight}>
            <ThemeBadge size="sm">{post.theme.name}</ThemeBadge>
            {post.mainTripleTermIds && post.mainTripleTermIds.length > 0 && (
              <TripleTooltip tripleTermIds={post.mainTripleTermIds} onClick={onBadgeClick}>
                <span className={styles.protocolBadge}>⛓</span>
              </TripleTooltip>
            )}
          </div>
        </div>
        <p className={styles.body}>{post.body}</p>
        <div className={styles.footer}>
          <span className={styles.replies}>
            <MessageSquare size={14} />
            {post.replyCount}
          </span>
          {mainTripleTermId && sentimentMap?.[mainTripleTermId] && (
            <SentimentCircle
              supportPct={sentimentMap[mainTripleTermId].supportPct}
              totalParticipants={sentimentMap[mainTripleTermId].totalParticipants}
              mode="compact"
            />
          )}
          {mainTripleTermId && (
            <ConnectedThumbVote
              tripleTermId={mainTripleTermId}
              sentimentData={sentimentMap?.[mainTripleTermId] ?? null}
              size="sm"
            />
          )}
          <button
            className={styles.replyBtn}
            onClick={(e) => {
              e.stopPropagation();
              onReply?.({ postId: post.id, themeSlug: post.theme.slug, mainTripleTermId });
            }}
            aria-label="Reply"
          >
            <MessageSquare size={14} />
            Reply
          </button>
        </div>
      </div>
    </div>
  );
}
