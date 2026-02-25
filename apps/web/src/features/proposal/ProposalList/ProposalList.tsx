"use client";

import { Button } from "@/components/Button/Button";
import { AtomSuggestionInput } from "@/components/AtomSuggestionInput/AtomSuggestionInput";
import { RoleBadge } from "@/components/RoleBadge/RoleBadge";
import { labels } from "@/lib/vocabulary";

import type {
  ProposalSummary,
  TripleSuggestionSummary,
} from "@/features/post/ExtractionWorkspace/extractionTypes";
import { Badge } from "@/components/Badge/Badge";
import styles from "./ProposalList.module.css";

type ProposalListProps = {
  proposals: ProposalSummary[];
  mainProposalId: string | null;
  tripleSuggestionsByProposal: Record<string, TripleSuggestionSummary>;
  onChange: (proposalId: string, field: "sText" | "pText" | "oText", value: string) => void;
  onLockAtom: (
    proposalId: string,
    field: "sText" | "pText" | "oText",
    atomId: string,
    label: string
  ) => void;
  onUnlockAtom: (proposalId: string, field: "sText" | "pText" | "oText") => void;
  onSave: (proposalId: string) => void;
  onSelectMain: (proposalId: string) => void;
  onReject: (proposalId: string) => void;
  onSelectReuse: (proposalId: string, tripleTermId: string | null) => void;
  disabled?: boolean;
  dismissedSuggestions?: Set<string>;
  onAcceptSuggestion?: (proposalId: string) => void;
  onDismissSuggestion?: (proposalId: string) => void;
};

