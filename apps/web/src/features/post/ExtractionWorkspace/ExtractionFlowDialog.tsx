"use client";

import { useConnect } from "wagmi";
import { injected } from "wagmi/connectors";

import { FlowDialog } from "@/app/_components/FlowDialog/FlowDialog";
import { labels } from "@/lib/vocabulary";

import type { UseExtractionFlowResult } from "./hooks/useExtractionFlow";
import { StepSplitDecision } from "./steps/StepSplitDecision";
import { StepReview } from "./steps/StepReview";
import { StepContext } from "./steps/StepContext";
import { StepSubmit } from "./steps/StepSubmit";

/* ── Types ───────────────────────────────────────────────────────────── */

export type DialogStep = "split" | "claims" | "context" | "publish";

type Props = {
  flow: UseExtractionFlowResult;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  step: DialogStep;
  onStepChange: (step: DialogStep) => void;
};

/* ── Step metadata ───────────────────────────────────────────────────── */

const STEP_META: Record<DialogStep, { title: string; activeStep: number | null; helpText: string | null }> = {
  split:   { title: labels.dialogSplitDecision,   activeStep: null, helpText: null },
  claims:  { title: labels.dialogStepClaimsReview, activeStep: 1,    helpText: labels.reviewIntroBody },
  context: { title: labels.dialogStepContext,      activeStep: 2,    helpText: labels.contextIntroBody },
  publish: { title: labels.dialogStepPreview,      activeStep: 3,    helpText: labels.previewIntroBody },
};

/* ── Component ───────────────────────────────────────────────────────── */

export function ExtractionFlowDialog({ flow, open, onOpenChange, step, onStepChange }: Props) {
  const { connect } = useConnect();
  const meta = STEP_META[step];

  return (
    <FlowDialog
      open={open}
      onOpenChange={onOpenChange}
      title={meta.title}
      totalSteps={3}
      activeStep={meta.activeStep}
      helpText={meta.helpText}
    >
      {step === "split" && (
        <StepSplitDecision
          proposalCount={flow.proposalItems.length}
          onSplit={() => {
            flow.draftActions.onSplit();
            onStepChange("claims");
          }}
          onKeepAsOne={() => onStepChange("claims")}
        />
      )}
      {step === "claims" && (
        <StepReview
          extractionJob={flow.extractionJob}
          proposalItems={flow.proposalItems}
          nestedProposals={flow.visibleNestedProposals}
          nestedRefLabels={flow.nestedRefLabels}
          approvedProposals={flow.approvedProposals}
          tripleSuggestionsByProposal={flow.tripleSuggestionsByProposal}
          walletConnected={flow.walletConnected}
          busy={flow.busy}
          canAdvance={flow.canAdvanceToSubmit}
          actions={flow.proposalActions}
          onNext={() => onStepChange("context")}
          onBack={() => onOpenChange(false)}
          draftPosts={flow.draftPosts}
          isSplit={flow.isSplit}
          draftActions={flow.draftActions}
          extractedInputText={flow.extractedInputText}
          stanceRequired={flow.stanceRequired}
        />
      )}
      {step === "context" && (
        <StepContext
          draftPosts={flow.draftPosts}
          proposalItems={flow.proposalItems}
          displayNestedProposals={flow.displayNestedProposals}
          nestedRefLabels={flow.nestedRefLabels}
          nestedActions={flow.nestedActions}
          proposalActions={flow.proposalActions}
          draftActions={flow.draftActions}
          tripleSuggestionsByProposal={flow.tripleSuggestionsByProposal}
          isSplit={flow.isSplit}
          busy={flow.busy}
          walletConnected={flow.walletConnected}
          onNext={() => onStepChange("publish")}
          onBack={() => onStepChange("claims")}
        />
      )}
      {step === "publish" && (
        <StepSubmit
          approvedProposals={flow.approvedProposals}
          approvedTripleStatuses={flow.approvedTripleStatuses}
          approvedTripleStatus={flow.approvedTripleStatus}
          approvedTripleStatusError={flow.approvedTripleStatusError}
          minDeposit={flow.minDeposit}
          atomCost={flow.atomCost}
          tripleCost={flow.tripleCost}
          existingTripleId={flow.existingTripleId}
          existingTripleStatus={flow.existingTripleStatus}
          existingTripleError={flow.existingTripleError}
          existingTripleMetrics={flow.existingTripleMetrics}
          depositState={flow.depositState}
          txPlan={flow.txPlan}
          publishedPosts={flow.publishedPosts}
          isPublishing={flow.isPublishing}
          publishError={flow.publishError}
          contextDirty={flow.contextDirty}
          walletConnected={flow.walletConnected}
          correctChain={flow.correctChain}
          onPublish={flow.publishOnchain}
          onConnect={() => connect({ connector: injected() })}
          onSwitchChain={flow.switchToCorrectChain}
          onBack={() => onStepChange("context")}
          draftPosts={flow.draftPosts}
          stanceRequired={flow.stanceRequired}
          visibleNestedProposals={flow.visibleNestedProposals}
          nestedRefLabels={flow.nestedRefLabels}
        />
      )}
    </FlowDialog>
  );
}
