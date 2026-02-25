"use client";

import { useState } from "react";
import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import type { Address, PublicClient, WalletClient } from "viem";
import { getMultiVaultAddressFromChainId } from "@0xintuition/sdk";

import { intuitionTestnet } from "@/lib/chain";
import { ensureIntuitionGraphql } from "@/lib/intuition";
import { labels } from "@/lib/vocabulary";

import {
  buildResolvedTripleMap,
  collectNestedAtomLabels,
  groupResolvedByDraft,
  type ApprovedProposalWithRole,
  type DepositState,
  type DraftPost,
  type ExtractionJobSummary,
  type NestedProposalDraft,
  type ProposalDraft,
  type PublishSummary,
  type ResolvedNestedTriple,
  type ResolvedTriple,
  type TxPlanItem,
} from "../extractionTypes";

import {
  hydrateMatchedTriples,
  resolveAtoms,
  resolveTriples,
  resolveNestedTriples,
  resolveStanceTriples,
  depositOnExistingTriples,
  PublishStepError,
  type StanceEntry,
  type StepContext,
} from "../publishSteps";

// ─── Params & Return types ────────────────────────────────────────────────

type UseOnchainPublishParams = {
  // Wagmi
  isConnected: boolean;
  address: `0x${string}` | undefined;
  chainId: number;
  publicClient: PublicClient | undefined;
  walletClient: WalletClient | undefined;
  switchChainAsync: (params: { chainId: number }) => Promise<unknown>;
  // State
  extractionJob: ExtractionJobSummary | null;
  approvedProposals: ApprovedProposalWithRole[];
  draftPosts: DraftPost[];
  allDraftsHaveMain: boolean;
  contextDirty: boolean;
  minDeposit: bigint | null;
  // Setters
  setMessage: (msg: string | null) => void;
  setPublishedPosts: React.Dispatch<React.SetStateAction<PublishSummary[]>>;
  setTxPlan: React.Dispatch<React.SetStateAction<TxPlanItem[]>>;
  setDepositState: (state: DepositState) => void;
  // Dependencies
  ensureSession: () => Promise<boolean>;
  router: AppRouterInstance;
  onPublishSuccess?: (postId: string) => void;
  visibleNestedProposals: NestedProposalDraft[];
  proposals: ProposalDraft[];
};

type UseOnchainPublishReturn = {
  isPublishing: boolean;
  publishError: string | null;
  publishOnchain: () => Promise<void>;
  switchToCorrectChain: () => Promise<void>;
};

// ─── Hook ─────────────────────────────────────────────────────────────────

