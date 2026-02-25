import Link from "next/link";
import { TripleTooltip } from "@/components/TripleTooltip/TripleTooltip";
import { SentimentRing } from "@/components/SentimentBar/SentimentRing";
import type { SentimentMap } from "@/hooks/useSentimentBatch";

import styles from "./ReplyColumn.module.css";

type Reply = {
  id: string;
  body: string;
  createdAt: string;
  replyCount: number;
  mainTripleTermIds?: string[];
};

type Stance = "supports" | "refutes";

type ReplyColumnProps = {
  stance: Stance;
  title: string;
  replies: Reply[];
  onAdd: () => void;
  onBadgeClick?: (tripleTermIds: string[]) => void;
  sentimentMap?: SentimentMap;
};

const LABELS: Record<Stance, string> = {
  supports: "No supports yet.",
  refutes: "No refutes yet.",
};

export function ReplyColumn({ stance, title, replies, onAdd, onBadgeClick, sentimentMap }: ReplyColumnProps) {
  return (
    <div className={`${styles.column} ${styles[stance]}`}>
      <div className={styles.header}>
        <span className={styles.title}>{title}</span>
        <span className={styles.count}>{replies.length}</span>
        <button
          className={styles.addBtn}
          onClick={onAdd}
          aria-label={`Add ${stance} reply`}
        >
          +
        </button>
      </div>

      <div className={styles.replies}>
        {replies.length === 0 ? (
          <p className={styles.empty}>{LABELS[stance]}</p>
        ) : (
          replies.map((reply) => (
            <Link
              key={reply.id}
              href={`/posts/${reply.id}`}

              className={styles.replyCard}
            >
              <p className={styles.replyBody}>{reply.body}</p>
              <div className={styles.replyFooter}>
                <span className={styles.replyCount}>
                  {reply.replyCount} {reply.replyCount === 1 ? "reply" : "replies"}
                </span>
                {reply.mainTripleTermIds?.[0] && sentimentMap?.[reply.mainTripleTermIds[0]] && (
                  <SentimentRing
                    supportPct={sentimentMap[reply.mainTripleTermIds[0]].supportPct}
                    size={14}
                    strokeWidth={2}
                    empty={sentimentMap[reply.mainTripleTermIds[0]].totalParticipants === 0}
                  />
                )}
                {reply.mainTripleTermIds && reply.mainTripleTermIds.length > 0 && (
                  <TripleTooltip tripleTermIds={reply.mainTripleTermIds}>
                    <span
                      className={styles.protocolBadge}
                      role="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        onBadgeClick?.(reply.mainTripleTermIds!);
                      }}
                    >
                      ⛓
                    </span>
                  </TripleTooltip>
                )}
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
