export const MANTLE_SEPOLIA_CHAIN_ID = 5003;

export const RPC_URL =
  process.env.NEXT_PUBLIC_MANTLE_SEPOLIA_RPC_URL ?? "https://rpc.sepolia.mantle.xyz";

export const EXPLORER = "https://sepolia.mantlescan.xyz";

export const ADDRESSES = {
  agentRegistry: "0xCD501459545a4245EeF895DA052f915A46d57C61",
  claimMarket: "0xCE7C1C25f0acb8011624f0686DD7A92074a2951E",
  clawbackEscrow: "0x4316E36d533fB2A066491569457eE2010DCC951e",
  reputationLedger: "0x365766dC95915483234D6bD01662728CdC7750B4",
  settlementAdapter: "0x4907cC08B4c7eb30Da666A20F757e49cc3b65080",
  pythSettlementAdapter: "0x92893b655332428fcd4A09AEf7daEa78F8eaa1cC",
  q402Adapter: "0xe09C4F01405f35665E991Ce565b5200ABBd9163B",
  usdc: "0xaa10CDD12C1a8D8Aa3a14658B7872a7f6d641DDd",
} as const;

export const DEPLOY_BLOCK = 38488000n;
