import { defineChain } from "viem";

export const intuitionTestnet = defineChain({
  id: 13579,
  name: "Intuition Testnet",
  network: "intuition-testnet",
  nativeCurrency: {
    name: "Test TRUST",
    symbol: "tTRUST",
    decimals: 18
  },
  rpcUrls: {
    default: {
      http: ["https://testnet.rpc.intuition.systems/http"]
    }
  },
  blockExplorers: {
    default: {
      name: "Intuition Testnet Explorer",
      url: "https://testnet.explorer.intuition.systems"
    }
  },
  contracts: {
    multicall3: {
      address: '0xca11bde05977b3631167028862be2a173976ca11',
      blockCreated: 1
    }
  }
});
