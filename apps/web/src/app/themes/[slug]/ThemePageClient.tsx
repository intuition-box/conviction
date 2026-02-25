"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { MessageSquare } from "lucide-react";
import { useConnect } from "wagmi";
import { injected } from "wagmi/connectors";

import { Button } from "@/components/Button/Button";
import { Composer } from "@/app/_components/Composer/Composer";
import { FlowDialog } from "@/app/_components/FlowDialog/FlowDialog";
import { useExtractionFlow } from "@/features/post/ExtractionWorkspace/hooks/useExtractionFlow";
import { useToast } from "@/components/Toast/ToastContext";
import { TripleTooltip } from "@/components/TripleTooltip/TripleTooltip";
import { StepSplitDecision } from "@/features/post/ExtractionWorkspace/steps/StepSplitDecision";
import { StepReview } from "@/features/post/ExtractionWorkspace/steps/StepReview";
import { StepContext } from "@/features/post/ExtractionWorkspace/steps/StepContext";
import { StepSubmit } from "@/features/post/ExtractionWorkspace/steps/StepSubmit";
import { labels } from "@/lib/vocabulary";

import styles from "./page.module.css";

type ThemePageClientProps = {
  theme: {
    slug: string;
    name: string;
  };
  rootPosts: {
    id: string;
    body: string;
    createdAt: string;
    replyCount: number;
    mainTripleTermIds: string[];
  }[];
};

export function ThemePageClient({ theme, rootPosts }: ThemePageClientProps) {
  const { addToast } = useToast();
  const { connect } = useConnect();
  const [searchQuery, setSearchQuery] = useState("");
  const [composerOpen, setComposerOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogStep, setDialogStep] = useState<"split" | "claims" | "context" | "publish">("claims");

  const handlePublishSuccess = (postId: string) => {
    setDialogOpen(false);
    setComposerOpen(false);
    addToast("Debate created", "success", { label: "See", href: `/posts/${postId}` }, 6000);
  };

  const flow = useExtractionFlow({
    themeSlug: theme.slug,
    parentPostId: null,
    onPublishSuccess: handlePublishSuccess,
  });

  async function handleExtract() {
    const result = await flow.runExtraction();
    if (result.ok) {
      setDialogStep(result.proposalCount >= 2 ? "split" : "claims");
      setDialogOpen(true);
    }
  }

  const filteredPosts = useMemo(() => {
    if (!searchQuery.trim()) return rootPosts;
    const q = searchQuery.toLowerCase();
    return rootPosts.filter((p) => p.body.toLowerCase().includes(q));
  }, [rootPosts, searchQuery]);

  return (
    <div className={styles.page}>
      {/* Header */}
      <section className={styles.header}>
        <div className={styles.headerTop}>
          <div>
            <p className={styles.kicker}>Theme</p>
            <h1 className={styles.title}>{theme.name}</h1>
          </div>
          {flow.walletConnected && (
            <Button variant="primary" onClick={() => setComposerOpen(true)}>
              New debate
            </Button>
          )}
        </div>

        <div className={styles.searchBar}>
          <input
            type="search"
            placeholder="Search debates..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={styles.searchInput}
            aria-label="Search debates"
          />
        </div>
      </section>

      {/* Composer inline */}
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

      {/* Posts grid */}
      <section className={styles.postsSection}>
        {filteredPosts.length === 0 ? (
          <div className={styles.emptyState}>
            <p className={styles.emptyText}>
              {searchQuery ? "No debates match your search." : "No debates yet in this theme."}
            </p>
            {!searchQuery && flow.walletConnected && (
              <Button variant="secondary" onClick={() => setComposerOpen(true)}>
                Create first debate
              </Button>
            )}
          </div>
        ) : (
          <div className={styles.postsGrid}>
            {filteredPosts.map((post) => (
              <Link key={post.id} href={`/posts/${post.id}`} className={styles.postCard}>
                <p className={styles.postBody}>{post.body}</p>
                <div className={styles.postFooter}>
                  <span className={styles.postReplies}>
                    <MessageSquare size={12} style={{ verticalAlign: "-1px", marginRight: "3px" }} />
                    {post.replyCount}
                  </span>
                  <span className={styles.postDate}>
                    {new Date(post.createdAt).toLocaleDateString()}
                  </span>
                  {post.mainTripleTermIds.length > 0 && (
                    <TripleTooltip tripleTermIds={post.mainTripleTermIds}>
                      <span className={styles.protocolBadge}>⛓</span>
                    </TripleTooltip>
                  )}
                  <span className={styles.openThread}>Open →</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

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
    </div>
  );
}