export function ProposalList({
  proposals,
  mainProposalId,
  tripleSuggestionsByProposal,
  onChange,
  onLockAtom,
  onUnlockAtom,
  onSave,
  onSelectMain,
  onReject,
  onSelectReuse,
  disabled,
  dismissedSuggestions,
  onAcceptSuggestion,
  onDismissSuggestion,
}: ProposalListProps) {
  if (proposals.length === 0) {
    return null;
  }

  function formatTripleId(id: string): string {
    const trimmed = id.trim();
    if (trimmed.length <= 12) return trimmed;
    return `${trimmed.slice(0, 6)}...${trimmed.slice(-4)}`;
  }

  return (
    <div className={styles.list}>
      {proposals.map((proposal) => {
        const isMain = proposal.id === mainProposalId;
        const hasAnyContent = Boolean(
          proposal.sText.trim() || proposal.pText.trim() || proposal.oText.trim()
        );
        const reuseState = tripleSuggestionsByProposal[proposal.id];
        const reuseSuggestions = reuseState?.suggestions ?? [];
        const selectedReuseId = proposal.matchedIntuitionTripleTermId ?? null;
        const reuseSelected = Boolean(selectedReuseId);

        return (
          <div
            key={proposal.id}
            className={`${styles.item} ${!proposal.isDraft ? styles.active : ""}`}
          >
            <div className={styles.header}>
              {!proposal.isDraft && (
                <div className={styles.statusRow}>
                  <RoleBadge role={isMain ? "MAIN" : "SUPPORTING"} />
                </div>
              )}
              {proposal.isDraft && (
                <div className={styles.statusRow}>
                  <span className={styles.draftTag}>Draft</span>
                </div>
              )}
              <div className={styles.actions}>
                {proposal.isDraft ? (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={disabled || !hasAnyContent}
                      onClick={() => onSave(proposal.id)}
                    >
                      Save
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={disabled}
                      onClick={() => onReject(proposal.id)}
                    >
                      Discard
                    </Button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      className={`${styles.starToggle} ${isMain ? styles.starActive : ""}`}
                      disabled={disabled || isMain}
                      onClick={() => onSelectMain(proposal.id)}
                      aria-label={isMain ? labels.roleMain : labels.selectMain}
                      title={isMain ? labels.roleMain : labels.selectMain}
                    >
                      ★
                    </button>
                    <button
                      type="button"
                      className={styles.removeBtn}
                      disabled={disabled}
                      onClick={() => onReject(proposal.id)}
                      aria-label="Remove"
                      title="Remove"
                    >
                      ✕
                    </button>
                  </>
                )}
              </div>
            </div>

            {proposal.stanceAligned === false && proposal.suggestedStance !== null && !dismissedSuggestions?.has(proposal.id) && !proposal.isDraft && onAcceptSuggestion && onDismissSuggestion && (
              <div className={styles.stanceBanner}>
                <div className={styles.stanceBannerText}>
                  <Badge tone={proposal.suggestedStance === "SUPPORTS" ? "supports" : "refutes"}>
                    {proposal.suggestedStance === "SUPPORTS" ? labels.stanceSupports : labels.stanceRefutes}
                  </Badge>
                  <span>AI suggests this claim</span>
                  {proposal.stanceReason && (
                    <span className={styles.stanceReason}>{proposal.stanceReason}</span>
                  )}
                </div>
                <div className={styles.stanceBannerActions}>
                  <Button
                    size="sm"
                    variant="primary"
                    disabled={disabled}
                    onClick={() => onAcceptSuggestion?.(proposal.id)}
                  >
                    Move
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={disabled}
                    onClick={() => onDismissSuggestion?.(proposal.id)}
                  >
                    Keep here
                  </Button>
                </div>
              </div>
            )}

            <div className={styles.triple}>
              <AtomSuggestionInput
                id={`${proposal.id}-subject`}
                label="Subject"
                value={proposal.sText}
                disabled={disabled}
                lockedAtomId={proposal.subjectAtomId ?? null}
                onChange={(value) => onChange(proposal.id, "sText", value)}
                onLock={(atomId, label) => onLockAtom(proposal.id, "sText", atomId, label)}
                onUnlock={() => onUnlockAtom(proposal.id, "sText")}
                hideCreateNew
              />
              <AtomSuggestionInput
                id={`${proposal.id}-predicate`}
                label="Predicate"
                value={proposal.pText}
                disabled={disabled}
                lockedAtomId={proposal.predicateAtomId ?? null}
                onChange={(value) => onChange(proposal.id, "pText", value)}
                onLock={(atomId, label) => onLockAtom(proposal.id, "pText", atomId, label)}
                onUnlock={() => onUnlockAtom(proposal.id, "pText")}
                hideCreateNew
              />
              <AtomSuggestionInput
                id={`${proposal.id}-object`}
                label="Object"
                value={proposal.oText}
                disabled={disabled}
                lockedAtomId={proposal.objectAtomId ?? null}
                onChange={(value) => onChange(proposal.id, "oText", value)}
                onLock={(atomId, label) => onLockAtom(proposal.id, "oText", atomId, label)}
                onUnlock={() => onUnlockAtom(proposal.id, "oText")}
                hideCreateNew
              />
            </div>

            {(reuseState?.status === "loading" || reuseState?.status === "error" || reuseSuggestions.length > 0 || reuseSelected) && (
              <div className={styles.reuseSection}>
                <div className={styles.reuseHeader}>
                  <span className={styles.reuseTitle}>{labels.reuseSuggestionsTitle}</span>
                  {reuseSelected && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={disabled}
                      onClick={() => onSelectReuse(proposal.id, null)}
                    >
                      Clear
                    </Button>
                  )}
                </div>
                {reuseState?.status === "loading" && (
                  <p className={styles.reuseHint}>{labels.reuseSearching}</p>
                )}
                {reuseState?.status === "error" && reuseState.error && (
                  <p className={styles.reuseError}>{reuseState.error}</p>
                )}
                {reuseSuggestions.length > 0 && (
                  <div className={styles.reuseList}>
                    {reuseSuggestions.map((suggestion) => {
                      const isSelected = suggestion.id === selectedReuseId;
                      const mc = suggestion.marketCap ?? null;
                      const cmc = suggestion.counterMarketCap ?? null;
                      return (
                        <button
                          key={suggestion.id}
                          type="button"
                          className={`${styles.reuseItem} ${isSelected ? styles.reuseItemActive : ""} ${suggestion.isExactMatch ? styles.reuseItemExact : ""}`}
                          onClick={() => onSelectReuse(proposal.id, suggestion.id)}
                          disabled={disabled}
                        >
                          <div className={styles.reuseRow}>
                            {suggestion.isExactMatch && (
                              <span className={styles.exactBadge}>{labels.reuseExactMatch}</span>
                            )}
                            <span className={styles.reuseLabel}>
                              {suggestion.subject} — {suggestion.predicate} — {suggestion.object}
                            </span>
                            <span className={styles.reuseId}>{formatTripleId(suggestion.id)}</span>
                          </div>
                          {(mc !== null || cmc !== null) && (
                            <div className={styles.reuseMeta}>
                              {mc !== null && (
                                <>
                                  <span>{labels.reuseFor}</span>
                                  <span>{mc.toFixed(2)}</span>
                                </>
                              )}
                              {cmc !== null && (
                                <>
                                  <span>{labels.reuseAgainst}</span>
                                  <span>{cmc.toFixed(2)}</span>
                                </>
                              )}
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
                {reuseSelected && reuseSuggestions.length === 0 && (
                  <p className={styles.reuseHint}>{labels.reuseReusing} {formatTripleId(selectedReuseId ?? "")}.</p>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
