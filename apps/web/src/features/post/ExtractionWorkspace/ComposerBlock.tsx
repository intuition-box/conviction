"use client";

import { Composer } from "@/app/_components/Composer/Composer";
import { ExtractionFlowDialog } from "./ExtractionFlowDialog";
import type { UseComposerFlowResult } from "./hooks/useComposerFlow";

type Props = {
  composerFlow: UseComposerFlowResult;
  className?: string;
};

export function ComposerBlock({ composerFlow, className }: Props) {
  const {
    flow,
    composerOpen,
    dialogOpen,
    setDialogOpen,
    dialogStep,
    setDialogStep,
    handleExtract,
    closeComposer,
  } = composerFlow;

  return (
    <>
      {composerOpen && (
        <section className={className}>
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
            onClose={closeComposer}
            onStanceChange={flow.stanceRequired ? flow.setStance : undefined}
          />
        </section>
      )}
      <ExtractionFlowDialog
        flow={flow}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        step={dialogStep}
        onStepChange={setDialogStep}
      />
    </>
  );
}
