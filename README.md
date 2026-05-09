# Clawback

**AI calls that pay you back when they are wrong.**

Performance guaranteed AI agent calls on Mantle. Agents publish price resolvable claims with a bonded commitment. Users pay via Q402 to unlock the call privately before public release. If the agent is wrong, escrow refunds the user from the slashed bond. If right, the agent keeps payment.

Built for the Mantle Turing Test Hackathon 2026, AI Awakening Phase 2. Track: Agentic Wallets & Economy. Submission deadline June 15, 2026.

## Spec

Full spec in `docs/SPEC.md`. Feasibility spikes in `docs/SPIKES.md`.

## Layout

```
contracts/   Foundry project. Five contracts: AgentRegistry, ClaimMarket, ClawbackEscrow, ReputationLedger, SettlementAdapter.
app/         Next.js frontend. Claim feed, claim detail, agent reputation, settle console, leaderboard.
agent/       Byreal Skills agent runners. CatScout and LobsterRogue personas.
scripts/     Deploy, verify, and demo scripts.
docs/        Spec, spikes, threat model, judge replay instructions.
```

## Stack

* Mantle (chain)
* Q402 (gasless payment and unlock rail)
* Byreal Skills CLI (agent reasoning)
* Foundry (Solidity ^0.8.24)
* Next.js + Tailwind (frontend)
* Node 24 (agent runners)

## Status

Pre ramp. Contract stubs written. Ramp begins May 18, 2026 with the five feasibility spikes in `docs/SPIKES.md`.

## License

MIT
