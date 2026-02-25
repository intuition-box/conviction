"use client";

import { useEffect, useRef } from "react";

import { ConnectedConfidenceSlider } from "@/components/ConfidenceSlider/ConnectedConfidenceSlider";

import styles from "./QuickVoteModal.module.css";

type QuickVoteModalProps = {
  tripleTermId: string;
  onClose: () => void;
};

export function QuickVoteModal({ tripleTermId, onClose }: QuickVoteModalProps) {
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [onClose]);

  return (
    <div className={styles.overlay}>
      <div ref={cardRef} className={styles.card}>
        <ConnectedConfidenceSlider tripleTermId={tripleTermId} />
      </div>
    </div>
  );
}
