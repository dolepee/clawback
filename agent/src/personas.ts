import { runSkill, hashSkillsOutput } from "./skills.js";
import { buildClaim, hashClaimText } from "./claim.js";

export interface Persona {
  name: string;
  faction: "cat" | "lobster";
  bondAmount: bigint;
  unlockPrice: bigint;
  expirySeconds: number;
}

export const PERSONAS: Record<string, Persona> = {
  "cat-scout": {
    name: "CatScout",
    faction: "cat",
    bondAmount: 5_000_000n,
    unlockPrice: 250_000n,
    expirySeconds: 6 * 60 * 60,
  },
  "lobster-rogue": {
    name: "LobsterRogue",
    faction: "lobster",
    bondAmount: 10_000_000n,
    unlockPrice: 500_000n,
    expirySeconds: 6 * 60 * 60,
  },
};

export async function runPersona(personaKey: string, action: string): Promise<void> {
  const persona = PERSONAS[personaKey];
  if (!persona) throw new Error(`Unknown persona: ${personaKey}`);

  if (action !== "post") {
    throw new Error(`Unknown action: ${action}. Supported: post`);
  }

  console.log(`[${persona.name}] composing claim`);
  throw new Error("TODO: integrate runSkill + hashSkillsOutput + hashClaimText + on-chain commit. See docs/SPIKES.md S2 + S5");
}

export { runSkill, hashSkillsOutput, buildClaim, hashClaimText };
