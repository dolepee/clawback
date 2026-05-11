export const claimMarketAbi = [
  {
    type: "function",
    name: "nextClaimId",
    inputs: [],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "claims",
    inputs: [{ type: "uint256" }],
    outputs: [
      { name: "agentId", type: "uint256" },
      { name: "claimHash", type: "bytes32" },
      { name: "skillsOutputHash", type: "bytes32" },
      { name: "bondAmount", type: "uint256" },
      { name: "unlockPrice", type: "uint256" },
      { name: "expiry", type: "uint64" },
      { name: "publicReleaseAt", type: "uint64" },
      { name: "marketId", type: "uint8" },
      { name: "state", type: "uint8" },
      { name: "revealedClaimText", type: "string" },
    ],
    stateMutability: "view",
  },
  {
    type: "event",
    name: "ClaimCommitted",
    inputs: [
      { name: "claimId", type: "uint256", indexed: true },
      { name: "agentId", type: "uint256", indexed: true },
      { name: "claimHash", type: "bytes32", indexed: false },
      { name: "skillsOutputHash", type: "bytes32", indexed: false },
      { name: "bondAmount", type: "uint256", indexed: false },
      { name: "unlockPrice", type: "uint256", indexed: false },
      { name: "expiry", type: "uint64", indexed: false },
      { name: "publicReleaseAt", type: "uint64", indexed: false },
      { name: "marketId", type: "uint8", indexed: false },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "ClaimPubliclyRevealed",
    inputs: [
      { name: "claimId", type: "uint256", indexed: true },
      { name: "claimText", type: "string", indexed: false },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "ClaimSettled",
    inputs: [
      { name: "claimId", type: "uint256", indexed: true },
      { name: "agentRight", type: "bool", indexed: false },
    ],
    anonymous: false,
  },
] as const;

export const agentRegistryAbi = [
  {
    type: "function",
    name: "nextAgentId",
    inputs: [],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "agents",
    inputs: [{ type: "uint256" }],
    outputs: [
      { name: "owner", type: "address" },
      { name: "handle", type: "string" },
      { name: "faction", type: "uint8" },
      { name: "metadataHash", type: "bytes32" },
      { name: "bondedTotal", type: "uint256" },
      { name: "slashableBonded", type: "uint256" },
      { name: "registered", type: "bool" },
    ],
    stateMutability: "view",
  },
] as const;

export const reputationLedgerAbi = [
  {
    type: "function",
    name: "scores",
    inputs: [{ type: "uint256" }],
    outputs: [
      { name: "wins", type: "uint64" },
      { name: "losses", type: "uint64" },
      { name: "totalBonded", type: "uint256" },
      { name: "totalSlashed", type: "uint256" },
      { name: "totalEarned", type: "uint256" },
      { name: "accuracyBps", type: "uint16" },
    ],
    stateMutability: "view",
  },
] as const;

export const clawbackEscrowAbi = [
  {
    type: "function",
    name: "accounting",
    inputs: [{ type: "uint256" }],
    outputs: [
      { name: "totalPaid", type: "uint256" },
      { name: "bondAtStake", type: "uint256" },
      { name: "slashedBondPool", type: "uint256" },
      { name: "agentId", type: "uint256" },
      { name: "settled", type: "bool" },
      { name: "agentRight", type: "bool" },
      { name: "settlementProof", type: "bytes" },
    ],
    stateMutability: "view",
  },
] as const;

export const FACTION = { CAT: 0, LOBSTER: 1 } as const;
export const CLAIM_STATE = {
  COMMITTED: 0,
  SETTLED: 1,
  PUBLICLY_REVEALED: 2,
} as const;
export const MARKET_ID = {
  MNT_OUTPERFORMS_METH: 0,
  MNT_USDT_THRESHOLD: 1,
} as const;
export const MARKET_LABEL: Record<number, string> = {
  0: "MNT outperforms mETH",
  1: "MNT/USDT threshold",
};
