"use client";

import { normalizeLabelForChain } from "@/lib/format/normalizeLabel";

import {
  findDraftIndex,
  normalizeMain,
  type DraftPost,
  type ExtractionJobSummary,
  type ProposalDraft,
  type ProposalStatus,
} from "../extractionTypes";

const normalizeText = normalizeLabelForChain;

// ─── Params & Return types ────────────────────────────────────────────────

type UseProposalCrudParams = {
  proposals: ProposalDraft[];
  setProposals: React.Dispatch<React.SetStateAction<ProposalDraft[]>>;
  extractionJob: ExtractionJobSummary | null;
  draftPosts: DraftPost[];
  setDraftPosts: React.Dispatch<React.SetStateAction<DraftPost[]>>;
  isConnected: boolean;
  setMessage: (msg: string | null) => void;
  setIsExtracting: (v: boolean) => void;
  ensureSession: () => Promise<boolean>;
};

type UseProposalCrudReturn = {
  updateProposalField: (id: string, field: "sText" | "pText" | "oText", value: string) => void;
  addDraftProposal: (targetDraftId?: string) => void;
  saveProposal: (id: string, overrides?: Partial<ProposalDraft>) => Promise<void>;
  lockProposalAtom: (id: string, field: "sText" | "pText" | "oText", atomId: string, label: string) => void;
  unlockProposalAtom: (id: string, field: "sText" | "pText" | "oText") => void;
  setMatchedTripleTermId: (id: string, tripleTermId: string | null) => Promise<void>;
  selectMain: (id: string) => void;
  rejectProposal: (id: string) => void;
};

// ─── Hook ─────────────────────────────────────────────────────────────────

