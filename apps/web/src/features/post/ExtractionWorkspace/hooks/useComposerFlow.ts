"use client";

import { useCallback, useEffect, useState } from "react";

import type { Stance } from "../extraction";
import { useExtractionFlow } from "./useExtractionFlow";

export type UseComposerFlowParams = {
  themes: { slug: string; name: string }[];
  parentPostId: string | null;
  parentMainTripleTermId?: string | null;
  onPublishSuccess: (postId: string) => void;
  autoOpen?: boolean;
  onClose?: () => void;
  /** Parent claim body text — forwarded to refine chat for context */
  parentClaim?: string;
};

export function useComposerFlow({
  themes,
  parentPostId,
  parentMainTripleTermId,
  onPublishSuccess,
  autoOpen,
  onClose,
  parentClaim,
}: UseComposerFlowParams) {
  const [composerOpen, setComposerOpen] = useState(!!autoOpen);
  useEffect(() => {
    if (autoOpen) setComposerOpen(true);
  }, [autoOpen]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const handlePublishSuccess = useCallback(
    (postId: string) => {
      setDialogOpen(false);
      setComposerOpen(false);
      onPublishSuccess(postId);
    },
    [onPublishSuccess],
  );

  const flow = useExtractionFlow({
    themes,
    parentPostId,
    parentMainTripleTermId,
    onPublishSuccess: handlePublishSuccess,
    parentClaim,
  });

  const { setStance, runExtraction } = flow;

  const openComposer = useCallback(
    (stance?: Stance) => {
      if (stance) setStance(stance);
      setComposerOpen(true);
    },
    [setStance],
  );

  const closeComposer = useCallback(() => {
    setComposerOpen(false);
    setDialogOpen(false);
    onClose?.();
  }, [onClose]);

  const handleExtract = useCallback(async () => {
    const result = await runExtraction();
    if (result.ok) {
      setDialogOpen(true);
    }
  }, [runExtraction]);

  return {
    composerOpen,
    openComposer,
    closeComposer,
    dialogOpen,
    setDialogOpen,
    flow,
    handleExtract,
  };
}

export type UseComposerFlowResult = ReturnType<typeof useComposerFlow>;
