"use client";

import { useEffect, useState } from "react";

import type { MeSummaryResponse } from "@/app/api/me/summary/route";

export function useMySummary() {
  const [summary, setSummary] = useState<MeSummaryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/me/summary", { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as MeSummaryResponse;
        setSummary(data);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Failed to load summary");
      });
    return () => controller.abort();
  }, []);

  return { summary, error };
}