export function useProposalCrud({
  proposals,
  setProposals,
  extractionJob,
  draftPosts: _draftPosts,
  setDraftPosts,
  isConnected,
  setMessage,
  setIsExtracting,
  ensureSession,
}: UseProposalCrudParams): UseProposalCrudReturn {

  function updateProposalField(proposalId: string, field: "sText" | "pText" | "oText", value: string) {
    setProposals((prev) =>
      prev.map((proposal) => {
        if (proposal.id !== proposalId) return proposal;
        const next = { ...proposal, [field]: value };
        if (field === "sText") {
          next.subjectAtomId = null;
        }
        if (field === "pText") {
          next.predicateAtomId = null;
        }
        if (field === "oText") {
          next.objectAtomId = null;
        }
        return next;
      })
    );
  }

  function addDraftProposal(targetDraftId?: string) {
    if (!isConnected) {
      setMessage("Connect your wallet to add proposals.");
      return;
    }

    if (!extractionJob) {
      setMessage("Run extraction before adding a manual triple.");
      return;
    }

    const empty = {
      sText: "",
      pText: "",
      oText: "",
      subjectAtomId: null,
      predicateAtomId: null,
      objectAtomId: null,
    };

    const draftId = `draft-${Date.now()}`;

    setProposals((prev) => [
      ...prev,
      {
        id: draftId,
        stableKey: "",
        ...empty,
        matchedIntuitionTripleTermId: null,
        suggestedStance: null,
        stanceAligned: null,
        stanceReason: null,
        sentenceText: "",
        status: "pending" as ProposalStatus,
        saved: { ...empty },
      },
    ]);

    setDraftPosts((prev) => {
      const targetFound = targetDraftId && prev.some((d) => d.id === targetDraftId);
      return prev.map((d, i) =>
        (targetFound ? d.id === targetDraftId : i === 0)
          ? { ...d, proposalIds: [...d.proposalIds, draftId] }
          : d,
      );
    });
  }

  async function saveProposal(
    proposalId: string,
    overrides?: Partial<ProposalDraft>
  ): Promise<void> {
    setMessage(null);
    if (!isConnected) {
      setMessage("Connect your wallet to save proposals.");
      return;
    }
    const proposal = proposals.find((item) => item.id === proposalId);
    if (!proposal) {
      return;
    }

    const next: ProposalDraft = {
      ...proposal,
      ...overrides,
      subjectAtomId:
        typeof overrides?.subjectAtomId === "undefined"
          ? proposal.subjectAtomId
          : overrides.subjectAtomId,
      predicateAtomId:
        typeof overrides?.predicateAtomId === "undefined"
          ? proposal.predicateAtomId
          : overrides.predicateAtomId,
      objectAtomId:
        typeof overrides?.objectAtomId === "undefined"
          ? proposal.objectAtomId
          : overrides.objectAtomId,
    };

    const isDirty =
      next.sText !== proposal.saved.sText ||
      next.pText !== proposal.saved.pText ||
      next.oText !== proposal.saved.oText ||
      next.subjectAtomId !== proposal.saved.subjectAtomId ||
      next.predicateAtomId !== proposal.saved.predicateAtomId ||
      next.objectAtomId !== proposal.saved.objectAtomId;

    const isDraft = proposalId.startsWith("draft-");

    if (isDraft) {
      if (!extractionJob) {
        setMessage("Run extraction before adding a manual triple.");
        return;
      }

      const normalized = {
        sText: normalizeText(next.sText),
        pText: normalizeText(next.pText),
        oText: normalizeText(next.oText),
      };

      if (!normalized.sText || !normalized.pText || !normalized.oText) {
        setMessage("Fill subject, predicate, and object before saving.");
        return;
      }

      setIsExtracting(true);
      try {
        const sessionOk = await ensureSession();
        if (!sessionOk) {
          return;
        }

        // Generate proposal ID locally (no DB persistence needed)
        const proposalId_generated = `proposal-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;

        const sText = normalized.sText;
        const pText = normalized.pText;
        const oText = normalized.oText;

        // Update localStorage state directly
        setProposals((prev) =>
          prev.map((item) =>
                item.id === proposalId
              ? {
                  id: proposalId_generated,
                  stableKey: "",
                  sText,
                  pText,
                  oText,
                  status: "approved" as ProposalStatus,
                  subjectAtomId: next.subjectAtomId ?? null,
                  predicateAtomId: next.predicateAtomId ?? null,
                  objectAtomId: next.objectAtomId ?? null,
                  suggestedStance: null,
                  stanceAligned: null,
                  stanceReason: null,
                  sentenceText: "",
                  saved: {
                    sText,
                    pText,
                    oText,
                    subjectAtomId: next.subjectAtomId ?? null,
                    predicateAtomId: next.predicateAtomId ?? null,
                    objectAtomId: next.objectAtomId ?? null,
                  },
                  matchedIntuitionTripleTermId: null,
                }
              : item
          )
        );

        setDraftPosts((prev) =>
          prev.map((d) => ({
            ...d,
            proposalIds: d.proposalIds.map((id) => (id === proposalId ? proposalId_generated : id)),
            mainProposalId: d.mainProposalId === proposalId ? proposalId_generated : d.mainProposalId,
          })),
        );
      } catch {
        setMessage("Unable to add manual triple.");
      } finally {
        setIsExtracting(false);
      }

      return;
    }

    if (!extractionJob || !isDirty) {
      return;
    }

    setIsExtracting(true);
    try {
      const sessionOk = await ensureSession();
      if (!sessionOk) {
        return;
      }

      // Update localStorage state directly (no DB persistence needed)
      setProposals((prev) =>
        prev.map((item) =>
          item.id === proposalId
            ? {
                ...item,
                saved: {
                  sText: item.sText,
                  pText: item.pText,
                  oText: item.oText,
                  subjectAtomId: item.subjectAtomId,
                  predicateAtomId: item.predicateAtomId,
                  objectAtomId: item.objectAtomId,
                },
              }
            : item
        )
      );
    } catch {
      setMessage("Unable to save edits.");
    } finally {
      setIsExtracting(false);
    }
  }

  async function setMatchedTripleTermId(proposalId: string, tripleTermId: string | null) {
    // Update localStorage state directly (no DB persistence needed)
    setProposals((prev) =>
      prev.map((proposal) =>
        proposal.id === proposalId
          ? { ...proposal, matchedIntuitionTripleTermId: tripleTermId }
          : proposal
      )
    );
  }

  function lockProposalAtom(
    proposalId: string,
    field: "sText" | "pText" | "oText",
    atomId: string,
    label: string
  ) {
    const updates: Partial<ProposalDraft> = { [field]: label } as Partial<ProposalDraft>;
    if (field === "sText") {
      updates.subjectAtomId = atomId;
    }
    if (field === "pText") {
      updates.predicateAtomId = atomId;
    }
    if (field === "oText") {
      updates.objectAtomId = atomId;
    }

    setProposals((prev) =>
      prev.map((proposal) =>
        proposal.id === proposalId
          ? {
              ...proposal,
              ...updates,
            }
          : proposal
      )
    );

    if (!proposalId.startsWith("draft-")) {
      void saveProposal(proposalId, updates);
    }
  }

  function unlockProposalAtom(proposalId: string, field: "sText" | "pText" | "oText") {
    const updates: Partial<ProposalDraft> = {};
    if (field === "sText") {
      updates.subjectAtomId = null;
    }
    if (field === "pText") {
      updates.predicateAtomId = null;
    }
    if (field === "oText") {
      updates.objectAtomId = null;
    }

    setProposals((prev) =>
      prev.map((proposal) =>
        proposal.id === proposalId
          ? {
              ...proposal,
              ...updates,
            }
          : proposal
      )
    );

    if (!proposalId.startsWith("draft-")) {
      void saveProposal(proposalId, updates);
    }
  }

  // ─── selectMain: radio toggle for primary claim ─────────────────────────

  function selectMain(proposalId: string) {
    if (!extractionJob) return;
    if (proposalId.startsWith("draft-")) return;
    if (!isConnected) {
      setMessage("Connect your wallet to update proposals.");
      return;
    }

    const proposal = proposals.find((p) => p.id === proposalId);
    if (!proposal || proposal.status === "rejected") return;

    setMessage(null);

    setDraftPosts((prev) => {
      const draftIdx = findDraftIndex(prev, proposalId);
      if (draftIdx === -1) return prev;
      if (prev[draftIdx].mainProposalId === proposalId) return prev;

      return prev.map((d, i) => {
        if (i !== draftIdx) return d;
        const updated = { ...d, mainProposalId: proposalId };
        // Recalculate body only if user hasn't edited it
        if (d.body === d.bodyDefault) {
          const newBodyDefault = proposal.sentenceText || d.bodyDefault;
          updated.body = newBodyDefault;
          updated.bodyDefault = newBodyDefault;
        }
        return updated;
      });
    });
  }

  // ─── rejectProposal: remove with auto-fallback main ───────────────────

  function rejectProposal(proposalId: string) {
    setMessage(null);

    if (!isConnected) {
      setMessage("Connect your wallet to update proposals.");
      return;
    }

    if (proposalId.startsWith("draft-")) {
      setProposals((prev) => prev.filter((p) => p.id !== proposalId));
      setDraftPosts((prev) =>
        prev.map((d) => normalizeMain({
          ...d,
          proposalIds: d.proposalIds.filter((id) => id !== proposalId),
          mainProposalId: d.mainProposalId === proposalId ? null : d.mainProposalId,
        })),
      );
      return;
    }

    if (!extractionJob) return;

    setProposals((prev) =>
      prev.map((p) => (p.id === proposalId ? { ...p, status: "rejected" as ProposalStatus } : p))
    );

    setDraftPosts((prev) => {
      const draftIdx = findDraftIndex(prev, proposalId);
      if (draftIdx === -1) return prev;
      const draft = prev[draftIdx];
      if (draft.mainProposalId !== proposalId) return prev;
      // Pick next non-rejected proposal in the draft
      const nextMain = draft.proposalIds.find(
        (id) => id !== proposalId && proposals.find((p) => p.id === id)?.status !== "rejected",
      ) ?? null;
      return prev.map((d, i) => (i === draftIdx ? { ...d, mainProposalId: nextMain } : d));
    });
  }

  return {
    updateProposalField,
    addDraftProposal,
    saveProposal,
    lockProposalAtom,
    unlockProposalAtom,
    setMatchedTripleTermId,
    selectMain,
    rejectProposal,
  };
}
