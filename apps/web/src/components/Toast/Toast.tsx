"use client";

import { useEffect } from "react";
import Link from "next/link";

import { Button } from "@/components/Button/Button";

import styles from "./Toast.module.css";

export type ToastType = "success" | "error" | "info";

export type Toast = {
  id: string;
  type: ToastType;
  message: string;
  action?: {
    label: string;
    href: string;
  };
  duration?: number;
};

type ToastItemProps = {
  toast: Toast;
  onDismiss: (id: string) => void;
};

export function ToastItem({ toast, onDismiss }: ToastItemProps) {
  useEffect(() => {
    const duration = toast.duration ?? 5000;
    if (duration > 0) {
      const timer = setTimeout(() => {
        onDismiss(toast.id);
      }, duration);
      return () => clearTimeout(timer);
    }
  }, [toast.id, toast.duration, onDismiss]);

  return (
    <div className={`${styles.toast} ${styles[toast.type]}`}>
      <div className={styles.content}>
        <p className={styles.message}>{toast.message}</p>
        <div className={styles.actions}>
          {toast.action && (
            <Link href={toast.action.href} className={styles.actionLink}>
              <Button size="sm" variant="secondary">
                {toast.action.label}
              </Button>
            </Link>
          )}
          <button
            className={styles.dismissButton}
            onClick={() => onDismiss(toast.id)}
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}

type ToastContainerProps = {
  toasts: Toast[];
  onDismiss: (id: string) => void;
};

export function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  if (toasts.length === 0) return null;

  return (
    <div className={styles.container}>
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
}
