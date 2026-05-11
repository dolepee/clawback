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

export const publicClient = createPublicClient({
  chain: mantleSepolia,
  transport: http(RPC_URL, { batch: true }),
});
