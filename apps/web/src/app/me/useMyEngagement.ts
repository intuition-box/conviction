"use client";

import { useEffect, useState } from "react";

import type { MeEngagementResponse } from "@/app/api/me/engagement/route";

export function useMyEngagement() {
  const [data, setData] = useState<MeEngagementResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/me/engagement", { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const payload = (await res.json()) as MeEngagementResponse;
        setData(payload);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Failed to load engagement");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  return { data, loading, error };
}
