"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { MessageSquare } from "lucide-react";
import { Button } from "@/components/Button/Button";
import { Composer } from "@/app/_components/Composer/Composer";
import { useExtractionFlow } from "@/features/post/ExtractionWorkspace/hooks/useExtractionFlow";
import { ExtractionFlowDialog, type DialogStep } from "@/features/post/ExtractionWorkspace/ExtractionFlowDialog";
import { useToast } from "@/components/Toast/ToastContext";
import { TripleTooltip } from "@/components/TripleTooltip/TripleTooltip";

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
  const [searchQuery, setSearchQuery] = useState("");
  const [composerOpen, setComposerOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogStep, setDialogStep] = useState<DialogStep>("claims");

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
      <ExtractionFlowDialog
        flow={flow}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        step={dialogStep}
        onStepChange={setDialogStep}
      />
    </div>
  );
}
