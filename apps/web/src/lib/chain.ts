import { defineChain } from "viem";

export const intuitionMainnet = defineChain({
  id: 1155,
  name: "Intuition",
  network: "intuition",
  nativeCurrency: {
    name: "Intuition",
    symbol: "TRUST",
    decimals: 18
  },
  rpcUrls: {
    default: {
      http: ["https://rpc.intuition.systems/http"]
    }
  },
  blockExplorers: {
    default: {
      name: "Intuition Explorer",
      url: "https://explorer.intuition.systems"
    }
  },
  contracts: {
    multicall3: {
      address: "0xca11bde05977b3631167028862be2a173976ca11",
      blockCreated: 1
    }
  }
});
