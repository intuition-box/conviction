"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useConnect } from "wagmi";
import { injected } from "wagmi/connectors";

import { TrendingScroll } from "@/app/_components/TrendingScroll/TrendingScroll";
import { FeedThread, type ReplyTarget } from "@/app/_components/FeedPost/FeedThread";
import { HomeSidebar } from "@/app/_components/HomeSidebar/HomeSidebar";
import { RightPanel } from "@/app/_components/RightPanel/RightPanel";
import { Sheet } from "@/app/_components/Sheet/Sheet";
import { useIsMobile } from "@/app/_components/RightPanel/useIsMobile";
import { TripleInspector } from "@/components/TripleInspector/TripleInspector";
import { Composer } from "@/app/_components/Composer/Composer";
import { FlowDialog } from "@/app/_components/FlowDialog/FlowDialog";
import { useExtractionFlow } from "@/features/post/ExtractionWorkspace/hooks/useExtractionFlow";
import { StepSplitDecision } from "@/features/post/ExtractionWorkspace/steps/StepSplitDecision";
import { StepReview } from "@/features/post/ExtractionWorkspace/steps/StepReview";
import { StepContext } from "@/features/post/ExtractionWorkspace/steps/StepContext";
import { StepSubmit } from "@/features/post/ExtractionWorkspace/steps/StepSubmit";
import { useToast } from "@/components/Toast/ToastContext";
import { useSentimentBatch } from "@/hooks/useSentimentBatch";
import { labels } from "@/lib/vocabulary";

import styles from "./page.module.css";

/* ── Types (exported for sub-components) ─────────────────────────────── */

export type TrendingPost = {
  id: string;
  body: string;
  theme: { slug: string; name: string };
  replyCount: number;
};

export type FeedReplyPreview = {
  id: string;
  body: string;
  createdAt: string;
  user: { displayName: string | null; address: string; avatar: string | null };
  stance: "SUPPORTS" | "REFUTES" | null;
  mainTripleTermIds?: string[];
  replyCount: number;
  subReplies?: FeedReplyPreview[];
};

export type FeedPostData = {
  id: string;
  body: string;
  createdAt: string;
  user: { displayName: string | null; address: string; avatar: string | null };
  replyCount: number;
  theme: { slug: string; name: string };
  mainTripleTermIds?: string[];
  replyPreviews: FeedReplyPreview[];
};

export type HotTopic = {
  id: string;
  body: string;
  replyCount: number;
};

export type ThemeSummary = {
  slug: string;
  name: string;
  postCount: number;
};

export type LoadMoreRepliesFn = (
  postId: string,
  offset: number,
) => Promise<{ replies: FeedReplyPreview[]; hasMore: boolean }>;

type HomePageClientProps = {
  trending: TrendingPost[];
  feed: FeedPostData[];
  hotTopics: HotTopic[];
  themes: ThemeSummary[];
  loadMoreReplies: LoadMoreRepliesFn;
};

/* ── Inline Composer (isolated to re-mount via key) ──────────────────── */

function InlineComposer({
  target,
  onClose,
  onPublishSuccess,
}: {
  target: ReplyTarget;
  onClose: () => void;
  onPublishSuccess: (postId: string) => void;
}) {
  const { connect } = useConnect();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogStep, setDialogStep] = useState<"split" | "claims" | "context" | "publish">("claims");

  const flow = useExtractionFlow({
    themeSlug: target.themeSlug,
    parentPostId: target.postId,
    parentMainTripleTermId: target.mainTripleTermId,
    onPublishSuccess,
  });

  async function handleExtract() {
    const result = await flow.runExtraction();
    if (result.ok) {
      setDialogStep(result.proposalCount >= 2 ? "split" : "claims");
      setDialogOpen(true);
    }
  }

  return (
    <>
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
        onClose={onClose}
        onStanceChange={flow.setStance}
      />

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
    </>
  );
}

/* ── Home Page Component ─────────────────────────────────────────────── */

