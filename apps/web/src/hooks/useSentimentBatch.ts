"use client";

import { useEffect, useRef, useState } from "react";
import { useAccount } from "wagmi";
import { fetchJsonWithTimeout } from "@/lib/net/fetchWithTimeout";

/* ── Shared types (import from here everywhere) ─────────────────────── */

export type SentimentData = {
  supportPct: number;       // 0-100 — score by person count (not assets)
  totalParticipants: number;
  forCount: number;
  againstCount: number;
  convictionPct: number;    // forAssets / total assets * 100 (secondary info)
  userDirection: "support" | "oppose" | null;
};

export type SentimentMap = Record<string, SentimentData>;

/* ── Batch API response shape ────────────────────────────────────────── */

type BatchVaultResponse = Record<
  string,
  {
    forAssets: string;
    againstAssets: string;
    forCount: number;
    againstCount: number;
    userDirection?: "support" | "oppose" | null;
  }
>;

/* ── Constants ───────────────────────────────────────────────────────── */

const CHUNK_SIZE = 50;

/* ── Hook ────────────────────────────────────────────────────────────── */

/**
 * Batch-fetch vault aggregate stats for multiple tripleIds.
 * Returns a stable SentimentMap with supportPct + totalParticipants per triple.
 *
 * - Deduplicates IDs
 * - Chunks in batches of 50
 * - Only re-fetches when the set of IDs changes or wallet address changes
 * - Incrementally merges new IDs (doesn't discard old data)
 */
export function useSentimentBatch(tripleIds: string[]): {
  data: SentimentMap;
  loading: boolean;
} {
  const { address } = useAccount();
  const [data, setData] = useState<SentimentMap>({});
  const [loading, setLoading] = useState(false);
  const fetchedRef = useRef<Set<string>>(new Set());
  const abortRef = useRef<AbortController | null>(null);
  const prevAddressRef = useRef<string | undefined>(address);

  // Reset cache when wallet address changes — clear data immediately
  useEffect(() => {
    if (prevAddressRef.current !== address) {
      prevAddressRef.current = address;
      fetchedRef.current = new Set();
      setData({});
    }
  }, [address]);

  useEffect(() => {
    // Find IDs we haven't fetched yet
    const newIds = tripleIds.filter(
      (id) => id && !fetchedRef.current.has(id),
    );

    if (newIds.length === 0) return;

    // Deduplicate
    const unique = [...new Set(newIds)];

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    let cancelled = false;

    (async () => {
      setLoading(true);
      try {
        // Chunk into batches of CHUNK_SIZE
        const chunks: string[][] = [];
        for (let i = 0; i < unique.length; i += CHUNK_SIZE) {
          chunks.push(unique.slice(i, i + CHUNK_SIZE));
        }

        const allResults: BatchVaultResponse = {};

        await Promise.all(
          chunks.map(async (chunk) => {
            try {
              const res = await fetchJsonWithTimeout<BatchVaultResponse>(
                "/api/vaults/batch",
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ tripleIds: chunk, address: address ?? undefined }),
                  signal: controller.signal,
                },
              );
              Object.assign(allResults, res);
            } catch {
              // Individual chunk failure — skip silently
            }
          }),
        );

        if (cancelled) return;

        // Convert raw vault data to sentiment data — score by person count
        const newEntries: SentimentMap = {};
        for (const [tripleId, vault] of Object.entries(allResults)) {
          const totalCount = vault.forCount + vault.againstCount;
          const forAssets = BigInt(vault.forAssets);
          const againstAssets = BigInt(vault.againstAssets);
          const totalAssets = forAssets + againstAssets;

          newEntries[tripleId] = {
            supportPct: totalCount > 0 ? Math.round((vault.forCount / totalCount) * 100) : 50,
            totalParticipants: totalCount,
            forCount: vault.forCount,
            againstCount: vault.againstCount,
            convictionPct: totalAssets > 0n ? Number((forAssets * 100n) / totalAssets) : 50,
            userDirection: vault.userDirection ?? null,
          };
        }

        // Only mark IDs that were actually returned successfully
        // IDs from failed chunks will be re-tried on next render (auto-recovery)
        for (const id of Object.keys(allResults)) {
          fetchedRef.current.add(id);
        }

        setData((prev) => ({ ...prev, ...newEntries }));
      } catch {
        // Aborted or network error — do nothing
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [[...tripleIds].sort().join(","), address]); // eslint-disable-line react-hooks/exhaustive-deps

  return { data, loading };
}
