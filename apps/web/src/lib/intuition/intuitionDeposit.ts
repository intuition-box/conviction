import type { WriteConfig } from "@0xintuition/sdk";
import { MultiVaultAbi, multiVaultGetGeneralConfig } from "@0xintuition/sdk";
import type { Hex } from "viem";
import { getErrorMessage } from "@/lib/getErrorMessage";

const TERM_ID_RE = /^0x[a-fA-F0-9]{64}$/;

type TermId = `0x${string}`;
type TxHash = `0x${string}`;

function asTermId(value: unknown): TermId | null {
  const s = typeof value === "string" ? value.trim() : "";
  return TERM_ID_RE.test(s) ? (s as TermId) : null;
}

export type DepositToTripleOutcome =
  | { ok: true; termId: TermId; txHash: TxHash; amount: bigint }
  | { ok: false; error: string };

// For AGAINST position, pass calculateCounterTripleId(tripleId) as termId.
export async function depositToTripleMin(params: {
  config: WriteConfig;
  termId: string;
  amount?: bigint;
  curveId?: bigint;
  minShares?: bigint;
}): Promise<DepositToTripleOutcome> {
  try {
    const { config } = params;
    const termId = asTermId(params.termId);
    if (!termId) return { ok: false, error: "Invalid termId." };

    const account = config.walletClient.account?.address;
    if (!account) return { ok: false, error: "Wallet account not found." };

    const generalConfig = await multiVaultGetGeneralConfig({
      address: config.address,
      publicClient: config.publicClient,
    });

    const minDeposit = generalConfig.minDeposit ?? 0n;
    const amount = params.amount ?? minDeposit;
    if (amount <= 0n) return { ok: false, error: "Minimum deposit is not available." };

    const curveId = params.curveId ?? 1n;
    const minShares = params.minShares ?? 0n;

    const { request } = await config.publicClient.simulateContract({
      account: config.walletClient.account,
      address: config.address,
      abi: MultiVaultAbi,
      functionName: "deposit",
      args: [account, termId as Hex, curveId, minShares],
      value: amount,
    });

    const txHash = (await config.walletClient.writeContract(request)) as TxHash;
    const receipt = await config.publicClient.waitForTransactionReceipt({ hash: txHash as Hex });
    if (receipt.status !== "success") {
      return { ok: false, error: "Deposit transaction failed or reverted." };
    }

    return { ok: true, termId, txHash, amount };
  } catch (err: unknown) {
    return { ok: false, error: getErrorMessage(err, String(err)) };
  }
}
