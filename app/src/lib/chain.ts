import { createPublicClient, defineChain, http } from "viem";
import { MANTLE_SEPOLIA_CHAIN_ID, RPC_URL } from "./addresses";

export const mantleSepolia = defineChain({
  id: MANTLE_SEPOLIA_CHAIN_ID,
  name: "Mantle Sepolia",
  nativeCurrency: { name: "Mantle", symbol: "MNT", decimals: 18 },
  rpcUrls: {
    default: { http: [RPC_URL] },
  },
  blockExplorers: {
    default: { name: "Mantlescan", url: "https://sepolia.mantlescan.xyz" },
  },
  testnet: true,
});

// Mantle Sepolia public RPC is intermittent under load. Retry transient
// failures before bubbling them up to the Next page render.
export const publicClient = createPublicClient({
  chain: mantleSepolia,
  // Cheap retry: 2 attempts, short delay. Enough to ride out a single
  // transient flake, not enough to bust the 10s serverless budget.
  transport: http(RPC_URL, {
    batch: true,
    retryCount: 2,
    retryDelay: 200,
    timeout: 6_000,
  }),
});
