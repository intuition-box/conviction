"use client";

import type { ReactNode } from "react";
import { X } from "lucide-react";

import styles from "./RightPanel.module.css";

type RightPanelProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
};

export function RightPanel({ open, onClose, title, children }: RightPanelProps) {
  if (!open) return null;

  return (
    <aside className={styles.panel}>
      <div className={styles.header}>
        <h2 className={styles.title}>{title}</h2>
        <button className={styles.closeButton} onClick={onClose} aria-label="Close panel">
          <X size={18} />
        </button>
      </div>
      <div className={styles.body}>{children}</div>
    </aside>
  );
}
