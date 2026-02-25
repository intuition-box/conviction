import { ThumbsUp, ThumbsDown, Loader2 } from "lucide-react";
import styles from "./ThumbVote.module.css";

type ThumbVoteProps = {
  forCount: number;
  againstCount: number;
  userDirection: "support" | "oppose" | null;
  onVote: (direction: "support" | "oppose") => void;
  busy: boolean;
  busyDirection?: "support" | "oppose" | null;
  disabled?: boolean;
  size?: "sm" | "md";
};

export function ThumbVote({
  forCount,
  againstCount,
  userDirection,
  onVote,
  busy,
  busyDirection = null,
  disabled = false,
  size = "sm",
}: ThumbVoteProps) {
  const iconSize = size === "sm" ? 14 : 18;

  return (
    <div className={`${styles.wrapper} ${styles[size]}`}>
      <button
        type="button"
        className={`${styles.btn} ${userDirection === "support" ? styles.activeSupport : ""}`}
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          onVote("support");
        }}
        disabled={disabled || busy}
        aria-label={`Support (${forCount})`}
      >
        {busy && busyDirection === "support" ? (
          <Loader2 size={iconSize} className={styles.spinner} />
        ) : (
          <ThumbsUp size={iconSize} />
        )}
        <span className={styles.count}>{forCount}</span>
      </button>

      <button
        type="button"
        className={`${styles.btn} ${userDirection === "oppose" ? styles.activeOppose : ""}`}
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          onVote("oppose");
        }}
        disabled={disabled || busy}
        aria-label={`Oppose (${againstCount})`}
      >
        {busy && busyDirection === "oppose" ? (
          <Loader2 size={iconSize} className={styles.spinner} />
        ) : (
          <ThumbsDown size={iconSize} />
        )}
        <span className={styles.count}>{againstCount}</span>
      </button>
    </div>
  );
}
