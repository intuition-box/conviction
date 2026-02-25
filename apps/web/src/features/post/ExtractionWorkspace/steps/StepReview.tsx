"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/Button/Button";
import { labels } from "@/lib/vocabulary";
import { DraftCard } from "./DraftCard";

import type {
  ApprovedProposalWithRole,
  DraftActions,
  DraftPost,
  NestedProposalDraft,
  ProposalActions,
  ProposalSummary,
  TripleSuggestionSummary,
} from "../extractionTypes";
import styles from "../ExtractionWorkspace.module.css";

export type { ProposalActions };

type StepReviewProps = {
  extractionJob: { id: string; status: string } | null;
  proposalItems: ProposalSummary[];
  nestedProposals: NestedProposalDraft[];
  nestedRefLabels: Map<string, string>;
  approvedProposals: ApprovedProposalWithRole[];
  tripleSuggestionsByProposal: Record<string, TripleSuggestionSummary>;
  walletConnected: boolean;
  busy: boolean;
  canAdvance: boolean;
  actions: ProposalActions;
  onNext: () => void;
  onBack?: () => void;
  draftPosts: DraftPost[];
  isSplit: boolean;
  draftActions: DraftActions;
  extractedInputText: string;
  stanceRequired: boolean;
};

export function StepReview({
  extractionJob,
  proposalItems,
  nestedProposals,
  nestedRefLabels,
  approvedProposals,
  tripleSuggestionsByProposal,
  walletConnected,
  busy,
  canAdvance,
  actions,
  onNext,
  onBack,
  draftPosts,
  isSplit,
  draftActions,
  extractedInputText,
  stanceRequired,
}: StepReviewProps) {
  const [activeTab, setActiveTab] = useState(0);
  const writeDisabled = busy || !walletConnected;
  const extractionComplete = Boolean(extractionJob && extractionJob.status !== "pending");

  // Build stableKey → draftId lookup for nested filtering
  const stableKeyToDraftId = useMemo(() => {
    const map = new Map<string, string>();
    for (const draft of draftPosts) {
      for (const pid of draft.proposalIds) {
        const p = proposalItems.find((pi) => pi.id === pid);
        if (p?.stableKey) {
          map.set(p.stableKey, draft.id);
        }
      }
    }
    return map;
  }, [draftPosts, proposalItems]);

  // Filter nested proposals per draft using stableKey matching
  const nestedByDraft = useMemo(() => {
    const result = new Map<string, NestedProposalDraft[]>();
    for (const draft of draftPosts) {
      result.set(draft.id, []);
    }

    for (const edge of nestedProposals) {
      let draftId: string | undefined;
      // Try subject triple ref
      if (edge.subject.type === "triple") {
        draftId = stableKeyToDraftId.get(edge.subject.tripleKey);
      }
      // Try object triple ref
      if (!draftId && edge.object.type === "triple") {
        draftId = stableKeyToDraftId.get(edge.object.tripleKey);
      }
      // Atom-only nested: fallback to first draft
      draftId ??= draftPosts[0]?.id;
      if (draftId && result.has(draftId)) {
        result.get(draftId)!.push(edge);
      }
    }

    return result;
  }, [draftPosts, nestedProposals, stableKeyToDraftId]);

  const allDraftsHaveMain = draftPosts.length === 0 || draftPosts.every((draft) => {
    const draftItems = proposalItems.filter((p) => draft.proposalIds.includes(p.id));
    if (draftItems.length === 0) return true;
    return draft.mainProposalId !== null &&
      proposalItems.find((p) => p.id === draft.mainProposalId)?.status === "approved";
  });

  return (
    <div className={styles.stepContent}>
      {/* Original text block */}
      {extractedInputText && (
        <div className={styles.originalTextBlock}>
          <p className={styles.originalTextLabel}>{labels.originalTextLabel}</p>
          <p className={styles.originalText}>{extractedInputText}</p>
        </div>
      )}

      {/* ── Split mode: tab bar + active card ─────────────────────── */}
      {isSplit ? (() => {
        const safeTab = Math.min(activeTab, draftPosts.length - 1);
        const draft = draftPosts[safeTab];
        if (!draft) return null;
        const draftItems = proposalItems.filter((p) => draft.proposalIds.includes(p.id));
        const draftNested = nestedByDraft.get(draft.id) ?? [];
        const isLastTab = safeTab >= draftPosts.length - 1;

        return (
          <>
            <div className={styles.tabBar}>
              {draftPosts.map((d, i) => (
                <button
                  key={d.id}
                  type="button"
                  className={styles.tab}
                  data-active={i === safeTab}
                  data-stance={d.stance ?? undefined}
                  onClick={() => setActiveTab(i)}
                >
                  {labels.draftHeaderPrefix} {i + 1}
                </button>
              ))}
              <div className={styles.tabBarEnd}>
                <Button size="sm" variant="outline" onClick={draftActions.onMerge} disabled={writeDisabled}>
                  {labels.mergeAll}
                </Button>
              </div>
            </div>

            <DraftCard
              key={draft.id}
              draft={draft}
              draftIndex={safeTab}
              stance={draft.stance}
              proposals={draftItems}
              nestedProposals={draftNested}
              nestedRefLabels={nestedRefLabels}
              tripleSuggestionsByProposal={tripleSuggestionsByProposal}
              proposalActions={actions}
              draftActions={draftActions}
              isSplit={isSplit}
              disabled={writeDisabled}
              canAddClaim={extractionComplete}
              stanceRequired={stanceRequired}
            />

            {!walletConnected && (
              <p className={styles.warning}>{labels.connectWalletToPublish}</p>
            )}

            <div className={styles.actions}>
              {onBack && (
                <Button variant="outline" size="sm" onClick={onBack}>
                  ← Back
                </Button>
              )}
              <Button
                variant="primary"
                size="sm"
                onClick={isLastTab ? onNext : () => setActiveTab(safeTab + 1)}
                disabled={isLastTab && !canAdvance}
              >
                {isLastTab ? "Next →" : `${labels.nextDraft} →`}
              </Button>
              {!allDraftsHaveMain && approvedProposals.length > 0 && (
                <span className={styles.warning}>{labels.setMainWarning}</span>
              )}
            </div>
          </>
        );
      })() : (
        <>
          {/* Split button (non-split, 2+ proposals) */}
          {proposalItems.length >= 2 && (
            <div className={styles.sectionActions}>
              <Button size="sm" variant="outline" onClick={draftActions.onSplit} disabled={writeDisabled}>
                {labels.splitAction}
              </Button>
            </div>
          )}

          {/* Single draft card */}
          {draftPosts.map((draft, draftIndex) => {
            const draftItems = proposalItems.filter((p) => draft.proposalIds.includes(p.id));
            const draftNested = nestedByDraft.get(draft.id) ?? [];
            return (
              <DraftCard
                key={draft.id}
                draft={draft}
                draftIndex={draftIndex}
                stance={draft.stance}
                proposals={draftItems}
                nestedProposals={draftNested}
                nestedRefLabels={nestedRefLabels}
                tripleSuggestionsByProposal={tripleSuggestionsByProposal}
                proposalActions={actions}
                draftActions={draftActions}
                isSplit={isSplit}
                disabled={writeDisabled}
                canAddClaim={extractionComplete}
                stanceRequired={stanceRequired}
              />
            );
          })}

          {/* Add claim button */}
          {extractionComplete && (
            <div className={styles.sectionActions}>
              <Button size="sm" variant="secondary" onClick={() => actions.onAddDraft()} disabled={writeDisabled}>
                {labels.addTriple}
              </Button>
            </div>
          )}

          {!walletConnected && (
            <p className={styles.warning}>{labels.connectWalletToPublish}</p>
          )}

          <div className={styles.actions}>
            {onBack && (
              <Button variant="outline" size="sm" onClick={onBack}>
                ← Back
              </Button>
            )}
            <Button
              variant="primary"
              size="sm"
              onClick={onNext}
              disabled={!canAdvance}
            >
              Next →
            </Button>
            {!allDraftsHaveMain && approvedProposals.length > 0 && (
              <span className={styles.warning}>{labels.setMainWarning}</span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
