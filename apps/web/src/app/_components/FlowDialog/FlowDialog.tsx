"use client";

import { ReactNode, useRef, useState, useEffect } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";

import styles from "./FlowDialog.module.css";

type FlowDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  totalSteps: number;
  activeStep: number | null;
  helpText?: string | null;
  children: ReactNode;
};

export function FlowDialog({
  open,
  onOpenChange,
  title,
  totalSteps,
  activeStep,
  helpText,
  children,
}: FlowDialogProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content className={styles.content}>
          <div className={styles.header}>
            <Dialog.Title className={styles.title}>{title}</Dialog.Title>
            <div className={styles.steps}>
              {Array.from({ length: totalSteps }, (_, i) => (
                <span
                  key={i}
                  className={`${styles.dot} ${activeStep === i + 1 ? styles.dotActive : ""}`}
                />
              ))}
            </div>
            {helpText && <HelpTooltip text={helpText} />}
            <Dialog.Close asChild>
              <button className={styles.closeButton} aria-label="Close">
                <X size={16} />
              </button>
            </Dialog.Close>
          </div>
          <div className={styles.body}>{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function HelpTooltip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div ref={ref} className={styles.helpWrapper}>
      <button
        className={styles.helpButton}
        aria-label="Help"
        onClick={() => setOpen((v) => !v)}
      >
        ?
      </button>
      {open && (
        <div className={styles.helpTooltip}>
          {text}
        </div>
      )}
    </div>
  );
}
