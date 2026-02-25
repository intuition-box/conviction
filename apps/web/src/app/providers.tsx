"use client";

import { PropsWithChildren, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider, createConfig, http } from "wagmi";
import { injected, metaMask } from "wagmi/connectors";

import { intuitionTestnet } from "@/lib/chain";
import { ToastProvider } from "@/components/Toast/ToastContext";

const config = createConfig({
  chains: [intuitionTestnet],
  transports: {
    [intuitionTestnet.id]: http(intuitionTestnet.rpcUrls.default.http[0])
  },
  connectors: [metaMask(), injected()],
  ssr: true
});

export function Providers({ children }: PropsWithChildren) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>{children}</ToastProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
