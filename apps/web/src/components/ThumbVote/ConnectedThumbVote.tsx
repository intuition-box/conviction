"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAccount, useChainId, usePublicClient, useSwitchChain, useWalletClient } from "wagmi";
import { getMultiVaultAddressFromChainId } from "@0xintuition/sdk";

import { ThumbVote } from "./ThumbVote";
import { intuitionTestnet } from "@/lib/chain";
import { voteOnTriple } from "@/lib/intuition/intuitionVote";
import { fetchJsonWithTimeout } from "@/lib/net/fetchWithTimeout";
import { useToast } from "@/components/Toast/ToastContext";
import type { SentimentData } from "@/hooks/useSentimentBatch";

/* ── Types ───────────────────────────────────────────────────────────── */

type FullVaultResponse = {
  vault: {
    for: { totalAssets: string; positionCount: number };
    against: { totalAssets: string; positionCount: number };
  };
  userPosition: {
    sharesFor: string;
    sharesAgainst: string;
    direction: "FOR" | "AGAINST" | null;
  } | null;
};

type ConnectedThumbVoteProps = {
  tripleTermId: string;
  counterTermId?: string | null;
  sentimentData?: SentimentData | null;
  size?: "sm" | "md";
  onVoteSuccess?: () => void;
};

/* ── Component ───────────────────────────────────────────────────────── */

export function ConnectedThumbVote({
  tripleTermId,
  counterTermId = null,
  sentimentData = null,
  size = "sm",
  onVoteSuccess,
}: ConnectedThumbVoteProps) {
  const { isConnected, address } = useAccount();
  const chainId = useChainId();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  const { switchChainAsync } = useSwitchChain();
  const { addToast } = useToast();

  // Local state (from sentimentData or fallback fetch)
  const [forCount, setForCount] = useState(sentimentData?.forCount ?? 0);
  const [againstCount, setAgainstCount] = useState(sentimentData?.againstCount ?? 0);
  const [userDirection, setUserDirection] = useState<"support" | "oppose" | null>(sentimentData?.userDirection ?? null);
  const [busy, setBusy] = useState(false);
  const [busyDirection, setBusyDirection] = useState<"support" | "oppose" | null>(null);
  const [fallbackLoading, setFallbackLoading] = useState(false);

  // Cached minDeposit (lazy-loaded on first vote)
  const minDepositRef = useRef<bigint | null>(null);
  const prevAddressRef = useRef<string | undefined>(address);

  const correctChain = chainId === intuitionTestnet.id;

  // ── Sync from sentimentData props ──
  useEffect(() => {
    if (sentimentData) {
      setForCount(sentimentData.forCount);
      setAgainstCount(sentimentData.againstCount);
      setUserDirection(sentimentData.userDirection);
    }
  }, [sentimentData]);

  // ── Wallet change: reset direction immediately, then refetch if in fallback mode ──
  useEffect(() => {
    if (prevAddressRef.current !== address) {
      prevAddressRef.current = address;
      setUserDirection(null);
      if (!sentimentData) {
        fetchFallbackData();
      }
    }
  }, [address]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Fallback fetch (when sentimentData not provided — e.g. Inspector) ──
  const fetchFallbackData = useCallback(async () => {
    setFallbackLoading(true);
    try {
      const url = address
        ? `/api/vaults/${tripleTermId}?address=${address}`
        : `/api/vaults/${tripleTermId}`;
      const data = await fetchJsonWithTimeout<FullVaultResponse>(url, { cache: "no-store" });

      setForCount(data.vault.for.positionCount);
      setAgainstCount(data.vault.against.positionCount);

      const pos = data.userPosition;
      if (pos) {
        const hasFor = BigInt(pos.sharesFor) > 0n;
        const hasAgainst = BigInt(pos.sharesAgainst) > 0n;
        if (hasFor) setUserDirection("support");
        else if (hasAgainst) setUserDirection("oppose");
        else setUserDirection(null);
      } else {
        setUserDirection(null);
      }
    } catch {
      // Keep previous values
    } finally {
      setFallbackLoading(false);
    }
  }, [tripleTermId, address]);

  // ── Initial fallback fetch ──
  useEffect(() => {
    if (!sentimentData) {
      fetchFallbackData();
    }
  }, [sentimentData, fetchFallbackData]);

  // ── Lazy-load minDeposit ──
  async function ensureMinDeposit(): Promise<bigint | null> {
    if (minDepositRef.current !== null) return minDepositRef.current;
    try {
      const config = await fetchJsonWithTimeout<{ minDeposit: string }>("/api/intuition/config");
      minDepositRef.current = BigInt(config.minDeposit);
      return minDepositRef.current;
    } catch {
      return null;
    }
  }

  // ── Vote handler ──
  async function handleVote(direction: "support" | "oppose") {
    if (!isConnected) {
      addToast("Connect wallet to vote", "info");
      return;
    }

    if (userDirection === direction) return; // already voted this way

    if (!walletClient || !publicClient) return;

    setBusy(true);
    setBusyDirection(direction);

    // Switch chain if needed
    if (!correctChain) {
      try {
        await switchChainAsync({ chainId: intuitionTestnet.id });
      } catch {
        addToast("Failed to switch network", "error");
        setBusy(false);
        setBusyDirection(null);
        return;
      }
    }

    const minDeposit = await ensureMinDeposit();
    if (minDeposit === null) {
      addToast("Failed to load config", "error");
      setBusy(false);
      setBusyDirection(null);
      return;
    }

    // Optimistic update
    const prevFor = forCount;
    const prevAgainst = againstCount;
    const prevDirection = userDirection;

    if (direction === "support") setForCount((c) => c + 1);
    else setAgainstCount((c) => c + 1);
    setUserDirection(direction);

    const addr = getMultiVaultAddressFromChainId(intuitionTestnet.id);
    const result = await voteOnTriple({
      config: { walletClient, publicClient, address: addr },
      tripleTermId,
      counterTermId,
      direction,
      amount: minDeposit,
      curveId: 1n,
    });

    if (result.ok) {
      onVoteSuccess?.();
    } else if (result.error?.includes("HasCounterStake")) {
      // Revert optimistic update
      setForCount(prevFor);
      setAgainstCount(prevAgainst);
      setUserDirection(prevDirection);
      addToast("Withdraw opposing position first", "error");
    } else {
      // Revert optimistic update
      setForCount(prevFor);
      setAgainstCount(prevAgainst);
      setUserDirection(prevDirection);
      addToast(result.error ?? "Vote failed", "error");
    }

    setBusy(false);
    setBusyDirection(null);
  }

  return (
    <ThumbVote
      forCount={fallbackLoading ? 0 : forCount}
      againstCount={fallbackLoading ? 0 : againstCount}
      userDirection={userDirection}
      onVote={handleVote}
      busy={busy}
      busyDirection={busyDirection}
      disabled={fallbackLoading}
      size={size}
    />
  );
}
