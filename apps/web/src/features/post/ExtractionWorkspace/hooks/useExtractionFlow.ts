"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount, useChainId, usePublicClient, useSwitchChain, useWalletClient } from "wagmi";

import { intuitionTestnet } from "@/lib/chain";
import { normalizeLabelForChain } from "@/lib/format/normalizeLabel";

import {
  buildNestedDraftsFromApi,
  buildNestedRefLabels,
  buildProposalDraftsFromApi,
  type ApiProposal,
  type ApprovedProposalWithRole,
  type DepositState,
  type ExtractionContext,
  type ExtractionJobSummary,
  type NestedActions,
  type NestedProposalDraft,
  type ProposalActions,
  type DraftActions,
  type ProposalDraft,
  type ProposalSummary,
  type PublishSummary,
  type Stance,
  type TripleRole,
  type TxPlanItem,
  type UseExtractionFlowParams,
} from "../extractionTypes";
import { useSessionAuth } from "./useSessionAuth";
import { useDraftPosts } from "./useDraftPosts";
import { useOnchainPublish } from "./useOnchainPublish";
import { useProposalCrud } from "./useProposalCrud";
import { useTripleResolution } from "./useTripleResolution";

// Chain normalization: use normalizeLabelForChain from @/lib/normalizeLabel
const normalizeText = normalizeLabelForChain;

