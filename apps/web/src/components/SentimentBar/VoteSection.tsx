"use client";

import { useCallback, useEffect, useState } from "react";
import { useAccount } from "wagmi";

import { SentimentBar } from "./SentimentBar";
import { ConnectedConfidenceSlider } from "@/components/ConfidenceSlider/ConnectedConfidenceSlider";
import { fetchJsonWithTimeout } from "@/lib/net/fetchWithTimeout";

import styles from "./VoteSection.module.css";

/* ── Vault response (same shape as /api/vaults/[tripleId]) ──────────── */

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

/* ── Props ───────────────────────────────────────────────────────────── */

type VoteSectionProps = {
  tripleTermId: string;
  counterTermId?: string | null;
};

/* ── Component ───────────────────────────────────────────────────────── */

export function VoteSection({ tripleTermId, counterTermId = null }: VoteSectionProps) {
  const { address } = useAccount();

  const [mode, setMode] = useState<"bar" | "slider">("bar");
  const [loading, setLoading] = useState(true);
  const [supportPct, setSupportPct] = useState(50);
  const [totalParticipants, setTotalParticipants] = useState(0);
  const [forCount, setForCount] = useState(0);
  const [againstCount, setAgainstCount] = useState(0);
  const [userDirection, setUserDirection] = useState<"support" | "oppose" | null>(null);

  const fetchVaultData = useCallback(async () => {
    setLoading(true);
    try {
      const url = address
        ? `/api/vaults/${tripleTermId}?address=${address}`
        : `/api/vaults/${tripleTermId}`;

      const data = await fetchJsonWithTimeout<FullVaultResponse>(url, { cache: "no-store" });

      // Score by person count (not assets)
      const fc = data.vault.for.positionCount;
      const ac = data.vault.against.positionCount;
      const totalCount = fc + ac;

      setSupportPct(totalCount > 0 ? Math.round((fc / totalCount) * 100) : 50);
      setTotalParticipants(totalCount);
      setForCount(fc);
      setAgainstCount(ac);

      // Map FOR/AGAINST → support/oppose
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
      // Keep previous values on error
    } finally {
      setLoading(false);
    }
  }, [tripleTermId, address]);

  useEffect(() => {
    fetchVaultData();
  }, [fetchVaultData]);

  const handleVoteSuccess = useCallback(() => {
    // Switch back to bar mode and refetch with loading state
    setMode("bar");
    fetchVaultData();
  }, [fetchVaultData]);

  if (mode === "slider") {
    return (
      <div className={styles.wrapper}>
        <ConnectedConfidenceSlider
          tripleTermId={tripleTermId}
          counterTermId={counterTermId}
          onVoteSuccess={handleVoteSuccess}
          onBack={() => setMode("bar")}
        />
      </div>
    );
  }

  return (
    <div className={styles.wrapper}>
      <SentimentBar
        supportPct={supportPct}
        totalParticipants={totalParticipants}
        userDirection={userDirection}
        onVoteClick={() => setMode("slider")}
        loading={loading}
        forCount={forCount}
        againstCount={againstCount}
      />
    </div>
  );
}
