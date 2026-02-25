import styles from "./SentimentCircle.module.css";

type SentimentCircleProps = {
  supportPct: number;
  totalParticipants: number;
  mode?: "full" | "compact";
};

export function SentimentCircle({
  supportPct,
  totalParticipants,
  mode = "compact",
}: SentimentCircleProps) {
  const clamped = Math.min(100, Math.max(0, supportPct));
  const empty = totalParticipants === 0;

  const ariaLabel = empty
    ? "No votes yet"
    : `${totalParticipants} votes — ${Math.round(clamped)}% support`;

  const cls = [
    styles.circle,
    styles[mode],
    empty ? styles.empty : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={cls} aria-label={ariaLabel} role="img">
      {mode === "full" && (
        <>
          <span className={styles.number}>{totalParticipants}</span>
          <span className={styles.label}>votes</span>
        </>
      )}
      {mode === "compact" && !empty && (
        <span className={styles.hoverPct}>{Math.round(clamped)}%</span>
      )}
    </div>
  );
}