export function useExtractionFlow({ themeSlug, parentPostId, parentMainTripleTermId, onPublishSuccess }: UseExtractionFlowParams) {
  const router = useRouter();
  const { isConnected, address } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const { switchChainAsync } = useSwitchChain();

  const [stance, setStance] = useState<Stance | "">("");
  const [inputText, setInputText] = useState("");
  const [extractionJob, setExtractionJob] = useState<ExtractionJobSummary | null>(null);
  const [proposals, setProposals] = useState<ProposalDraft[]>([]);
  const [nestedProposals, setNestedProposals] = useState<NestedProposalDraft[]>([]);
  // Map stableKey → "S · P · O" label for nested edge TermRef resolution
  const [nestedRefLabels, setNestedRefLabels] = useState<Map<string, string>>(new Map());
  const [txPlan, setTxPlan] = useState<TxPlanItem[]>([]);
  const [publishedPosts, setPublishedPosts] = useState<PublishSummary[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractionContext, setExtractionContext] = useState<ExtractionContext | null>(null);
  const [depositState, setDepositState] = useState<DepositState>({ status: "idle" });

  const { ensureSession } = useSessionAuth({ setMessage });

  // ─── Sub-hook: draft posts ─────────────────
  const {
    draftPosts, setDraftPosts, initializeDrafts, allDraftsHaveMain,
    isSplit, splitDrafts, mergeToDraft,
    updateDraftStance, updateDraftBody, resetDraftBody,
  } = useDraftPosts(proposals);

  const stanceRequired = Boolean(parentPostId);
  const normalizedInput = normalizeText(inputText);
  const normalizedStance = stanceRequired ? (stance as Stance) : null;

  const approvedEntries = useMemo(
    () =>
      draftPosts.flatMap((draft) =>
        draft.proposalIds
          .filter((id) => proposals.find((p) => p.id === id)?.status === "approved")
          .map((id) => ({
            proposalId: id,
            role: (id === draft.mainProposalId ? "MAIN" : "SUPPORTING") as TripleRole,
          })),
      ),
    [draftPosts, proposals],
  );

  const contextDirty = Boolean(
    extractionContext &&
      (extractionContext.inputText !== normalizedInput ||
        extractionContext.parentPostId !== parentPostId ||
        extractionContext.stance !== normalizedStance)
  );

  const approvedProposals = useMemo<ApprovedProposalWithRole[]>(() => {
    return approvedEntries
      .map((entry) => {
        const proposal = proposals.find((p) => p.id === entry.proposalId);
        return proposal ? { ...proposal, role: entry.role } : null;
      })
      .filter((p): p is ApprovedProposalWithRole => p !== null);
  }, [approvedEntries, proposals]);

  const defaultMainProposalId = draftPosts[0]?.mainProposalId ?? null;

  // Default MAIN proposal (used by existing triple-check effect and deposit flow)
  const approvedProposal = useMemo(() => {
    if (defaultMainProposalId) {
      return approvedProposals.find((p) => p.id === defaultMainProposalId) ?? null;
    }
    return approvedProposals.find((p) => p.role === "MAIN") ?? null;
  }, [approvedProposals, defaultMainProposalId]);

  const approvedProposalId = approvedProposal?.id ?? null;

  const proposalItems = useMemo<ProposalSummary[]>(
    () =>
      proposals
        .filter((proposal) => proposal.status !== "rejected")
        .map((proposal) => ({
          id: proposal.id,
          stableKey: proposal.stableKey || null,
          sText: proposal.sText,
          pText: proposal.pText,
          oText: proposal.oText,
          status: proposal.status,
          isDraft: proposal.id.startsWith("draft-"),
          subjectAtomId: proposal.subjectAtomId,
          predicateAtomId: proposal.predicateAtomId,
          objectAtomId: proposal.objectAtomId,
          matchedIntuitionTripleTermId: proposal.matchedIntuitionTripleTermId ?? null,
          isDirty:
            proposal.sText !== proposal.saved.sText ||
            proposal.pText !== proposal.saved.pText ||
            proposal.oText !== proposal.saved.oText ||
            proposal.subjectAtomId !== proposal.saved.subjectAtomId ||
            proposal.predicateAtomId !== proposal.saved.predicateAtomId ||
            proposal.objectAtomId !== proposal.saved.objectAtomId,
          suggestedStance: proposal.suggestedStance,
          stanceAligned: proposal.stanceAligned,
          stanceReason: proposal.stanceReason,
        })),
    [proposals]
  );

  const visibleNestedProposals = useMemo(() => {
    const activeStableKeys = new Set(
      proposals
        .filter((p) => p.status !== "rejected")
        .map((p) => p.stableKey)
        .filter(Boolean),
    );
    return nestedProposals.filter((edge) => {
      if (edge.status === "rejected") return false;
      const subjectOk = edge.subject.type !== "triple" || activeStableKeys.has(edge.subject.tripleKey);
      const objectOk = edge.object.type !== "triple" || activeStableKeys.has(edge.object.tripleKey);
      return subjectOk && objectOk;
    });
  }, [proposals, nestedProposals]);

  // All nested edges (including rejected) for StepContext display
  const displayNestedProposals = useMemo(() => {
    const activeStableKeys = new Set(
      proposals
        .filter((p) => p.status !== "rejected")
        .map((p) => p.stableKey)
        .filter(Boolean),
    );
    return nestedProposals.filter((edge) => {
      const subjectOk = edge.subject.type !== "triple" || activeStableKeys.has(edge.subject.tripleKey);
      const objectOk = edge.object.type !== "triple" || activeStableKeys.has(edge.object.tripleKey);
      return subjectOk && objectOk;
    });
  }, [proposals, nestedProposals]);

  const nestedActions: NestedActions = {
    onReject: (nestedId: string) => {
      setNestedProposals((prev) =>
        prev.map((edge) => edge.id === nestedId ? { ...edge, status: "rejected" as const } : edge),
      );
    },
    onRestore: (nestedId: string) => {
      setNestedProposals((prev) =>
        prev.map((edge) => edge.id === nestedId ? { ...edge, status: "approved" as const } : edge),
      );
    },
  };

  // ─── Sub-hook: triple resolution ───────────
  const resolution = useTripleResolution({
    proposals,
    approvedProposal,
    approvedProposals,
    address,
    setDepositState,
  });

  async function runExtraction(): Promise<{ ok: boolean; proposalCount: number }> {
    setMessage(null);
    const fail = { ok: false, proposalCount: 0 };

    if (!isConnected) {
      setMessage("Connect your wallet to extract proposals.");
      return fail;
    }

    if (!normalizedInput) {
      setMessage("Write your post text before validating.");
      return fail;
    }

    if (stanceRequired && !normalizedStance) {
      setMessage("Select a stance before validating.");
      return fail;
    }

    setIsExtracting(true);
    try {
      const sessionOk = await ensureSession();
      if (!sessionOk) {
        return fail;
      }
      const response = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          themeSlug: themeSlug,
          inputText: normalizedInput,
          parentPostId: parentPostId,
          stance: normalizedStance,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setMessage(data.error ?? "Unable to extract proposals.");
        return fail;
      }

      const allExtracted = [
        ...(data.proposals ?? []),
        ...(data.nestedProposals ?? []),
      ] as ApiProposal[];
      const newProposals = buildProposalDraftsFromApi(allExtracted, true);
      const newNested = buildNestedDraftsFromApi(allExtracted);
      const newLabels = buildNestedRefLabels(allExtracted);

      // New schema: "submission" instead of "extractionJob"
      setExtractionJob({
        id: data.submission.id,
        status: data.submission.status,
        parentPostId,
        stance: normalizedStance,
        parentMainTripleTermId,
      });
      setProposals(newProposals);
      setNestedProposals(newNested);
      setNestedRefLabels(newLabels);
      const firstProposalId = newProposals.length > 0 ? newProposals[0].id : null;
      initializeDrafts(normalizedStance, newProposals.map((p) => p.id), firstProposalId, normalizedInput);
      setTxPlan([]);
      setPublishedPosts([]);
      setExtractionContext({
        inputText: normalizedInput,
        parentPostId,
        stance: normalizedStance,
      });
      return { ok: true, proposalCount: newProposals.length };
    } catch {
      setMessage("Unable to extract proposals.");
      return fail;
    } finally {
      setIsExtracting(false);
    }
  }

  // ─── Sub-hook: proposal CRUD ──────────────
  const crud = useProposalCrud({
    proposals,
    setProposals,
    extractionJob,
    draftPosts,
    setDraftPosts,
    isConnected,
    setMessage,
    setIsExtracting,
    ensureSession,
  });

  // ─── Sub-hook: on-chain publish ───────────
  const publish = useOnchainPublish({
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
    minDeposit: resolution.minDeposit,
    setMessage,
    setPublishedPosts,
    setTxPlan,
    setDepositState,
    ensureSession,
    router,
    onPublishSuccess,
    visibleNestedProposals,
    proposals,
  });

  const busy = isExtracting || publish.isPublishing;

  const proposalActions: ProposalActions = {
    onChange: crud.updateProposalField,
    onSave: crud.saveProposal,
    onSelectMain: crud.selectMain,
    onReject: crud.rejectProposal,
    onSelectReuse: crud.setMatchedTripleTermId,
    onLock: crud.lockProposalAtom,
    onUnlock: crud.unlockProposalAtom,
    onAddDraft: crud.addDraftProposal,
  };

  const draftActions: DraftActions = {
    onSplit: () => splitDrafts(normalizedStance),
    onMerge: () => mergeToDraft(normalizedStance, normalizedInput),
    onStanceChange: updateDraftStance,
    onBodyChange: updateDraftBody,
    onBodyReset: resetDraftBody,
  };

  // In reply split mode, every draft with approved proposals must have a stance
  const allSplitDraftsHaveStance = !stanceRequired || !isSplit || draftPosts.every((d) => {
    const hasApproved = d.proposalIds.some(
      (pid) => proposals.find((p) => p.id === pid)?.status === "approved",
    );
    return !hasApproved || d.stance !== null;
  });

  const canAdvanceToSubmit =
    allDraftsHaveMain &&
    allSplitDraftsHaveStance &&
    approvedProposals.length > 0 &&
    isConnected && chainId === intuitionTestnet.id && !contextDirty && !busy;

  return {
    inputText,
    setInputText,
    extractedInputText: extractionContext?.inputText ?? "",
    stance,
    setStance,
    stanceRequired,
    walletConnected: isConnected,
    onchainReady: Boolean(isConnected && publicClient && walletClient),
    correctChain: chainId === intuitionTestnet.id,
    switchToCorrectChain: publish.switchToCorrectChain,
    extractionJob,
    proposals,
    nestedProposals,
    visibleNestedProposals,
    displayNestedProposals,
    nestedActions,
    nestedRefLabels,
    proposalItems,
    approvedProposal,
    approvedProposalId,
    defaultMainProposalId,
    draftPosts,
    approvedEntries,
    approvedProposals,
    message,
    contextDirty,
    busy,
    isExtracting,
    minDeposit: resolution.minDeposit,
    atomCost: resolution.atomCost,
    tripleCost: resolution.tripleCost,
    existingTripleId: resolution.existingTripleId,
    existingTripleStatus: resolution.existingTripleStatus,
    existingTripleError: resolution.existingTripleError,
    existingTripleMetrics: resolution.existingTripleMetrics,
    depositState,
    approvedTripleStatuses: resolution.approvedTripleStatuses,
    approvedTripleStatus: resolution.approvedTripleStatus,
    approvedTripleStatusError: resolution.approvedTripleStatusError,
    tripleSuggestionsByProposal: resolution.tripleSuggestionsByProposal,
    txPlan,
    publishedPost: publishedPosts[0] ?? null,
    publishedPosts,
    isPublishing: publish.isPublishing,
    publishError: publish.publishError,
    runExtraction,
    proposalActions,
    draftActions,
    isSplit,
    canAdvanceToSubmit,
    updateProposalField: crud.updateProposalField,
    addDraftProposal: crud.addDraftProposal,
    saveProposal: crud.saveProposal,
    selectMain: crud.selectMain,
    rejectProposal: crud.rejectProposal,
    lockProposalAtom: crud.lockProposalAtom,
    unlockProposalAtom: crud.unlockProposalAtom,
    setMatchedTripleTermId: crud.setMatchedTripleTermId,
    publishOnchain: publish.publishOnchain,
  };
}

export type UseExtractionFlowResult = ReturnType<typeof useExtractionFlow>;