export function useOnchainPublish({
  isConnected,
  address,
  chainId,
  publicClient,
  walletClient,
  switchChainAsync,
  extractionJob,
  approvedProposals,
  draftPosts,
  allDraftsHaveMain,
  contextDirty,
  minDeposit,
  setMessage,
  setPublishedPosts,
  setTxPlan,
  setDepositState,
  ensureSession,
  router,
  onPublishSuccess,
  visibleNestedProposals,
  proposals,
}: UseOnchainPublishParams): UseOnchainPublishReturn {
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);

  // ─── Internal: cancelPublish ──────────────────────────────────────────

  async function cancelPublish(submissionId: string, idempotencyKey: string, reason: string): Promise<boolean> {
    try {
      const res = await fetch("/api/publish/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submissionId, idempotencyKey, reason }),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  // ─── Exposed: publishOnchain ──────────────────────────────────────────

  async function publishOnchain() {
    setMessage(null);
    setPublishError(null);

    // Pre-flight checks
    if (!isConnected) {
      setMessage(labels.connectWalletToPublish);
      return;
    }

    if (!extractionJob) {
      setMessage("Run extraction before publishing.");
      return;
    }

    if (approvedProposals.length === 0) {
      setMessage(labels.preflightNoApproved);
      return;
    }

    if (!allDraftsHaveMain) {
      setMessage(labels.preflightNoMain);
      return;
    }

    if (contextDirty) {
      setMessage(labels.contentChangedWarning);
      return;
    }

    if (isPublishing) return; // Double-click guard

    setIsPublishing(true);
    const idempotencyKey = crypto.randomUUID();
    let prepared = false;

    try {
      // Ensure session before any on-chain action
      const sessionOk = await ensureSession();
      if (!sessionOk) return;

      // Lock submission server-side before publishing
      const prepareRes = await fetch("/api/publish/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          submissionId: extractionJob.id,
          idempotencyKey,
        }),
      });

      if (!prepareRes.ok) {
        const prepareData = await prepareRes.json().catch(() => ({}));
        if (prepareData.alreadyPublished && prepareData.postId) {
          // Already published — recover existing post
          setPublishedPosts([{
            id: prepareData.postId,
            publishedAt: new Date().toISOString(),
          }]);
          if (onPublishSuccess) onPublishSuccess(prepareData.postId);
          return;
        }

        // Already PUBLISHING (e.g. localStorage lost) — auto-cancel and re-prepare
        if (prepareData.existingKey) {
          const cancelled = await cancelPublish(
            extractionJob.id,
            prepareData.existingKey,
            "auto_recovery",
          );
          if (!cancelled) {
            setPublishError("Unable to resume previous attempt. Please try again.");
            return;
          }
          // Re-prepare with our new idempotencyKey
          const retryRes = await fetch("/api/publish/prepare", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              submissionId: extractionJob.id,
              idempotencyKey,
            }),
          });
          if (!retryRes.ok) {
            const retryData = await retryRes.json().catch(() => ({}));
            setPublishError(retryData.error ?? "Failed to prepare publication.");
            return;
          }
          // Recovery successful — continue the normal flow below
        } else {
          setPublishError(prepareData.error ?? "Failed to prepare publication.");
          return;
        }
      }

      prepared = true;

      // Wallet and network guards
      if (!walletClient || !publicClient || !address) {
        setPublishError("Wallet is initializing. Please wait a moment and try again.");
        await cancelPublish(extractionJob.id, idempotencyKey, "wallet_not_ready");
        return;
      }

      if (chainId !== intuitionTestnet.id) {
        try {
          await switchChainAsync({ chainId: intuitionTestnet.id });
        } catch {
          setPublishError("Please switch to the correct network.");
          await cancelPublish(extractionJob.id, idempotencyKey, "wrong_chain");
          return;
        }
      }

      ensureIntuitionGraphql();

      const multivaultAddress = getMultiVaultAddressFromChainId(intuitionTestnet.id) as Address;
      const ctx: StepContext = {
        writeConfig: { walletClient, publicClient, multivaultAddress },
        accountAddress: address,
      };

      // [3a] Hydrate pre-matched triples
      const resolvedByIndex: Array<ResolvedTriple | null> =
        new Array(approvedProposals.length).fill(null);

      const toResolve = await hydrateMatchedTriples(approvedProposals, resolvedByIndex);

      let atomTxHash: string | null = null;
      let tripleTxHash: string | null = null;
      let nestedTxHash: string | null = null;
      let stanceTxHash: string | null = null;
      let resolvedNestedTriples: ResolvedNestedTriple[] = [];

      // [3b] Resolve atoms + triples
      const nestedAtomLabels = collectNestedAtomLabels(visibleNestedProposals);

      if (toResolve.length > 0 || visibleNestedProposals.length > 0) {
        const atomResult = await resolveAtoms(toResolve, ctx, nestedAtomLabels);
        atomTxHash = atomResult.atomTxHash;

        if (toResolve.length > 0) {
          const tripleResult = await resolveTriples(toResolve, atomResult.atomMap, resolvedByIndex, ctx);
          tripleTxHash = tripleResult.tripleTxHash;
        }

        // [3b2] Resolve nested triples (invariant I5: AFTER resolveTriples)
        if (visibleNestedProposals.length > 0) {
          const resolvedTripleMap = buildResolvedTripleMap(resolvedByIndex, approvedProposals);
          const nestedResult = await resolveNestedTriples({
            nestedProposals: visibleNestedProposals,
            resolvedTripleMap,
            atomMap: atomResult.atomMap,
            ctx,
          });
          resolvedNestedTriples = nestedResult.resolvedNested;
          nestedTxHash = nestedResult.nestedTxHash;
        }
      }

      // [3c] Stance triples (replies only — 1 batch TX for all drafts)
      if (extractionJob.parentPostId && extractionJob.parentMainTripleTermId) {
        const stanceEntries: StanceEntry[] = [];
        for (const draft of draftPosts) {
          if (!draft.stance) continue;
          const mainEntry = approvedProposals.find(
            (p) => p.id === draft.mainProposalId && p.role === "MAIN",
          );
          if (!mainEntry) continue;
          const mainResolved = resolvedByIndex.find(
            (t) => t?.proposalId === mainEntry.id && t?.role === "MAIN",
          );
          if (!mainResolved) {
            throw new PublishStepError("stance_failed", labels.errorStanceCreation);
          }
          stanceEntries.push({
            mainTripleTermId: mainResolved.tripleTermId,
            mainProposalId: mainResolved.proposalId,
            stance: draft.stance,
            parentMainTripleTermId: extractionJob.parentMainTripleTermId,
          });
        }

        if (stanceEntries.length > 0) {
          const stanceResult = await resolveStanceTriples({
            entries: stanceEntries,
            resolvedByIndex,
            ctx,
          });
          stanceTxHash = stanceResult.stanceTxHash;
        }
      }

      // [3d] Final validation
      const orderedTriples = resolvedByIndex.filter(
        (t): t is ResolvedTriple => Boolean(t),
      );
      const stanceCount = extractionJob.parentPostId
        ? draftPosts.filter((d) => d.stance).length
        : 0;
      const expectedCount = approvedProposals.length + stanceCount;
      if (orderedTriples.length !== expectedCount) {
        throw new PublishStepError("resolution_incomplete", labels.errorResolution);
      }

      // Deposits on existing triples (core + nested)
      const existingCoreTriples = orderedTriples.filter((t) => t.isExisting);
      const existingNestedAsResolved: ResolvedTriple[] = resolvedNestedTriples
        .filter((n) => n.isExisting)
        .map((n) => ({
          proposalId: n.nestedProposalId,
          role: "SUPPORTING" as const,
          subjectAtomId: n.subjectTermId,
          predicateAtomId: n.predicateTermId,
          objectAtomId: n.objectTermId,
          tripleTermId: n.tripleTermId,
          isExisting: true,
        }));
      const allExistingTriples = [...existingCoreTriples, ...existingNestedAsResolved];

      if (allExistingTriples.length > 0) {
        setDepositState({ status: "depositing" });
        const depositResult = await depositOnExistingTriples({
          triples: allExistingTriples,
          ctx,
          minDeposit,
        });
        setDepositState({ status: "confirmed", txHash: depositResult.txHash });
      } else {
        setDepositState({ status: "idle" });
      }

      // Build per-draft confirm payload
      const allDraftPayloads = groupResolvedByDraft(
        resolvedByIndex,
        resolvedNestedTriples,
        draftPosts,
        proposals,
        visibleNestedProposals,
      );
      // Skip empty drafts (all proposals rejected) — API requires exactly 1 MAIN per post
      const draftPayloads = allDraftPayloads.filter((p) => p.triples.length > 0);

      const confirmPayload = {
        submissionId: extractionJob.id,
        idempotencyKey,
        posts: draftPayloads,
        atomTxHash,
        tripleTxHash,
        nestedTxHash,
        stanceTxHash,
      };
      try {
        localStorage.setItem(
          `dm_publish_intent_${extractionJob.id}`,
          JSON.stringify({ ...confirmPayload, timestamp: Date.now() }),
        );
      } catch {
        // localStorage may be unavailable — proceed anyway
      }

      // Re-validate session in case it expired during TX signing
      const sessionStillOk = await ensureSession();
      if (!sessionStillOk) {
        // localStorage has the data — user can retry after re-auth on next page load
        return;
      }

      // Confirm and persist to DB (with retry on 5xx)
      const { fetchWithRetry } = await import("@/lib/net/fetchRetry");
      const response = await fetchWithRetry("/api/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(confirmPayload),
      }, { retries: 3, backoffMs: 1000 });

      // Check if response has content before parsing JSON
      const contentType = response.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        setPublishError("Server returned an invalid response. Please try again.");
        console.error("Invalid response from /api/publish:", {
          status: response.status,
          contentType,
          statusText: response.statusText,
        });
        return;
      }

      const data = await response.json();
      if (!response.ok) {
        setPublishError(data.error ?? "Unable to publish.");
        return;
      }

      // Success: clear local state and update UI
      try {
        localStorage.removeItem(`dm_publish_intent_${extractionJob.id}`);
      } catch {
        // ignore
      }

      const posts: PublishSummary[] = data.posts ?? [];

      setTxPlan(data.txPlan ?? []);
      setPublishedPosts(posts);
      router.refresh();

      if (onPublishSuccess && posts[0]?.id) {
        onPublishSuccess(posts[0].id);
      }
    } catch (error) {
      if (error instanceof PublishStepError) {
        setPublishError(error.message);
        if (error.code === "deposit_failed") {
          setDepositState({ status: "failed", error: error.message });
        }
        if (prepared) {
          await cancelPublish(extractionJob!.id, idempotencyKey, error.code);
        }
      } else {
        const msg = error instanceof Error ? error.message : "Unable to publish.";
        setPublishError(msg);
        if (prepared) {
          await cancelPublish(extractionJob!.id, idempotencyKey, "unexpected_error");
        }
      }
    } finally {
      setIsPublishing(false);
    }
  }

  // ─── Exposed: switchToCorrectChain ────────────────────────────────────

  async function switchToCorrectChain() {
    try {
      await switchChainAsync({ chainId: intuitionTestnet.id });
    } catch {
      setPublishError("Failed to switch network. Please switch manually.");
    }
  }

  return {
    isPublishing,
    publishError,
    publishOnchain,
    switchToCorrectChain,
  };
}
