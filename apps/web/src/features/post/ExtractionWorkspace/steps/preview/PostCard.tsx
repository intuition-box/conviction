import * as Tooltip from "@radix-ui/react-tooltip";

import { ProtocolBadge } from "@/components/ProtocolBadge/ProtocolBadge";
import { labels } from "@/lib/vocabulary";

import {
  type ApprovedProposalWithRole,
  type DerivedTripleDraft,
  type DraftPost,
  type MainRef,
  type NestedProposalDraft,
} from "../../extraction";
import { StructuredTripleInline } from "../../components/StructuredTripleInline";
import type { DuplicateInfo } from "../../hooks/useDuplicateCheck";
import cardStyles from "./cardStyles.module.css";

import { type HoverTerms } from "./previewTypes";

export type PostCardProps = {
  draft: DraftPost;
  draftIndex: number;
  totalDrafts: number;
  proposals: ApprovedProposalWithRole[];
  nestedEdges: NestedProposalDraft[];
  allNestedProposals: NestedProposalDraft[];
  nestedRefLabels: Map<string, string>;
  derivedTriples?: DerivedTripleDraft[];
  derivedCanonicalLabels?: Map<string, { s?: string; p?: string; o?: string }>;
  mainRef: MainRef | null;
  stanceRequired: boolean;
  onHover: (terms: HoverTerms | null) => void;
  onRemove?: () => void;
  duplicates?: DuplicateInfo[];
  isBlocked?: boolean;
  blockingDuplicate?: DuplicateInfo;
  onShowRelated?: () => void;
  onStanceChange?: (stance: "SUPPORTS" | "REFUTES") => void;
};

export function PostCard({
  draft,
  draftIndex,
  totalDrafts,
  proposals,
  nestedEdges,
  allNestedProposals,
  nestedRefLabels,
  derivedTriples,
  derivedCanonicalLabels,
  mainRef,
  stanceRequired,
  onHover,
  onRemove,
  duplicates,
  isBlocked,
  blockingDuplicate,
  onShowRelated,
  onStanceChange,
}: PostCardProps) {
  const draftProposals = proposals.filter((p) =>
    draft.proposalIds.includes(p.id) && p.status === "approved",
  );
  const mainProposal = draftProposals.find((p) => p.id === draft.mainProposalId);

  const misaligned = stanceRequired
    ? draftProposals.find((p) => p.stanceAligned === false && p.isRelevant !== false)
    : null;

  const informationalDups = (duplicates ?? []).filter((d) => !d.isBlocking);

  return (
    <div
      className={cardStyles.card}
      data-stance={draft.stance ?? undefined}
      onMouseEnter={() => {
        if (!mainProposal) return;

        const modifierTexts = nestedEdges
          .filter((e) => e.edgeKind === "modifier")
          .map((e) => {
            const objLabel = e.object.type === "atom"
              ? e.object.label
              : nestedRefLabels.get(e.object.tripleKey) ?? "";
            return `${e.predicate} ${objLabel}`.trim();
          })
          .filter(Boolean);

        const hoverTerms: HoverTerms = {
          sText: mainProposal.sText,
          pText: mainProposal.pText,
          oText: mainProposal.oText,
          sentenceText: mainProposal.sentenceText,
          claimText: mainProposal.claimText,
          modifierTexts: modifierTexts.length > 0 ? modifierTexts : undefined,
        };

        if (mainRef?.type === "nested" && mainProposal.outermostMainKey) {
          const mainEdge = allNestedProposals.find(
            (n) => n.stableKey === mainProposal.outermostMainKey,
          );
          const isReferenced = mainEdge && (
            (mainEdge.subject.type === "triple" && mainEdge.subject.tripleKey === mainProposal.stableKey) ||
            (mainEdge.object.type === "triple" && mainEdge.object.tripleKey === mainProposal.stableKey)
          );
          if (!isReferenced) {
            hoverTerms.sText = "";
            hoverTerms.pText = "";
            hoverTerms.oText = "";
          }
        }

        onHover(hoverTerms);
      }}
      onMouseLeave={() => onHover(null)}
    >

      {informationalDups.length > 0 && !isBlocked && (
        <Tooltip.Root>
          <Tooltip.Trigger asChild>
            <button
              type="button"
              className={cardStyles.duplicateDot}
              aria-label="View related posts"
              onClick={(e) => { e.stopPropagation(); onShowRelated?.(); }}
            />
          </Tooltip.Trigger>
          <Tooltip.Portal>
            <Tooltip.Content className={cardStyles.duplicateTooltip} side="top" sideOffset={4}>
              <p>{labels.duplicateCrossDebate}</p>
              {informationalDups.length > 1 && (
                <p className={cardStyles.duplicateMore}>
                  {labels.duplicateAndOthers.replace("{n}", String(informationalDups.length - 1))}
                </p>
              )}
              <Tooltip.Arrow />
            </Tooltip.Content>
          </Tooltip.Portal>
        </Tooltip.Root>
      )}

      <div className={cardStyles.header}>
        {totalDrafts > 1 && (
          <span className={cardStyles.headerTitle}>
            {labels.draftHeaderPrefix} {draftIndex + 1}
          </span>
        )}
        {onRemove && (
          <button
            type="button"
            className={cardStyles.removeBtn}
            onClick={(e) => { e.stopPropagation(); onRemove(); }}
            aria-label="Remove post"
          >
            &#215;
          </button>
        )}
      </div>

      {isBlocked && blockingDuplicate ? (
        <div className={cardStyles.blockedCard}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          <p className={cardStyles.blockedTitle}>{labels.duplicateBlockedTitle}</p>
          <p className={cardStyles.blockedBody}>
            &ldquo;{blockingDuplicate.postBody}&rdquo;
            {blockingDuplicate.authorDisplayName && (
              <span className={cardStyles.blockedAuthor}>
                {" "}&mdash; {blockingDuplicate.authorDisplayName}
              </span>
            )}
          </p>
          <a
            href={`/posts/${blockingDuplicate.postId}`}
            target="_blank"
            rel="noopener noreferrer"
            className={cardStyles.blockedCta}
          >
            {labels.duplicateBlockedCta} &rarr;
          </a>
        </div>
      ) : (
        <>
          {misaligned && (
            <div className={cardStyles.stanceWarning}>
              <span className={cardStyles.stanceWarningIcon}>&#9888;</span>
              <span>
                {`This looks more like a ${misaligned.suggestedStance === "SUPPORTS" ? "support" : "rebuttal"}.`}
              </span>
              {onStanceChange && misaligned.suggestedStance && (
                <button
                  type="button"
                  className={cardStyles.stanceSwitch}
                  onClick={() => onStanceChange(misaligned.suggestedStance as "SUPPORTS" | "REFUTES")}
                >
                  Switch
                </button>
              )}
            </div>
          )}

          {draft.body ? (
            <p className={cardStyles.body}>{draft.body}</p>
          ) : (
            <p className={cardStyles.bodyMuted}>No body</p>
          )}

          {mainRef && mainRef.type !== "error" && (
            <div className={cardStyles.actions}>
              <ProtocolBadge />
              <StructuredTripleInline
                target={mainRef}
                proposals={proposals}
                nestedProposals={allNestedProposals}
                nestedRefLabels={nestedRefLabels}
                derivedTriples={derivedTriples}
                derivedCanonicalLabels={derivedCanonicalLabels}
                wrap
              />
            </div>
          )}
        </>
      )}

    </div>
  );
}
