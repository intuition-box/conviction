import styles from "./SentimentBar.module.css";

type SentimentBarProps = {
  supportPct: number;
  totalParticipants: number;
  userDirection?: "support" | "oppose" | null;
  onVoteClick?: () => void;
  loading?: boolean;
  forCount?: number;
  againstCount?: number;
};

export function SentimentBar({
  supportPct,
  totalParticipants,
  userDirection = null,
  onVoteClick,
  loading = false,
  forCount,
  againstCount,
}: SentimentBarProps) {
  const clamped = Math.min(100, Math.max(0, supportPct));
  const opposePct = 100 - clamped;
  const empty = totalParticipants === 0;

  if (loading) {
    return (
      <div className={styles.wrapper}>
        <div className={styles.skeleton} />
        <div className={styles.skeletonRow} />
      </div>
    );
  }

  return (
    <div className={styles.wrapper}>
      {/* Percentage labels — above bar */}
      {empty ? (
        <p className={styles.emptyLabel}>No votes yet</p>
      ) : (
        <div className={styles.pctRow}>
          <span className={styles.pctSupport}>{Math.round(clamped)}% support</span>
          <span className={styles.pctOppose}>{Math.round(opposePct)}% oppose</span>
        </div>
      )}

      {/* Bar */}
      <div className={styles.bar}>
        {empty ? (
          <div className={styles.barEmpty} />
        ) : (
          <>
            <div
              className={styles.barSupport}
              style={{ width: `${clamped}%` }}
            />
            <div
              className={styles.barOppose}
              style={{ width: `${opposePct}%` }}
            />
          </>
        )}
      </div>

      {/* Detail row — below bar */}
      {!empty && forCount != null && againstCount != null && (
        <div className={styles.detailRow}>
          <span className={styles.detailSupport}>
            {forCount} supporter{forCount !== 1 ? "s" : ""}
          </span>
          <span className={styles.detailOppose}>
            {againstCount} opposer{againstCount !== 1 ? "s" : ""}
          </span>
        </div>
      )}

      {/* Footer */}
      <div className={styles.footer}>
        <div className={styles.footerLeft}>
          {userDirection && (
            <span className={styles.userBadge} data-side={userDirection}>
              <span className={styles.userDot} />
              You: {userDirection === "support" ? "Support" : "Oppose"}
            </span>
          )}
        </div>
        {onVoteClick && (
          <button type="button" className={styles.voteBtn} onClick={onVoteClick}>
            {userDirection ? "Update position" : "Cast your vote"} &rarr;
          </button>
        )}
      </div>
    </div>
  );
}
