"use client";

import { PropsWithChildren, useCallback, useEffect, useRef, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useAccount, useWalletClient, WagmiProvider, createConfig, http } from "wagmi";
import { injected, metaMask } from "wagmi/connectors";

import { intuitionTestnet } from "@/lib/chain";
import { ToastProvider } from "@/components/Toast/ToastContext";
import { useSessionAuth } from "@/features/post/ExtractionWorkspace/hooks/useSessionAuth";

const config = createConfig({
  chains: [intuitionTestnet],
  transports: {
    [intuitionTestnet.id]: http(intuitionTestnet.rpcUrls.default.http[0])
  },
  connectors: [metaMask(), injected()],
  ssr: true
});

function SiweOnConnect() {
  const { isConnected, address } = useAccount();
  const { data: walletClient } = useWalletClient();
  const attemptedRef = useRef<string | null>(null);
  const setMessage = useCallback((_msg: string | null) => {}, []);
  const { ensureSession } = useSessionAuth({ setMessage });

  useEffect(() => {
    if (!isConnected || !address || !walletClient) {
      attemptedRef.current = null;
      return;
    }
    const normalized = address.toLowerCase();
    if (attemptedRef.current === normalized) {
      return;
    }
    attemptedRef.current = normalized;
    void ensureSession();
  }, [isConnected, address, walletClient, ensureSession]);

  return null;
}

export function Providers({ children }: PropsWithChildren) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <SiweOnConnect />
        <ToastProvider>{children}</ToastProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
