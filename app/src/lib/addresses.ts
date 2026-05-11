export const MANTLE_SEPOLIA_CHAIN_ID = 5003;

export const RPC_URL =
  process.env.NEXT_PUBLIC_MANTLE_SEPOLIA_RPC_URL ?? "https://rpc.sepolia.mantle.xyz";

export const EXPLORER = "https://sepolia.mantlescan.xyz";

export const ADDRESSES = {
  agentRegistry: "0x0b7B93C0E6591bD415BEDE8B8DCD57171f4A7851",
  claimMarket: "0x8C076c7452E526526De877F86BBb4BA37E027af9",
  clawbackEscrow: "0xEa02e04E9550eA556235B46d10b554b876C16d2a",
  reputationLedger: "0x02aE8215844DC8AA962e44Fd07e537F05241f8E6",
  settlementAdapter: "0x19E3597340b57950D7893b1805c54c81d341C540",
  pythSettlementAdapter: "0x78a138EB1EaB4fAcB0fe982F685AB2B29a8562d3",
  q402Adapter: "0x3Eba0528a19295d0A48EFD4c38DC4100462761aB",
  usdc: "0xaa10CDD12C1a8D8Aa3a14658B7872a7f6d641DDd",
} as const;

export const DEPLOY_BLOCK = 38493730n;
