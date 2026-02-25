"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BarChart3, MessageSquare } from "lucide-react";

import { TripleTooltip } from "@/components/TripleTooltip/TripleTooltip";
import { SentimentRing } from "@/components/SentimentBar/SentimentRing";
import { QuickVoteModal } from "@/app/_components/QuickVoteModal/QuickVoteModal";
import type { FeedReplyPreview } from "@/app/HomePageClient";
import type { SentimentMap } from "@/hooks/useSentimentBatch";
import type { ReplyTarget } from "./FeedThread";
import { displayName, formatRelativeTime, stanceLabel, truncate } from "./helpers";
import styles from "./FeedPost.module.css";

type ReplyPreviewProps = {
  reply: FeedReplyPreview;
  themeSlug: string;
  onBadgeClick?: (tripleTermIds: string[]) => void;
  onReply?: (target: ReplyTarget) => void;
  sentimentMap?: SentimentMap;
};

function stanceClass(stance: string) {
  switch (stance) {
    case "SUPPORTS":
      return styles.stanceSupports;
    case "REFUTES":
      return styles.stanceRefutes;
    default:
      return "";
  }
}

export function ReplyPreview({ reply, themeSlug, onBadgeClick, onReply, sentimentMap }: ReplyPreviewProps) {
  const router = useRouter();
  const [voteOpen, setVoteOpen] = useState(false);

  const mainTripleTermId = reply.mainTripleTermIds?.[0] ?? null;

  return (
    <>
      <div
        className={`${styles.replyPreview} ${reply.stance ? stanceClass(reply.stance) : ""}`}
        onClick={() => router.push(`/posts/${reply.id}`)}
        onMouseEnter={() => router.prefetch(`/posts/${reply.id}`)}
        role="link"
        tabIndex={0}
      >
        <div className={styles.replyAvatar}>
          {reply.user.avatar ? (
            <img src={reply.user.avatar} alt="" className={styles.replyAvatarImg} />
          ) : (
            <div className={styles.replyAvatarPlaceholder}>
              {displayName(reply.user).charAt(0).toUpperCase()}
            </div>
          )}
        </div>
        <div className={styles.replyContent}>
          <div className={styles.replyHeader}>
            <span className={styles.replyName}>{displayName(reply.user)}</span>
            {reply.stance && (
              <span className={`${styles.replyStance} ${stanceClass(reply.stance)}`}>
                {stanceLabel(reply.stance)}
              </span>
            )}
            <span className={styles.replyTime}>{formatRelativeTime(reply.createdAt)}</span>
            {reply.mainTripleTermIds && reply.mainTripleTermIds.length > 0 && (
              <TripleTooltip tripleTermIds={reply.mainTripleTermIds} onClick={onBadgeClick}>
                <span className={styles.protocolBadge}>⛓</span>
              </TripleTooltip>
            )}
          </div>
          <p className={styles.replyBody}>{truncate(reply.body, 140)}</p>
          <div className={styles.replyActions}>
            {reply.replyCount > 0 && (
              <span className={styles.replies}>
                <MessageSquare size={12} />
                {reply.replyCount}
              </span>
            )}
            {mainTripleTermId && sentimentMap?.[mainTripleTermId] && (
              <SentimentRing
                supportPct={sentimentMap[mainTripleTermId].supportPct}
                size={14}
                strokeWidth={2}
                empty={sentimentMap[mainTripleTermId].totalParticipants === 0}
              />
            )}
            {mainTripleTermId && (
              <button
                className={styles.voteBtn}
                onClick={(e) => {
                  e.stopPropagation();
                  setVoteOpen(true);
                }}
                aria-label="Quick vote"
              >
                <BarChart3 size={12} />
                Signal
              </button>
            )}
            <button
              className={styles.replyBtn}
              onClick={(e) => {
                e.stopPropagation();
                onReply?.({ postId: reply.id, themeSlug, mainTripleTermId });
              }}
              aria-label="Reply"
            >
              <MessageSquare size={12} />
              Reply
            </button>
          </div>
        </div>
      </div>

      {voteOpen && mainTripleTermId && (
        <QuickVoteModal
          tripleTermId={mainTripleTermId}
          onClose={() => setVoteOpen(false)}
        />
      )}
    </>
  );
}