export function HomePageClient({ trending, feed, hotTopics, themes, loadMoreReplies }: HomePageClientProps) {
  const router = useRouter();
  const { addToast } = useToast();
  const isMobile = useIsMobile();

  // Inspector state
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [inspectorTriples, setInspectorTriples] = useState<{ termId: string; role: "MAIN" }[]>([]);

  // Sentiment data: collect all tripleIds from feed + track extra from "show more"
  const [extraTripleIds, setExtraTripleIds] = useState<string[]>([]);
  const feedTripleIds = useMemo(() => {
    const ids: string[] = [];
    for (const post of feed) {
      if (post.mainTripleTermIds?.[0]) ids.push(post.mainTripleTermIds[0]);
      for (const reply of post.replyPreviews) {
        if (reply.mainTripleTermIds?.[0]) ids.push(reply.mainTripleTermIds[0]);
        for (const sub of reply.subReplies ?? []) {
          if (sub.mainTripleTermIds?.[0]) ids.push(sub.mainTripleTermIds[0]);
        }
      }
    }
    return ids;
  }, [feed]);
  const allTripleIds = useMemo(
    () => [...feedTripleIds, ...extraTripleIds],
    [feedTripleIds, extraTripleIds],
  );
  const { data: sentimentMap } = useSentimentBatch(allTripleIds);

  // Reply state: replyTarget opens the Composer directly (stance chosen inside)
  const [replyTarget, setReplyTarget] = useState<ReplyTarget | null>(null);

  function handleBadgeClick(tripleTermIds: string[]) {
    setInspectorTriples(tripleTermIds.map((id) => ({ termId: id, role: "MAIN" as const })));
    setReplyTarget(null);
    setInspectorOpen(true);
  }

  function handleReply(target: ReplyTarget) {
    setInspectorOpen(false);
    setReplyTarget(target);
  }

  function handlePublishSuccess(postId: string) {
    setReplyTarget(null);
    addToast("Reply created", "success", { label: "See", href: `/posts/${postId}` }, 6000);
    router.refresh();
  }

  /** Render composer slot right after the matching postId */
  function composerSlot(postId: string) {
    if (!replyTarget || replyTarget.postId !== postId) return null;
    return (
      <div className={styles.inlineComposer}>
        <InlineComposer
          key={postId}
          target={replyTarget}
          onClose={() => setReplyTarget(null)}
          onPublishSuccess={handlePublishSuccess}
        />
      </div>
    );
  }

  const inspectorKey = inspectorTriples.map((t) => t.termId).join(",");
  const inspectorContent = inspectorTriples.length > 0 ? (
    <TripleInspector
      key={inspectorKey}
      triples={inspectorTriples}
      defaultTripleTermId={inspectorTriples[0]?.termId ?? null}
    />
  ) : null;

  return (
    <div className={styles.pageWrapper}>
      <div className={styles.page}>
        <div className={styles.feedColumn}>
          <TrendingScroll posts={trending} />

          <div className={styles.feedList}>
            {feed.length === 0 ? (
              <p className={styles.empty}>No posts yet. Start a debate!</p>
            ) : (
              feed.map((post) => (
                <FeedThread
                  key={post.id}
                  post={post}
                  onBadgeClick={handleBadgeClick}
                  onReply={handleReply}
                  composerSlot={composerSlot}
                  loadMoreReplies={loadMoreReplies}
                  sentimentMap={sentimentMap}
                  onNewTripleIds={(ids) => setExtraTripleIds((prev) => [...prev, ...ids])}
                />
              ))
            )}
          </div>
        </div>

        <HomeSidebar hotTopics={hotTopics} themes={themes} />
      </div>

      {/* Desktop inspector — overlays the sidebar */}
      {!isMobile && inspectorOpen && inspectorTriples.length > 0 && (
        <div className={styles.inspectorOverlay}>
          <RightPanel
            open
            title="Protocol Inspector"
            onClose={() => setInspectorOpen(false)}
          >
            {inspectorContent}
          </RightPanel>
        </div>
      )}

      {/* Mobile inspector sheet */}
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
