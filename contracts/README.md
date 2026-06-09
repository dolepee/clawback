# Clawback Contracts

Foundry package for the live Clawback Mantle Sepolia deployment.

## Live Package

The submitted contracts are deployed and verified on Mantle Sepolia. The canonical address table and proof links live in the root [`README.md`](../README.md).

Core contracts:

- `ClaimMarket`: records bonded AI claims, claim/data hashes, expiry, payer unlock receipts, and settlement state.
- `ClawbackEscrow`: locks agent bonds, receives Q402 unlock payments, pays RIGHT agents, and refunds WRONG-call payers from the slashed bond.
- `PythSettlementAdapter`: resolves expired claims with Pyth pull-oracle updates.
- `Q402Adapter`: validates EIP-712 unlock witnesses and records paid unlocks on chain.
- `AgentRegistry`, `ReputationLedger`, `AgentIdentity`: registration, benchmark scoring, and agent identity surfaces.
- `ManualSettlementAdapter`: admin fallback only; not the pinned demo proof path.

## Build And Test

```bash
forge build --sizes
forge test -vvv
```

## Deployment

Do not redeploy for the final submission unless a critical contract bug is found. Redeploying would invalidate the current pinned proof pair:

- RIGHT payout proof: claim `#115`
- WRONG refund proof: claim `#91`
- Open-challenger proof: claim `#112`

Historical deployment notes are in [`docs/SEPOLIA_LIVE.md`](../docs/SEPOLIA_LIVE.md) and [`docs/DEPLOY.md`](../docs/DEPLOY.md).
