"use client";

import { useMemo, useState } from "react";
import { useConnect } from "wagmi";
import { injected } from "wagmi/connectors";

import { Composer } from "@/app/_components/Composer/Composer";
import { FlowDialog } from "@/app/_components/FlowDialog/FlowDialog";
import { Sheet } from "@/app/_components/Sheet/Sheet";
import { RightPanel } from "@/app/_components/RightPanel/RightPanel";
import { useIsMobile } from "@/app/_components/RightPanel/useIsMobile";
import { VoteSection } from "@/components/SentimentBar/VoteSection";
import { useSentimentBatch } from "@/hooks/useSentimentBatch";
import { TripleInspector } from "@/components/TripleInspector/TripleInspector";
import { useExtractionFlow } from "@/features/post/ExtractionWorkspace/hooks/useExtractionFlow";
import type { Stance } from "@/features/post/ExtractionWorkspace/extractionTypes";
import { useToast } from "@/components/Toast/ToastContext";
import { StepSplitDecision } from "@/features/post/ExtractionWorkspace/steps/StepSplitDecision";
import { StepReview } from "@/features/post/ExtractionWorkspace/steps/StepReview";
import { StepContext } from "@/features/post/ExtractionWorkspace/steps/StepContext";
import { StepSubmit } from "@/features/post/ExtractionWorkspace/steps/StepSubmit";
import { labels } from "@/lib/vocabulary";

import { AncestorBreadcrumbs } from "./AncestorBreadcrumbs";
import { FocusCard } from "./FocusCard";
import { MiniTreeSection } from "./MiniTreeSection";
import { RepliesGrid } from "./RepliesGrid";

import styles from "./page.module.css";
import panelStyles from "@/app/_components/RightPanel/PageWithPanel.module.css";

type ReplyNode = {
  id: string;
  body: string;
  createdAt: string;
  stance: string | null;
  replyCount: number;
  mainTripleTermIds?: string[];
};

type PostPageClientProps = {
  post: {
    id: string;
    body: string;
    createdAt: string;
    tripleLinks: {
      termId: string;
      role: "MAIN" | "SUPPORTING";
    }[];
  };
  theme: {
    slug: string;
    name: string;
  };
  breadcrumbs: {
    id: string;
    body: string;
  }[];
  replies: ReplyNode[];
};

