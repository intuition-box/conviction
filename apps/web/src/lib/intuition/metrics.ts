
import { formatEther } from "viem";

import { asNumber } from "@/lib/format/asNumber";
import type { VaultMetrics } from "./types";

export type { VaultMetrics };

export function parseVaultMetrics(vault: {
  total_shares?: string | number | null;
  current_share_price?: string | number | null;
  position_count?: string | number | null;
  market_cap?: string | number | null;
} | null | undefined): VaultMetrics {
  if (!vault) return { holders: null, shares: null, marketCap: null, sharePrice: null };
  const rawShares = asNumber(vault.total_shares ?? null);
  const rawPrice = asNumber(vault.current_share_price ?? null);
  const shares = rawShares !== null ? rawShares / 1e18 : null;
  const sharePrice = rawPrice !== null ? rawPrice / 1e18 : null;
  const rawMc = asNumber(vault.market_cap ?? null);
  const marketCap = rawMc !== null ? rawMc / 1e18 : null;
  const holders = asNumber(vault.position_count ?? null);
  return { holders, shares, marketCap, sharePrice };
}

export type FormatTrustOptions = {
  abbreviated?: boolean;
};

export function formatTrust(wei: bigint | string | number, opts?: FormatTrustOptions): string {
  let weiBig: bigint;
  try {
    if (typeof wei === "bigint") weiBig = wei;
    else if (typeof wei === "number") weiBig = BigInt(Math.trunc(wei));
    else weiBig = BigInt(wei);
  } catch {
    return "—";
  }

  if (weiBig < 0n) return "—";

  const ether = Number(formatEther(weiBig));

  if (ether === 0) return "0 TRUST";
  if (ether < 0.0001) return "<0.0001 TRUST";

  if (opts?.abbreviated && ether >= 1000) {
    if (ether >= 1_000_000) return `${(ether / 1_000_000).toFixed(1)}M TRUST`;
    return `${(ether / 1000).toFixed(1)}k TRUST`;
  }

  if (ether < 1) return `${ether.toFixed(4)} TRUST`;
  return `${ether.toFixed(2)} TRUST`;
}
