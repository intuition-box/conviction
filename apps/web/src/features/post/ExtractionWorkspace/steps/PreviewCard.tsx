"use client";

import { formatEther } from "viem";

import { RoleBadge } from "@/components/RoleBadge/RoleBadge";
import { TripleInline } from "@/components/TripleInline/TripleInline";
import { labels } from "@/lib/vocabulary";

function formatCost(wei: bigint): string {
  const num = parseFloat(formatEther(wei));
  if (num === 0) return "0";
  if (num < 0.0001) return "< 0.0001";
  return num.toFixed(4).replace(/\.?0+$/, "");
}

import type {
  ApprovedProposalWithRole,
  ApprovedTripleStatus,
  DraftPost,
} from "../extractionTypes";
import styles from "./PreviewCard.module.css";

type PreviewCardProps = {
  draft: DraftPost;
  draftIndex: number;
  totalDrafts: number;
  proposals: ApprovedProposalWithRole[];
  approvedTripleStatuses: ApprovedTripleStatus[];
  nestedCount: number;
  minDeposit: bigint | null;
  atomCost: bigint | null;
  tripleCost: bigint | null;
  tripleStatusReady: boolean;
  currencySymbol: string;
  stanceRequired: boolean;
};

export function PreviewCard({
  draft,
  draftIndex,
  totalDrafts,
  proposals,
  approvedTripleStatuses,
  nestedCount,
  minDeposit,
  atomCost,
  tripleCost,
  tripleStatusReady,
  currencySymbol,
  stanceRequired,
}: PreviewCardProps) {
  const draftProposals = proposals.filter((p) =>
    draft.proposalIds.includes(p.id) && p.status === "approved",
  );
  const mainProposals = draftProposals.filter((p) => p.id === draft.mainProposalId);
  const supportingProposals = draftProposals.filter((p) => p.id !== draft.mainProposalId);

  // Cost: new atoms + new triples + existing deposits
  const newAtomLabels = new Set<string>();
  for (const p of draftProposals) {
    if (!p.subjectAtomId) newAtomLabels.add(p.sText);
    if (!p.predicateAtomId) newAtomLabels.add(p.pText);
    if (!p.objectAtomId) newAtomLabels.add(p.oText);
  }

  const existingCount = draftProposals.filter((p) => {
    const status = approvedTripleStatuses.find((s) => s.proposalId === p.id);
    return status?.isExisting;
  }).length;
  const newTripleCount = draftProposals.length - existingCount;

  const costReady = atomCost !== null && tripleCost !== null && minDeposit !== null;
  const draftCost = costReady
    ? atomCost * BigInt(newAtomLabels.size)
      + (tripleCost + minDeposit) * BigInt(newTripleCount)
      + minDeposit * BigInt(existingCount)
    : null;

  return (
    <div className={styles.card} data-stance={draft.stance ?? undefined}>
      {/* Header: shown only for multi-post or when stance required */}
      {(totalDrafts > 1 || stanceRequired) && (
        <div className={styles.header}>
          {totalDrafts > 1 && (
            <span className={styles.headerTitle}>
              {labels.draftHeaderPrefix} {draftIndex + 1}
            </span>
          )}
          {stanceRequired && draft.stance && (
            <span className={styles.stanceBadge} data-stance={draft.stance}>
              {draft.stance === "SUPPORTS" ? labels.stanceSupports : labels.stanceRefutes}
            </span>
          )}
        </div>
      )}

      {/* Body */}
      {draft.body ? (
        <p className={styles.body}>{draft.body}</p>
      ) : (
        <p className={styles.bodyMuted}>No body</p>
      )}

      {/* Claims */}
      <div className={styles.claimsSection}>
        {mainProposals.map((p) => (
          <ClaimRow key={p.id} proposal={p} role="MAIN" />
        ))}
        {supportingProposals.map((p) => (
          <ClaimRow key={p.id} proposal={p} role="SUPPORTING" />
        ))}
      </div>

      {/* Footer: context + cost */}
      {(nestedCount > 0 || draftCost !== null) && (
        <div className={styles.footer}>
          <span>
            {nestedCount > 0
              ? `${nestedCount} context link${nestedCount > 1 ? "s" : ""}`
              : ""}
          </span>
          <span>
            {tripleStatusReady && draftCost !== null && draftCost > 0n
              ? `~${formatCost(draftCost)} ${currencySymbol}`
              : ""}
          </span>
        </div>
      )}
    </div>
  );
}

function ClaimRow({ proposal, role }: { proposal: ApprovedProposalWithRole; role: "MAIN" | "SUPPORTING" }) {
  return (
    <div className={styles.claimRow}>
      <RoleBadge role={role} starred={role === "MAIN"} />
      <TripleInline subject={proposal.sText} predicate={proposal.pText} object={proposal.oText} />
    </div>
  );
}
