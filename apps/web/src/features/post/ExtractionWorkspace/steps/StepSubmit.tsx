"use client";

import { useMemo } from "react";
import Link from "next/link";
import { formatEther } from "viem";

import { Button } from "@/components/Button/Button";
import { TripleInline } from "@/components/TripleInline/TripleInline";
import { intuitionTestnet } from "@/lib/chain";
import { labels } from "@/lib/vocabulary";

import type {
  ApprovedProposalWithRole,
  ApprovedTripleStatus,
  ApprovedTripleStatusState,
  DepositState,
  DraftPost,
  ExistingTripleMetrics,
  ExistingTripleStatus,
  NestedProposalDraft,
  NestedTermRef,
  PublishSummary,
  TxPlanItem,
} from "../extractionTypes";
import styles from "../ExtractionWorkspace.module.css";
import { PreviewCard } from "./PreviewCard";

// ─── Props ───────────────────────────────────────────────────────────────────

type StepSubmitProps = {
  approvedProposals: ApprovedProposalWithRole[];
  approvedTripleStatuses: ApprovedTripleStatus[];
  approvedTripleStatus: ApprovedTripleStatusState;
  approvedTripleStatusError: string | null;
  minDeposit: bigint | null;
  atomCost: bigint | null;
  tripleCost: bigint | null;
  existingTripleId: string | null;
  existingTripleStatus: ExistingTripleStatus;
  existingTripleError: string | null;
  existingTripleMetrics: ExistingTripleMetrics;
  depositState: DepositState;
  txPlan: TxPlanItem[];
  publishedPosts: PublishSummary[];
  isPublishing: boolean;
  publishError: string | null;
  contextDirty: boolean;
  walletConnected: boolean;
  correctChain: boolean;
  onPublish: () => void;
  onConnect: () => void;
  onSwitchChain?: () => void;
  onBack: () => void;
  draftPosts: DraftPost[];
  stanceRequired: boolean;
  visibleNestedProposals: NestedProposalDraft[];
  nestedRefLabels: Map<string, string>;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function renderNestedRef(ref: NestedTermRef, refLabels: Map<string, string>): string {
  if (ref.type === "atom") return ref.label || ref.atomKey;
  if (ref.label) return ref.label;
  return refLabels.get(ref.tripleKey) ?? ref.tripleKey;
}

function truncateId(id: string): string {
  if (id.length <= 14) return id;
  return `${id.slice(0, 6)}...${id.slice(-4)}`;
}

function formatMetricValue(value: number | null): string {
  if (value === null) return "\u2014";
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(2)}K`;
  return value.toFixed(2);
}

function formatCost(wei: bigint): string {
  const num = parseFloat(formatEther(wei));
  if (num === 0) return "0";
  if (num < 0.0001) return "< 0.0001";
  return num.toFixed(4).replace(/\.?0+$/, "");
}

// ─── Component ───────────────────────────────────────────────────────────────

export function StepSubmit({
  approvedProposals,
  approvedTripleStatuses,
  approvedTripleStatus,
  approvedTripleStatusError,
  minDeposit,
  atomCost,
  tripleCost,
  existingTripleId,
  existingTripleStatus,
  existingTripleError,
  existingTripleMetrics,
  depositState,
  txPlan: _txPlan,
  publishedPosts,
  isPublishing,
  publishError,
  contextDirty,
  walletConnected,
  correctChain,
  onPublish,
  onConnect,
  onSwitchChain,
  onBack,
  draftPosts,
  stanceRequired,
  visibleNestedProposals,
  nestedRefLabels,
}: StepSubmitProps) {
  const currencySymbol = intuitionTestnet.nativeCurrency.symbol;
  const tripleExists = existingTripleStatus === "found" && Boolean(existingTripleId);
  const tripleStatusReady = approvedTripleStatus === "ready";

  // ── Derive view state ───────────────────────────────────────────
  type ViewState = "preview" | "publishing" | "success" | "error";
  const viewState: ViewState = publishedPosts.length > 0
    ? "success"
    : isPublishing
      ? "publishing"
      : publishError
        ? "error"
        : "preview";

  // ── Summaries for preview ───────────────────────────────────────
  const nestedCount = visibleNestedProposals.length;

  const atomSummary = useMemo(() => {
    const seen = new Set<string>();
    const atoms: { label: string; isExisting: boolean }[] = [];
    for (const ap of approvedProposals) {
      for (const entry of [
        { label: ap.sText, atomId: ap.subjectAtomId },
        { label: ap.pText, atomId: ap.predicateAtomId },
        { label: ap.oText, atomId: ap.objectAtomId },
      ]) {
        const key = entry.atomId ?? entry.label;
        if (!seen.has(key)) {
          seen.add(key);
          atoms.push({ label: entry.label, isExisting: Boolean(entry.atomId) });
        }
      }
    }
    return {
      atoms,
      newAtoms: atoms.filter((a) => !a.isExisting),
      existingAtoms: atoms.filter((a) => a.isExisting),
    };
  }, [approvedProposals]);

  const tripleSummary = useMemo(() => {
    const statusMap = new Map(approvedTripleStatuses.map((s) => [s.proposalId, s]));
    const triples = approvedProposals.map((proposal) => {
      const status = statusMap.get(proposal.id);
      return {
        proposal,
        isExisting: status?.isExisting ?? false,
        tripleTermId: status?.tripleTermId ?? null,
      };
    });
    return {
      triples,
      existingTriples: triples.filter((t) => t.isExisting),
      newTriples: triples.filter((t) => !t.isExisting),
    };
  }, [approvedProposals, approvedTripleStatuses]);

  const existingTripleCount = tripleSummary.existingTriples.length;
  const costReady = atomCost !== null && tripleCost !== null && minDeposit !== null && tripleStatusReady;

  const totalEstimate = useMemo(() => {
    if (!costReady || !atomCost || !tripleCost || !minDeposit) return null;

    const newAtomTotal = atomCost * BigInt(atomSummary.newAtoms.length);
    const newTripleTotal = (tripleCost + minDeposit) * BigInt(tripleSummary.newTriples.length);
    const stanceTotal = stanceRequired
      ? (tripleCost + minDeposit) * BigInt(draftPosts.length)
      : 0n;
    const nestedTotal = (tripleCost + minDeposit) * BigInt(nestedCount);
    const existingDepositTotal = minDeposit * BigInt(existingTripleCount);

    return newAtomTotal + newTripleTotal + stanceTotal + nestedTotal + existingDepositTotal;
  }, [costReady, atomCost, tripleCost, minDeposit, atomSummary.newAtoms.length, tripleSummary.newTriples.length, stanceRequired, draftPosts.length, nestedCount, existingTripleCount]);

  // ── Global summary line ─────────────────────────────────────────
  const summaryParts: string[] = [];
  if (draftPosts.length > 0) summaryParts.push(`${draftPosts.length} post${draftPosts.length > 1 ? "s" : ""}`);
  if (approvedProposals.length > 0) summaryParts.push(`${approvedProposals.length} claim${approvedProposals.length > 1 ? "s" : ""}`);
  if (nestedCount > 0) summaryParts.push(`${nestedCount} context`);
  if (totalEstimate !== null && totalEstimate > 0n) {
    summaryParts.push(`~${formatCost(totalEstimate)} ${currencySymbol}`);
  } else if (!costReady && approvedProposals.length > 0) {
    summaryParts.push("estimating\u2026");
  }
  const summaryLine = summaryParts.join(" · ");

  // ── Per-draft nested counts ─────────────────────────────────────
  const nestedCountByDraft = useMemo(() => {
    const counts = new Map<string, number>();
    for (const draft of draftPosts) {
      const stableKeys = new Set(
        draft.proposalIds
          .map((pid) => approvedProposals.find((p) => p.id === pid)?.stableKey)
          .filter(Boolean),
      );
      let count = 0;
      for (const edge of visibleNestedProposals) {
        const subjectMatch = edge.subject.type !== "triple" || stableKeys.has(edge.subject.tripleKey);
        const objectMatch = edge.object.type !== "triple" || stableKeys.has(edge.object.tripleKey);
        if (subjectMatch || objectMatch) count++;
      }
      counts.set(draft.id, count);
    }
    return counts;
  }, [draftPosts, approvedProposals, visibleNestedProposals]);

  // ── Checklist items ─────────────────────────────────────────────
  const checks = [
    { ok: walletConnected, label: labels.connectWalletToPublish },
    { ok: correctChain, label: labels.wrongNetworkWarning },
    { ok: !contextDirty, label: labels.contentChangedWarning },
  ];
  const allChecksOk = checks.every((c) => c.ok);

  // ── CTA logic ───────────────────────────────────────────────────
  let ctaLabel: string;
  let ctaDisabled = false;
  let ctaAction: () => void;

  if (!walletConnected) {
    ctaLabel = "Connect wallet";
    ctaAction = onConnect;
  } else if (!correctChain) {
    ctaLabel = labels.switchNetworkButton;
    ctaAction = onSwitchChain ?? (() => {});
  } else if (contextDirty) {
    ctaLabel = "Content changed — go back";
    ctaAction = onBack;
  } else if (approvedTripleStatus === "checking") {
    ctaLabel = "Resolving\u2026";
    ctaDisabled = true;
    ctaAction = () => {};
  } else {
    ctaLabel = draftPosts.length > 1
      ? `Publish ${draftPosts.length} posts`
      : "Publish";
    ctaDisabled = approvedProposals.length === 0 || !approvedProposals.some((p) => p.role === "MAIN");
    ctaAction = onPublish;
  }

  // ═══════════════════════════════════════════════════════════════════
  // PUBLISHING STATE
  // ═══════════════════════════════════════════════════════════════════
  if (viewState === "publishing") {
    return (
      <div className={styles.stepContent}>
        <div className={styles.publishingState}>
          <p className={styles.publishingTitle}>{labels.publishingStatus}</p>
          <div className={styles.publishingBar} />
          <p className={styles.publishingHint}>{labels.costHint}</p>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════
  // SUCCESS STATE
  // ═══════════════════════════════════════════════════════════════════
  if (viewState === "success") {
    const isSingle = publishedPosts.length === 1;
    return (
      <div className={styles.stepContent}>
        <div className={styles.successState}>
          <p className={styles.successIcon}>&#10003;</p>
          <p className={styles.successTitle}>Published!</p>
          <p className={styles.successBody}>
            {isSingle ? labels.successBodySingle : labels.successBody}
          </p>
          {publishedPosts[0] && (
            <Link href={`/posts/${publishedPosts[0].id}`} className={styles.successLink}>
              View post &rarr;
            </Link>
          )}
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════
  // ERROR STATE
  // ═══════════════════════════════════════════════════════════════════
  if (viewState === "error") {
    return (
      <div className={styles.stepContent}>
        <div className={styles.errorState}>
          <p className={styles.errorIcon}>&#9888;</p>
          <p className={styles.errorTitle}>Publication failed</p>
          <p className={styles.errorMessage}>{publishError}</p>
          <div className={styles.errorActions}>
            <Button variant="primary" size="sm" onClick={onPublish}>
              Try again
            </Button>
            <Button variant="outline" size="sm" onClick={onBack}>
              &larr; Back
            </Button>
          </div>
        </div>

        {/* Protocol details for debugging */}
        <ProtocolDetails
          approvedProposals={approvedProposals}
          approvedTripleStatus={approvedTripleStatus}
          atomSummary={atomSummary}
          tripleSummary={tripleSummary}
          nestedCount={nestedCount}
          visibleNestedProposals={visibleNestedProposals}
          nestedRefLabels={nestedRefLabels}
          existingTripleCount={existingTripleCount}
          existingTripleMetrics={existingTripleMetrics}
          existingTripleId={existingTripleId}
          tripleExists={tripleExists}
          minDeposit={minDeposit}
          atomCost={atomCost}
          tripleCost={tripleCost}
          costReady={costReady}
          totalEstimate={totalEstimate}
          stanceRequired={stanceRequired}
          draftPostCount={draftPosts.length}
          tripleStatusReady={tripleStatusReady}
          currencySymbol={currencySymbol}
        />
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════
  // PREVIEW STATE (default)
  // ═══════════════════════════════════════════════════════════════════
  return (
    <div className={styles.stepContent}>
      {/* Global summary */}
      {approvedProposals.length > 0 && (
        <p className={styles.globalSummary}>{summaryLine}</p>
      )}

      {/* Per-post preview cards */}
      {draftPosts.map((draft, i) => (
        <PreviewCard
          key={draft.id}
          draft={draft}
          draftIndex={i}
          totalDrafts={draftPosts.length}
          proposals={approvedProposals}
          approvedTripleStatuses={approvedTripleStatuses}
          nestedCount={nestedCountByDraft.get(draft.id) ?? 0}
          minDeposit={minDeposit}
          atomCost={atomCost}
          tripleCost={tripleCost}
          tripleStatusReady={tripleStatusReady}
          currencySymbol={currencySymbol}
          stanceRequired={stanceRequired}
        />
      ))}

      {approvedProposals.length === 0 && (
        <p className={styles.emptyPlan}>{labels.emptyPlan}</p>
      )}

      {/* Resolution / deposit notices */}
      {approvedTripleStatus === "error" && approvedTripleStatusError && (
        <div className={styles.tripleNotice}>
          <p className={styles.noticeError}>{approvedTripleStatusError}</p>
        </div>
      )}
      {existingTripleStatus === "error" && existingTripleError && (
        <div className={styles.tripleNotice}>
          <p className={styles.noticeError}>{existingTripleError}</p>
        </div>
      )}
      {depositState.status === "confirmed" && (
        <div className={styles.tripleNotice}>
          <p className={styles.noticeSuccess}>
            {labels.depositsConfirmed}
            {tripleStatusReady && existingTripleCount > 0
              ? ` for ${existingTripleCount} ${labels.stepTriples.toLowerCase()}`
              : ""}
            .
          </p>
        </div>
      )}
      {depositState.status === "failed" && (
        <div className={styles.tripleNotice}>
          <p className={styles.noticeError}>{depositState.error}</p>
        </div>
      )}

      {/* Protocol details (collapsed) */}
      {approvedProposals.length > 0 && (
        <ProtocolDetails
          approvedProposals={approvedProposals}
          approvedTripleStatus={approvedTripleStatus}
          atomSummary={atomSummary}
          tripleSummary={tripleSummary}
          nestedCount={nestedCount}
          visibleNestedProposals={visibleNestedProposals}
          nestedRefLabels={nestedRefLabels}
          existingTripleCount={existingTripleCount}
          existingTripleMetrics={existingTripleMetrics}
          existingTripleId={existingTripleId}
          tripleExists={tripleExists}
          minDeposit={minDeposit}
          atomCost={atomCost}
          tripleCost={tripleCost}
          costReady={costReady}
          totalEstimate={totalEstimate}
          stanceRequired={stanceRequired}
          draftPostCount={draftPosts.length}
          tripleStatusReady={tripleStatusReady}
          currencySymbol={currencySymbol}
        />
      )}

      {/* Checklist (shown only when not all green) */}
      {!allChecksOk && (
        <div className={styles.checklist}>
          {checks.map((check, i) => (
            <div key={i} className={styles.checkItem}>
              <span className={styles.checkIcon} data-ok={check.ok}>
                {check.ok ? "\u2713" : "\u2717"}
              </span>
              <span>{check.ok
                ? (i === 0 ? "Wallet connected" : i === 1 ? "Correct network" : "Content up to date")
                : check.label}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Actions: Back + single CTA */}
      <div className={styles.actions}>
        <Button size="sm" variant="outline" onClick={onBack}>
          &larr; Back
        </Button>
        <Button variant="primary" onClick={ctaAction} disabled={ctaDisabled}>
          {ctaLabel}
        </Button>
      </div>
    </div>
  );
}

// ─── Protocol Details (collapsed <details>) ──────────────────────────────────

type ProtocolDetailsProps = {
  approvedProposals: ApprovedProposalWithRole[];
  approvedTripleStatus: ApprovedTripleStatusState;
  atomSummary: { newAtoms: { label: string }[]; existingAtoms: { label: string }[] };
  tripleSummary: { newTriples: { proposal: ApprovedProposalWithRole; tripleTermId: string | null }[]; existingTriples: { proposal: ApprovedProposalWithRole; tripleTermId: string | null }[] };
  nestedCount: number;
  visibleNestedProposals: NestedProposalDraft[];
  nestedRefLabels: Map<string, string>;
  existingTripleCount: number;
  existingTripleMetrics: ExistingTripleMetrics;
  existingTripleId: string | null;
  tripleExists: boolean;
  minDeposit: bigint | null;
  atomCost: bigint | null;
  tripleCost: bigint | null;
  costReady: boolean;
  totalEstimate: bigint | null;
  stanceRequired: boolean;
  draftPostCount: number;
  tripleStatusReady: boolean;
  currencySymbol: string;
};

function ProtocolDetails({
  approvedTripleStatus,
  atomSummary,
  tripleSummary,
  nestedCount,
  visibleNestedProposals,
  nestedRefLabels,
  existingTripleCount,
  existingTripleMetrics,
  existingTripleId,
  tripleExists,
  minDeposit,
  atomCost,
  tripleCost,
  costReady,
  totalEstimate,
  stanceRequired,
  draftPostCount,
  tripleStatusReady: _tripleStatusReady,
  currencySymbol,
}: ProtocolDetailsProps) {
  return (
    <details className={styles.protocolDetails}>
      <summary className={styles.protocolSummary}>{labels.protocolDetailsLabel}</summary>
      <div className={styles.protocolContent}>

        {/* ── New section ─────────────────────────────── */}
        {(atomSummary.newAtoms.length > 0 || tripleSummary.newTriples.length > 0 || nestedCount > 0) && (
          <div className={styles.pdSection}>
            <p className={styles.pdSectionTitle}>New</p>

            {atomSummary.newAtoms.length > 0 && (
              <div className={styles.pdRow}>
                <span className={styles.pdRowLabel}>{labels.stepAtoms}</span>
                <span className={styles.pdChips}>
                  {atomSummary.newAtoms.map((a, i) => (
                    <span key={i} className={styles.pdChip}>{a.label}</span>
                  ))}
                </span>
              </div>
            )}

            {tripleSummary.newTriples.length > 0 && (
              <div className={styles.pdRow}>
                <span className={styles.pdRowLabel}>{labels.stepTriples}</span>
                <div className={styles.pdTripleList}>
                  {tripleSummary.newTriples.map((t) => (
                    <TripleInline key={t.proposal.id} subject={t.proposal.sText} predicate={t.proposal.pText} object={t.proposal.oText} />
                  ))}
                </div>
              </div>
            )}

            {nestedCount > 0 && (
              <div className={styles.pdRow}>
                <span className={styles.pdRowLabel}>{labels.nestedStepLabel}</span>
                <div className={styles.pdTripleList}>
                  {visibleNestedProposals.map((edge) => (
                    <TripleInline key={edge.id} subject={renderNestedRef(edge.subject, nestedRefLabels)} predicate={edge.predicate} object={renderNestedRef(edge.object, nestedRefLabels)} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Reuse section ───────────────────────────── */}
        {tripleSummary.existingTriples.length > 0 && (
          <div className={styles.pdSection}>
            <p className={styles.pdSectionTitle}>Reuse</p>
            <div className={styles.pdRow}>
              <span className={styles.pdRowLabel}>{labels.stepTriples}</span>
              <div className={styles.pdTripleList}>
                {tripleSummary.existingTriples.map((t) => (
                  <div key={t.proposal.id} className={styles.pdTriple}>
                    <TripleInline subject={t.proposal.sText} predicate={t.proposal.pText} object={t.proposal.oText} />
                    {t.tripleTermId && (
                      <span className={styles.pdId}>{truncateId(t.tripleTermId)}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Resolution status ───────────────────────── */}
        {approvedTripleStatus === "checking" && (
          <p className={styles.pdMuted}>Resolving\u2026</p>
        )}
        {approvedTripleStatus === "error" && (
          <p className={styles.pdError}>Resolution failed</p>
        )}

        {/* ── Existing triple metrics ─────────────────── */}
        {tripleExists && (
          <div className={styles.pdMetrics}>
            <span>{labels.mainTripleOnchain} {truncateId(existingTripleId!)}</span>
            <span>{labels.metricStaked}: {formatMetricValue(existingTripleMetrics.marketCap)} {currencySymbol}</span>
            <span>{labels.metricParticipants}: {existingTripleMetrics.holders ?? "\u2014"}</span>
          </div>
        )}

        {/* ── Fees ────────────────────────────────────── */}
        {(() => {
          const newClaimCount = tripleSummary.newTriples.length
            + (stanceRequired ? draftPostCount : 0)
            + nestedCount;
          const newTermCost = costReady && atomCost ? atomCost * BigInt(atomSummary.newAtoms.length) : null;
          const newClaimCost = costReady && tripleCost && minDeposit ? (tripleCost + minDeposit) * BigInt(newClaimCount) : null;
          const existingCost = costReady && minDeposit ? minDeposit * BigInt(existingTripleCount) : null;

          return (
            <div className={styles.pdFees}>
              {newTermCost !== null && newTermCost > 0n && (
                <span>New terms ({atomSummary.newAtoms.length}) <span className={styles.pdFeeValue}>{formatCost(newTermCost)} {currencySymbol}</span></span>
              )}
              {newClaimCost !== null && newClaimCount > 0 && (
                <span>New claims ({newClaimCount}) <span className={styles.pdFeeValue}>{formatCost(newClaimCost)} {currencySymbol}</span></span>
              )}
              {existingCost !== null && existingTripleCount > 0 && (
                <span>Existing claims ({existingTripleCount}) <span className={styles.pdFeeValue}>{formatCost(existingCost)} {currencySymbol}</span></span>
              )}
              <span>{labels.gasFees} <span className={styles.pdFeeValue}>&lt; 0.01 {currencySymbol}</span></span>
              {totalEstimate !== null && totalEstimate > 0n && (
                <span className={styles.pdFeesTotal}>Total <span className={styles.pdFeeValue}>~{formatCost(totalEstimate)} {currencySymbol}</span></span>
              )}
            </div>
          );
        })()}
      </div>
    </details>
  );
}
