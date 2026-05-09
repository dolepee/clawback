import { keccak256, toHex } from "viem";

export interface SkillsOutput {
  skillId: string;
  pair: string;
  observedPrice: string;
  observedTimestamp: number;
  source: string;
  raw: unknown;
}

export async function runSkill(_skillId: string, _params: Record<string, unknown>): Promise<SkillsOutput> {
  throw new Error("TODO S2: wire Byreal Skills CLI. See docs/SPIKES.md");
}

export function hashSkillsOutput(output: SkillsOutput): `0x${string}` {
  const canonical = JSON.stringify(output, Object.keys(output).sort());
  return keccak256(toHex(canonical));
}
