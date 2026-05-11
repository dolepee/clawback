export const MANTLE_SEPOLIA_CHAIN_ID = 5003;

export const RPC_URL =
  process.env.NEXT_PUBLIC_MANTLE_SEPOLIA_RPC_URL ?? "https://rpc.sepolia.mantle.xyz";

export const EXPLORER = "https://sepolia.mantlescan.xyz";

export const ADDRESSES = {
  agentRegistry: "0x734c3037AEb58E5B60338C74318224bb5Dd70DB8",
  claimMarket: "0xb4726194AEDA8677d2504b1c3B38bbA653cEDaEd",
  clawbackEscrow: "0x02e5A959253588D3ef5370fE7A8fdA990AD27B3e",
  reputationLedger: "0xDbf0Ff11961F579549a2FfC5Da67A06566ad0Eb9",
  settlementAdapter: "0xAbA92B00871C8fE5975d297419109780D010444E",
  q402Adapter: "0xF8fE1d95f0C3F2aF70fB2663c5989CCeD38Ee83d",
  usdc: "0xaa10CDD12C1a8D8Aa3a14658B7872a7f6d641DDd",
} as const;

export const DEPLOY_BLOCK = 38481700n;
