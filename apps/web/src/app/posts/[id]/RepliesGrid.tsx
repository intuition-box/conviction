import { ReplyColumn } from "@/app/_components/ReplyColumn/ReplyColumn";
import type { Stance } from "@/features/post/ExtractionWorkspace/extractionTypes";
import type { SentimentMap } from "@/hooks/useSentimentBatch";

import styles from "./RepliesGrid.module.css";

type ReplyNode = {
  id: string;
  body: string;
  createdAt: string;
  stance: string | null;
  replyCount: number;
  mainTripleTermIds?: string[];
};

type RepliesGridProps = {
  supportReplies: ReplyNode[];
  refuteReplies: ReplyNode[];
  onReply: (stance: Stance) => void;
  onBadgeClick?: (tripleTermIds: string[]) => void;
  sentimentMap?: SentimentMap;
};

export function RepliesGrid({
  supportReplies,
  refuteReplies,
  onReply,
  onBadgeClick,
  sentimentMap,
}: RepliesGridProps) {
  return (
    <section className={styles.section}>
      <div className={styles.columns}>
        <ReplyColumn
          stance="supports"
          title="Supports"
          replies={supportReplies}
          onAdd={() => onReply("SUPPORTS")}
          onBadgeClick={onBadgeClick}
          sentimentMap={sentimentMap}
        />
        <ReplyColumn
          stance="refutes"
          title="Refutes"
          replies={refuteReplies}
          onAdd={() => onReply("REFUTES")}
          onBadgeClick={onBadgeClick}
          sentimentMap={sentimentMap}
        />
      </div>
    </section>
  );
}
