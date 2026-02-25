"use client";

import { useCallback, useMemo, useState } from "react";
import { Composer } from "@/app/_components/Composer/Composer";
import { Sheet } from "@/app/_components/Sheet/Sheet";
import { RightPanel } from "@/app/_components/RightPanel/RightPanel";
import { useIsMobile } from "@/app/_components/RightPanel/useIsMobile";
import { VoteSection } from "@/components/SentimentBar/VoteSection";
import { ConnectedThumbVote } from "@/components/ThumbVote";
import { useSentimentBatch } from "@/hooks/useSentimentBatch";
import { TripleInspector } from "@/components/TripleInspector/TripleInspector";
import { useExtractionFlow } from "@/features/post/ExtractionWorkspace/hooks/useExtractionFlow";
import { ExtractionFlowDialog, type DialogStep } from "@/features/post/ExtractionWorkspace/ExtractionFlowDialog";
import type { Stance } from "@/features/post/ExtractionWorkspace/extractionTypes";
import { useToast } from "@/components/Toast/ToastContext";

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
  const isMobile = useIsMobile();
  const [composerOpen, setComposerOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogStep, setDialogStep] = useState<DialogStep>("claims");
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [inspectorTriples, setInspectorTriples] = useState(post.tripleLinks);
  const [treeOpen, setTreeOpen] = useState(false);
  const [voteRefreshKey, setVoteRefreshKey] = useState(0);

  const handleVoteSuccess = useCallback(() => {
    setVoteRefreshKey((k) => k + 1);
  }, []);

  const handlePublishSuccess = (postId: string) => {
    setDialogOpen(false);
    setComposerOpen(false);
    addToast("Reply created", "success", { label: "See", href: `/posts/${postId}` }, 6000);
  };

  const parentMainTripleTermId = post.tripleLinks.find(t => t.role === "MAIN")?.termId ?? null;

  // Batch fetch sentiment data for reply sentiment indicators
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
            onOpenInspector={handleOpenInspector}
            thumbSlot={parentMainTripleTermId ? (
              <ConnectedThumbVote tripleTermId={parentMainTripleTermId} size="md" onVoteSuccess={handleVoteSuccess} />
            ) : undefined}
          >
            {parentMainTripleTermId && (
              <VoteSection tripleTermId={parentMainTripleTermId} refreshKey={voteRefreshKey} />
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
      <ExtractionFlowDialog
        flow={flow}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        step={dialogStep}
        onStepChange={setDialogStep}
      />

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
