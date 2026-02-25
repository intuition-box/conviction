"use client";

import { Button } from "@/components/Button/Button";
import { NestedEdgeList } from "@/features/proposal/NestedEdgeList/NestedEdgeList";
import { DraftCard } from "./DraftCard";

import type {
  DraftActions,
  DraftPost,
  NestedActions,
  NestedProposalDraft,
  ProposalActions,
  ProposalSummary,
  TripleSuggestionSummary,
} from "../extractionTypes";
import styles from "../ExtractionWorkspace.module.css";

type StepContextProps = {
  draftPosts: DraftPost[];
  proposalItems: ProposalSummary[];
  displayNestedProposals: NestedProposalDraft[];
  nestedRefLabels: Map<string, string>;
  nestedActions: NestedActions;
  proposalActions: ProposalActions;
  draftActions: DraftActions;
  tripleSuggestionsByProposal: Record<string, TripleSuggestionSummary>;
  isSplit: boolean;
  busy: boolean;
  walletConnected: boolean;
  onNext: () => void;
  onBack: () => void;
};

export function StepContext({
  draftPosts,
  proposalItems,
  displayNestedProposals,
  nestedRefLabels,
  nestedActions,
  proposalActions,
  draftActions,
  tripleSuggestionsByProposal,
  isSplit,
  busy,
  walletConnected,
  onNext,
  onBack,
}: StepContextProps) {
  const disabled = busy || !walletConnected;

  return (
    <div className={styles.stepContent}>
      {/* Read-only draft cards recap */}
      <div className={isSplit ? styles.readOnlyGrid : undefined}>
        {draftPosts.map((draft, draftIndex) => {
          const draftItems = proposalItems.filter((p) => draft.proposalIds.includes(p.id));
          if (draftItems.length === 0 && !isSplit) return null;

          return (
            <DraftCard
              key={draft.id}
              draft={draft}
              draftIndex={draftIndex}
              stance={draft.stance}
              proposals={draftItems}
              nestedProposals={[]}
              nestedRefLabels={nestedRefLabels}
              tripleSuggestionsByProposal={tripleSuggestionsByProposal}
              proposalActions={proposalActions}
              draftActions={draftActions}
              isSplit={isSplit}
              disabled={disabled}
              readOnly
            />
          );
        })}
      </div>

      {/* Interactive nested edges — reject/restore */}
      <NestedEdgeList
        edges={displayNestedProposals}
        nestedRefLabels={nestedRefLabels}
        onReject={nestedActions.onReject}
        onRestore={nestedActions.onRestore}
        disabled={disabled}
      />

      <div className={styles.actions}>
        <Button variant="outline" size="sm" onClick={onBack}>
          ← Back
        </Button>
        <Button variant="primary" size="sm" onClick={onNext}>
          Next →
        </Button>
      </div>
    </div>
  );
}
