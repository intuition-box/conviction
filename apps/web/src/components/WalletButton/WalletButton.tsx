"use client";

import { useAccount, useConnect, useDisconnect } from "wagmi";
import { injected } from "wagmi/connectors";
import { Button } from "@/components/Button/Button";

export function WalletButton() {
  const { address, isConnected } = useAccount();
  const { connect } = useConnect();
  const { disconnect } = useDisconnect();

  function handleDisconnect() {
    disconnect();
    fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
  }

  if (isConnected && address) {
    return (
      <Button variant="outline" onClick={handleDisconnect}>
        {address.slice(0, 6)}...{address.slice(-4)}
      </Button>
    );
  }

  return (
    <Button variant="primary" onClick={() => connect({ connector: injected() })}>
      Connect Wallet
    </Button>
  );
}
