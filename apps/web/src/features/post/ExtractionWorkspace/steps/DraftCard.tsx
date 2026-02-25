"use client";

import { useState } from "react";
import { Button } from "@/components/Button/Button";
import { RoleBadge } from "@/components/RoleBadge/RoleBadge";
import { TripleInline } from "@/components/TripleInline/TripleInline";
import { ProposalList } from "@/features/proposal/ProposalList/ProposalList";
import { NestedEdgeList } from "@/features/proposal/NestedEdgeList/NestedEdgeList";
import { labels } from "@/lib/vocabulary";

import type {
  DraftActions,
  DraftPost,
  NestedProposalDraft,
  ProposalActions,
  ProposalSummary,
  Stance,
  TripleSuggestionSummary,
} from "../extractionTypes";
import styles from "./DraftCard.module.css";

type DraftCardProps = {
  draft: DraftPost;
  draftIndex: number;
  stance: Stance | null;
  proposals: ProposalSummary[];
  nestedProposals: NestedProposalDraft[];
  nestedRefLabels: Map<string, string>;
  tripleSuggestionsByProposal: Record<string, TripleSuggestionSummary>;
  proposalActions: ProposalActions;
  draftActions: DraftActions;
  isSplit: boolean;
  disabled: boolean;
  readOnly?: boolean;
  canAddClaim?: boolean;
  stanceRequired?: boolean;
};

export function DraftCard({
  draft,
  draftIndex,
  stance,
  proposals,
  nestedProposals,
  nestedRefLabels,
  tripleSuggestionsByProposal,
  proposalActions,
  draftActions,
  isSplit,
  disabled,
  readOnly = false,
  canAddClaim = false,
  stanceRequired = false,
}: DraftCardProps) {
  const [isEditing, setIsEditing] = useState(false);

  const stanceAttr = stance ?? undefined;
  const hasBody = draft.body.trim().length > 0;
  const bodyDirty = draft.body !== draft.bodyDefault;

  return (
    <div className={styles.card} data-stance={stanceAttr}>
      {/* ── Header (split mode only) ──────────────────────────── */}
      {isSplit && (
        <div className={styles.header}>
          <span className={styles.headerTitle}>
            {labels.draftHeaderPrefix} {draftIndex + 1}
          </span>
          {stanceRequired && !readOnly && (
            <div className={styles.stanceSelector}>
              <button
                type="button"
                className={styles.stanceBtn}
                data-active={stance === "SUPPORTS"}
                data-stance="SUPPORTS"
                disabled={disabled}
                onClick={() => draftActions.onStanceChange(draft.id, "SUPPORTS")}
                aria-label={labels.stanceSupports}
              >
                {labels.stanceSupports}
              </button>
              <button
                type="button"
                className={styles.stanceBtn}
                data-active={stance === "REFUTES"}
                data-stance="REFUTES"
                disabled={disabled}
                onClick={() => draftActions.onStanceChange(draft.id, "REFUTES")}
                aria-label={labels.stanceRefutes}
              >
                {labels.stanceRefutes}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Body section (split mode only — non-split uses original text above) */}
      {isSplit && (
        readOnly ? (
          hasBody && <p className={styles.bodyText}>{draft.body}</p>
        ) : (
          <>
            {isEditing ? (
              <>
                <textarea
                  id={`body-${draft.id}`}
                  className={styles.bodyTextarea}
                  value={draft.body}
                  onChange={(e) => draftActions.onBodyChange(draft.id, e.target.value)}
                  disabled={disabled}
                  rows={3}
                  placeholder={labels.bodyPlaceholder}
                />
                <div className={styles.bodyEditRow}>
                  <button
                    type="button"
                    className={styles.editToggle}
                    onClick={() => setIsEditing(false)}
                  >
                    {labels.doneEditingButton}
                  </button>
                  {bodyDirty && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className={styles.bodyResetBtn}
                      onClick={() => draftActions.onBodyReset(draft.id)}
                      disabled={disabled}
                    >
                      {labels.bodyReset}
                    </Button>
                  )}
                </div>
              </>
            ) : (
              <>
                {hasBody && <p className={styles.bodyText}>{draft.body}</p>}
                <button
                  type="button"
                  className={styles.editToggle}
                  onClick={() => setIsEditing(true)}
                  disabled={disabled}
                >
                  {labels.editBodyButton}
                </button>
              </>
            )}
          </>
        )
      )}

      {/* ── Triples section ───────────────────────────────────── */}
      <div className={styles.triplesSection}>
        {readOnly ? (
          /* Read-only summary (Step 2/3) */
          proposals.length > 0 ? (
            proposals
              .filter((p) => p.status === "approved")
              .map((p) => {
                const isMain = p.id === draft.mainProposalId;
                return (
                  <div key={p.id} className={styles.tripleSummary}>
                    <RoleBadge role={isMain ? "MAIN" : "SUPPORTING"} />
                    <TripleInline subject={p.sText} predicate={p.pText} object={p.oText} />
                  </div>
                );
              })
          ) : (
            <p className={styles.empty}>{labels.emptyDraftHint}</p>
          )
        ) : (
          /* Interactive triples (Step 1) */
          <>
            {proposals.length > 0 ? (
              <ProposalList
                proposals={proposals}
                mainProposalId={draft.mainProposalId}
                tripleSuggestionsByProposal={tripleSuggestionsByProposal}
                onChange={proposalActions.onChange}
                onLockAtom={proposalActions.onLock}
                onUnlockAtom={proposalActions.onUnlock}
                onSave={proposalActions.onSave}
                onSelectMain={proposalActions.onSelectMain}
                onReject={proposalActions.onReject}
                onSelectReuse={proposalActions.onSelectReuse}
                disabled={disabled}
              />
            ) : (
              <p className={styles.empty}>{labels.emptyDraftHint}</p>
            )}

            {canAddClaim && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => proposalActions.onAddDraft(draft.id)}
                disabled={disabled}
              >
                {labels.addTriple}
              </Button>
            )}
          </>
        )}
      </div>

      {/* ── Nested edges preview ──────────────────────────────── */}
      {nestedProposals.length > 0 && (
        <div className={styles.nestedSection}>
          <NestedEdgeList
            edges={nestedProposals}
            nestedRefLabels={nestedRefLabels}
          />
        </div>
      )}
    </div>
  );
}
