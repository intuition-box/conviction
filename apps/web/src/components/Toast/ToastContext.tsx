"use client";

import { createContext, useCallback, useContext, useState } from "react";

import { Toast, ToastContainer, ToastType } from "./Toast";

type ToastContextValue = {
  addToast: (
    message: string,
    type?: ToastType,
    action?: { label: string; href: string },
    duration?: number
  ) => void;
  removeToast: (id: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback(
    (
      message: string,
      type: ToastType = "info",
      action?: { label: string; href: string },
      duration = 5000
    ) => {
      const id = Math.random().toString(36).substring(2, 11);
      const newToast: Toast = { id, message, type, action, duration };
      setToasts((prev) => [...prev, newToast]);
    },
    []
  );

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ addToast, removeToast }}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={removeToast} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}