export function PostPageClient({ post, theme, breadcrumbs, replies }: PostPageClientProps) {
  const { addToast } = useToast();
  const { connect } = useConnect();
  const isMobile = useIsMobile();
  const [composerOpen, setComposerOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogStep, setDialogStep] = useState<"split" | "claims" | "context" | "publish">("claims");
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [inspectorTriples, setInspectorTriples] = useState(post.tripleLinks);
  const [treeOpen, setTreeOpen] = useState(false);

  const handlePublishSuccess = (postId: string) => {
    setDialogOpen(false);
    setComposerOpen(false);
    addToast("Reply created", "success", { label: "See", href: `/posts/${postId}` }, 6000);
  };

  const parentMainTripleTermId = post.tripleLinks.find(t => t.role === "MAIN")?.termId ?? null;

  // Batch fetch sentiment data for reply SentimentRings
  const replyTripleIds = useMemo(() =>
    replies.flatMap(r => r.mainTripleTermIds?.[0] ? [r.mainTripleTermIds[0]] : []),
    [replies],
  );
  const { data: sentimentMap } = useSentimentBatch(replyTripleIds);

  const flow = useExtractionFlow({
    themeSlug: theme.slug,
    parentPostId: post.id,
    parentMainTripleTermId,
    onPublishSuccess: handlePublishSuccess,
  });

  function handleReplyClick(stance: Stance) {
    flow.setStance(stance);
    setInspectorOpen(false);
    setComposerOpen(true);
  }

  async function handleExtract() {
    const result = await flow.runExtraction();
    if (result.ok) {
      setDialogStep(result.proposalCount >= 2 ? "split" : "claims");
      setDialogOpen(true);
    }
  }

  function handleOpenInspector() {
    setInspectorTriples(post.tripleLinks);
    setComposerOpen(false);
    setInspectorOpen(true);
  }

  function handleReplyBadgeClick(tripleTermIds: string[]) {
    setInspectorTriples(tripleTermIds.map(id => ({ termId: id, role: "MAIN" as const })));
    setComposerOpen(false);
    setInspectorOpen(true);
  }

  const supportReplies = replies.filter((r) => r.stance?.toUpperCase() === "SUPPORTS");
  const refuteReplies = replies.filter((r) => r.stance?.toUpperCase() === "REFUTES");

  const treeReplies = useMemo(
    () => [
      ...supportReplies.map((r) => ({ id: r.id, body: r.body, stance: "SUPPORTS" as const })),
      ...refuteReplies.map((r) => ({ id: r.id, body: r.body, stance: "REFUTES" as const })),
    ],
    [supportReplies, refuteReplies],
  );

  const inspectorKey = inspectorTriples.map(t => t.termId).join(",");
  const inspectorContent = inspectorTriples.length > 0 ? (
    <TripleInspector
      key={inspectorKey}
      triples={inspectorTriples}
      defaultTripleTermId={inspectorTriples[0]?.termId ?? null}
    />
  ) : null;

  return (
    <div className={`${panelStyles.wrapper} ${inspectorOpen ? panelStyles.wrapperOpen : ""}`}>
      <div className={panelStyles.content}>
        <div className={styles.page}>
          <AncestorBreadcrumbs breadcrumbs={breadcrumbs} />

          <FocusCard
            post={post}
            themeName={theme.name}
            totalReplies={replies.length}
            supportCount={supportReplies.length}
            refuteCount={refuteReplies.length}
            onOpenInspector={handleOpenInspector}
          >
            {parentMainTripleTermId && (
              <VoteSection tripleTermId={parentMainTripleTermId} />
            )}
          </FocusCard>

          <MiniTreeSection
            open={treeOpen}
            onToggle={() => setTreeOpen(!treeOpen)}
            breadcrumbs={breadcrumbs}
            focusNode={{ id: post.id, body: post.body }}
            replies={treeReplies}
          />

          {composerOpen && (
            <section className={styles.composerSection}>
              <Composer
                stance={flow.stance}
                inputText={flow.inputText}
                busy={flow.busy}
                walletConnected={flow.walletConnected}
                extracting={flow.isExtracting}
                contextDirty={flow.contextDirty}
                message={flow.message}
                status={flow.extractionJob?.status}
                onInputChange={flow.setInputText}
                onExtract={handleExtract}
                onClose={() => setComposerOpen(false)}
              />
            </section>
          )}

          <RepliesGrid
            supportReplies={supportReplies}
            refuteReplies={refuteReplies}
            onReply={handleReplyClick}
            onBadgeClick={handleReplyBadgeClick}
            sentimentMap={sentimentMap}
          />
        </div>
      </div>

      {/* Extraction flow dialog */}
      <FlowDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={
          dialogStep === "split" ? labels.dialogSplitDecision
          : dialogStep === "claims" ? labels.dialogStepClaimsReview
          : dialogStep === "context" ? labels.dialogStepContext
          : labels.dialogStepPreview
        }
        totalSteps={3}
        activeStep={
          dialogStep === "split" ? null
          : dialogStep === "claims" ? 1
          : dialogStep === "context" ? 2
          : 3
        }
        helpText={
          dialogStep === "claims" ? labels.reviewIntroBody
          : dialogStep === "context" ? labels.contextIntroBody
          : dialogStep === "publish" ? labels.previewIntroBody
          : null
        }
      >
        {dialogStep === "split" && (
          <StepSplitDecision
            proposalCount={flow.proposalItems.length}
            onSplit={() => {
              flow.draftActions.onSplit();
              setDialogStep("claims");
            }}
            onKeepAsOne={() => setDialogStep("claims")}
          />
        )}
        {dialogStep === "claims" && (
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
            onNext={() => setDialogStep("context")}
            onBack={() => setDialogOpen(false)}
            draftPosts={flow.draftPosts}
            isSplit={flow.isSplit}
            draftActions={flow.draftActions}
            extractedInputText={flow.extractedInputText}
            stanceRequired={flow.stanceRequired}
          />
        )}
        {dialogStep === "context" && (
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
            onNext={() => setDialogStep("publish")}
            onBack={() => setDialogStep("claims")}
          />
        )}
        {dialogStep === "publish" && (
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
            onBack={() => setDialogStep("context")}
            draftPosts={flow.draftPosts}
            stanceRequired={flow.stanceRequired}
            visibleNestedProposals={flow.visibleNestedProposals}
            nestedRefLabels={flow.nestedRefLabels}
          />
        )}
      </FlowDialog>

      {/* Right panel (desktop) — Inspector only */}
      {!isMobile && (
        <div className={panelStyles.panelSlot}>
          {inspectorOpen && inspectorTriples.length > 0 && (
            <RightPanel
              open
              title="Protocol Inspector"
              onClose={() => setInspectorOpen(false)}
            >
              {inspectorContent}
            </RightPanel>
          )}
        </div>
      )}

      {/* Mobile: Sheet for Inspector */}
      {isMobile && (
        <Sheet
          open={inspectorOpen && inspectorTriples.length > 0}
          onOpenChange={setInspectorOpen}
          title="Protocol Inspector"
        >
          {inspectorContent}
        </Sheet>
      )}
    </div>
  );
}
