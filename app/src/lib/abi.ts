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
    name: "getClaim",
    inputs: [{ type: "uint256" }],
    outputs: [
      {
        type: "tuple",
        components: [
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
          { name: "predictionParams", type: "bytes" },
        ],
      },
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
      { name: "predictionParams", type: "bytes", indexed: false },
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
  {
    type: "function",
    name: "paidAmount",
    inputs: [{ type: "address" }, { type: "uint256" }],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "claimableRefund",
    inputs: [{ name: "user", type: "address" }, { name: "claimId", type: "uint256" }],
    outputs: [{ name: "paidBack", type: "uint256" }, { name: "bonus", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "refundClaimed",
    inputs: [{ type: "uint256" }, { type: "address" }],
    outputs: [{ type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "earningsClaimed",
    inputs: [{ type: "uint256" }],
    outputs: [{ type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "claimRefund",
    inputs: [{ name: "claimId", type: "uint256" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "claimAgentEarnings",
    inputs: [{ name: "agentId", type: "uint256" }, { name: "claimId", type: "uint256" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const;

export const q402AdapterAbi = [
  {
    type: "function",
    name: "accept",
    inputs: [
      {
        name: "w",
        type: "tuple",
        components: [
          { name: "owner", type: "address" },
          { name: "claimId", type: "uint256" },
          { name: "amount", type: "uint256" },
          { name: "deadline", type: "uint256" },
          { name: "paymentId", type: "bytes32" },
          { name: "nonce", type: "uint256" },
        ],
      },
      { name: "sig", type: "bytes" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "nonceUsed",
    inputs: [{ type: "address" }, { type: "uint256" }],
    outputs: [{ type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "domainSeparator",
    inputs: [],
    outputs: [{ type: "bytes32" }],
    stateMutability: "view",
  },
] as const;

export const erc20Abi = [
  {
    type: "function",
    name: "balanceOf",
    inputs: [{ type: "address" }],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "allowance",
    inputs: [{ type: "address" }, { type: "address" }],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "approve",
    inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }],
    outputs: [{ type: "bool" }],
    stateMutability: "nonpayable",
  },
] as const;

export const pythAdapterAbi = [
  {
    type: "function",
    name: "resolve",
    inputs: [
      { name: "claimId", type: "uint256" },
      { name: "params", type: "bytes" },
    ],
    outputs: [
      { name: "agentRight", type: "bool" },
      { name: "proof", type: "bytes" },
    ],
    stateMutability: "payable",
  },
] as const;

export const pythAbi = [
  {
    type: "function",
    name: "getUpdateFee",
    inputs: [{ name: "updateData", type: "bytes[]" }],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
] as const;

export const paidUnlockAbi = [
  {
    type: "function",
    name: "paidUnlock",
    inputs: [{ type: "uint256" }, { type: "address" }],
    outputs: [{ type: "bool" }],
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
