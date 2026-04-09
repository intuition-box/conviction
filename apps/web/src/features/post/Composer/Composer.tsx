"use client";

import { Button } from "@/components/Button/Button";
import { Badge } from "@/components/Badge/Badge";
import type { ReactNode } from "react";
import type { Stance } from "@/features/post/ExtractionWorkspace/extraction";

import { labels } from "@/lib/vocabulary";
import styles from "./Composer.module.css";

type ComposerProps = {
  stance: Stance | "";
  inputText: string;
  busy: boolean;
  walletConnected: boolean;
  extracting?: boolean;
  contextDirty: boolean;
  message: string | null;
  status?: string;
  onInputChange: (value: string) => void;
  onExtract: () => void;
  onClose: () => void;
  themeSlot?: ReactNode;
  extraDisabled?: boolean;
  extraDisabledHint?: string;
  hideHeader?: boolean;
  placeholder?: string;
  inline?: boolean;
};

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  EXTRACTING: "Analyzing...",
  READY_TO_PUBLISH: "Ready",
  PUBLISHING: "Publishing...",
  PUBLISHED: "Published",
  FAILED: "Failed",
};

const STATUS_TONE: Record<string, "neutral" | "success" | "warning" | "danger"> = {
  DRAFT: "neutral",
  EXTRACTING: "warning",
  READY_TO_PUBLISH: "success",
  PUBLISHING: "warning",
  PUBLISHED: "success",
  FAILED: "danger",
};

type HintArgs = {
  message: string | null;
  walletConnected: boolean;
  extraDisabled?: boolean;
  extraDisabledHint?: string;
  inputText: string;
  contextDirty: boolean;
  inline?: boolean;
  stance: Stance | "";
};

function computeHint({
  message,
  walletConnected,
  extraDisabled,
  extraDisabledHint,
  inputText,
  contextDirty,
  inline,
  stance,
}: HintArgs): string {
  if (message) return message;
  if (!walletConnected) return labels.connectWalletToAnalyze;
  if (extraDisabled && extraDisabledHint && inputText.length > 0) return extraDisabledHint;
  if (contextDirty) return labels.contentChangedWarning;
  if (inline && stance === "SUPPORTS") return "You're replying as supporting";
  if (inline && stance === "REFUTES") return "You're replying as refuting";
  return labels.composerHint;
}

export function Composer({
  stance,
  inputText,
  busy,
  walletConnected,
  extracting,
  contextDirty,
  message,
  status,
  onInputChange,
  onExtract,
  onClose,
  themeSlot,
  extraDisabled,
  extraDisabledHint,
  hideHeader,
  placeholder,
  inline,
}: ComposerProps) {
  const actionLabel = contextDirty ? "Re-submit" : "Submit";
  const disabled = busy || !walletConnected || !!extraDisabled;

  const hint = computeHint({
    message,
    walletConnected,
    extraDisabled,
    extraDisabledHint,
    inputText,
    contextDirty,
    inline,
    stance,
  });

  const stanceClass = !inline && stance === "SUPPORTS"
    ? styles.textareaSupports
    : !inline && stance === "REFUTES"
      ? styles.textareaRefutes
      : "";

  const textareaEl = (
    <div className={styles.textareaWrap}>
      <textarea
        className={`${styles.textarea} ${inline ? styles.textareaInline : ""} ${stanceClass}`}
        value={inputText}
        maxLength={200}
        onChange={(e) => onInputChange(e.target.value)}
        placeholder={placeholder ?? "Write your text"}
      />
      <span className={`${styles.charCount} ${inputText.length >= 200 ? styles.charCountLimit : ""}`}>
        {inputText.length}/200
      </span>
    </div>
  );

  const footerEl = (
    <div className={styles.footer}>
      <span className={styles.footerHint}>{hint}</span>
      <div className={styles.footerActions}>
        {(hideHeader || inline) && (
          <button
            type="button"
            className={styles.cancelBtn}
            onClick={onClose}
          >
            Cancel
          </button>
        )}
        <Button
          variant="primary"
          size="sm"
          onClick={onExtract}
          disabled={disabled}
        >
          {extracting ? (
            <>
              <span className={styles.spinner} aria-hidden="true" />
              {labels.analyzingStatus}
            </>
          ) : (
            actionLabel
          )}
        </Button>
      </div>
    </div>
  );

  if (inline) {
    return (
      <div className={styles.inline}>
        <div className={styles.inlineArea}>
          <div className={styles.inlineAvatar} aria-hidden="true" />
          <div className={styles.inlineInputWrap}>
            {themeSlot && <div className={styles.inlineThemeSlot}>{themeSlot}</div>}
            {textareaEl}
            {footerEl}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.composer}>
      {!hideHeader && (
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            {stance === "SUPPORTS" && <span className={styles.stanceHint} data-stance="supports">Supporting</span>}
            {stance === "REFUTES" && <span className={styles.stanceHint} data-stance="refutes">Refuting</span>}
            {status && status !== "READY_TO_PUBLISH" && (
              <Badge tone={STATUS_TONE[status] ?? "neutral"}>{STATUS_LABEL[status] ?? status}</Badge>
            )}
          </div>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={onClose}
            aria-label="Close composer"
          >
            ✕
          </button>
        </div>
      )}

      {themeSlot && <div className={styles.themeSlot}>{themeSlot}</div>}

      {textareaEl}

      {footerEl}
    </div>
  );
}
