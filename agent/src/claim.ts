import { encodePacked, keccak256 } from "viem";

export interface Claim {
  agentId: bigint;
  marketId: number;
  claimText: string;
  salt: bigint;
  bondAmount: bigint;
  unlockPrice: bigint;
  expiry: number;
  publicReleaseAt: number;
  skillsOutputHash: `0x${string}`;
}

export function hashClaimText(claimText: string, salt: bigint): `0x${string}` {
  return keccak256(encodePacked(["string", "uint256"], [claimText, salt]));
}

export function buildClaim(input: Omit<Claim, "salt"> & { salt?: bigint }): Claim {
  const salt = input.salt ?? BigInt(Math.floor(Math.random() * 1e18));
  return { ...input, salt };
}
