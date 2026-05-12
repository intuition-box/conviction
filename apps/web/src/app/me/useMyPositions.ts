"use client";

import { useCallback, useEffect, useState } from "react";

import type { MePositionListItem, MePositionsResponse } from "@/app/api/me/positions/route";

const PAGE_SIZE = 20;

export function useMyPositions() {
  const [positions, setPositions] = useState<MePositionListItem[]>([]);
  const [totalValueTrust, setTotalValueTrust] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPage = useCallback(
    async (offset: number, signal?: AbortSignal): Promise<MePositionsResponse> => {
      const params = new URLSearchParams({
        offset: String(offset),
        limit: String(PAGE_SIZE),
      });
      const res = await fetch(`/api/me/positions?${params.toString()}`, { signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as MePositionsResponse;
    },
    [],
  );

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetchPage(0, controller.signal)
      .then((data) => {
        setPositions(data.positions);
        setTotalValueTrust(data.totalValueTrust);
        setHasMore(data.hasMore);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Failed to load positions");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [fetchPage]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const data = await fetchPage(positions.length);
      setPositions((prev) => [...prev, ...data.positions]);
      setHasMore(data.hasMore);
      // total is null on subsequent pages — keep cached value
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load more");
    } finally {
      setLoadingMore(false);
    }
  }, [fetchPage, positions.length, loadingMore, hasMore]);

  return { positions, totalValueTrust, hasMore, loading, loadingMore, error, loadMore };
}
