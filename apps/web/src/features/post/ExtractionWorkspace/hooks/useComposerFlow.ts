"use client";

import { useCallback, useEffect, useState } from "react";

import type { Stance } from "../extractionTypes";
import type { DialogStep } from "../ExtractionFlowDialog";
import { useExtractionFlow } from "./useExtractionFlow";

export type UseComposerFlowParams = {
  themeSlug: string;
  parentPostId: string | null;
  parentMainTripleTermId?: string | null;
  themeAtomTermId?: string | null;
  onPublishSuccess: (postId: string) => void;
  autoOpen?: boolean;
  onClose?: () => void;
};

export function useComposerFlow({
  themeSlug,
  parentPostId,
  parentMainTripleTermId,
  themeAtomTermId,
  onPublishSuccess,
  autoOpen,
  onClose,
}: UseComposerFlowParams) {
  const [composerOpen, setComposerOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogStep, setDialogStep] = useState<DialogStep>("claims");

  const handlePublishSuccess = useCallback(
    (postId: string) => {
      setDialogOpen(false);
      setComposerOpen(false);
      onPublishSuccess(postId);
    },
    [onPublishSuccess],
  );

  const flow = useExtractionFlow({
    themeSlug,
    parentPostId,
    parentMainTripleTermId,
    themeAtomTermId,
    onPublishSuccess: handlePublishSuccess,
  });

  // Auto-open (used by Home inline composer)
  useEffect(() => {
    if (autoOpen) setComposerOpen(true);
  }, [autoOpen]);

  const openComposer = useCallback(
    (stance?: Stance) => {
      if (stance) flow.setStance(stance);
      setComposerOpen(true);
    },
    [flow.setStance],
  );

  const closeComposer = useCallback(() => {
    setComposerOpen(false);
    setDialogOpen(false);
    onClose?.();
  }, [onClose]);

  const handleExtract = useCallback(async () => {
    const result = await flow.runExtraction();
    if (result.ok) {
      setDialogStep(result.proposalCount >= 2 ? "split" : "claims");
      setDialogOpen(true);
    }
  }, [flow.runExtraction]);

  return {
    composerOpen,
    openComposer,
    closeComposer,
    dialogOpen,
    setDialogOpen,
    dialogStep,
    setDialogStep,
    flow,
    handleExtract,
  };
}

export type UseComposerFlowResult = ReturnType<typeof useComposerFlow>;
