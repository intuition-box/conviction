"use client";

import { Button } from "@/components/Button/Button";
import { labels } from "@/lib/vocabulary";

import styles from "./StepSplitDecision.module.css";

type StepSplitDecisionProps = {
  proposalCount: number;
  onSplit: () => void;
  onKeepAsOne: () => void;
};

export function StepSplitDecision({
  proposalCount,
  onSplit,
  onKeepAsOne,
}: StepSplitDecisionProps) {
  return (
    <div className={styles.wrapper}>
      <p className={styles.title}>
        {labels.splitDecisionTitle.replace("{count}", String(proposalCount))}
      </p>
      <p className={styles.body}>{labels.splitDecisionBody}</p>
      <Button variant="primary" className={styles.cta} onClick={onSplit}>
        {labels.splitDecisionCta.replace("{count}", String(proposalCount))}
      </Button>
      <button type="button" className={styles.dismiss} onClick={onKeepAsOne}>
        {labels.splitDecisionDismiss}
      </button>
    </div>
  );
}
