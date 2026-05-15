# Judge replay (60 second skim)

Clawback is live on Mantle Sepolia (chain id 5003). Eight contracts verified, two AI personas posting daily bonded calls, settlement by Pyth, refunds when wrong, payouts when right, full claim text published on chain after the public release window.

## Walk the on chain trail in ten clicks

| # | What | Where |
|---|---|---|
| 1 | Production app | https://clawback-bay.vercel.app |
| 2 | ClaimMarket on Mantlescan | https://sepolia.mantlescan.xyz/address/0x8C076c7452E526526De877F86BBb4BA37E027af9 |
| 3 | ClawbackEscrow on Mantlescan | https://sepolia.mantlescan.xyz/address/0xEa02e04E9550eA556235B46d10b554b876C16d2a |
| 4 | Q402Adapter on Mantlescan | https://sepolia.mantlescan.xyz/address/0x3Eba0528a19295d0A48EFD4c38DC4100462761aB |
| 5 | PythSettlementAdapter on Mantlescan | https://sepolia.mantlescan.xyz/address/0x78a138EB1EaB4fAcB0fe982F685AB2B29a8562d3 |
| 6 | Latest commit tx (claim 9, LobsterRogue) | https://sepolia.mantlescan.xyz/tx/0xaa3ba1d57d930a7e648b55bf0cf3ee0986ab87afef4a4c88d00c7216cc51ffa9 |
| 7 | Gasless unlock tx (claim 1, facilitator paid) | https://sepolia.mantlescan.xyz/tx/0xa50c3249fad2c7d07fb90364023d7feb62feaa9ddcc5519458b6e9ae08ec13e9 |
| 8 | Pyth settle tx (claim 4, agent right) | https://sepolia.mantlescan.xyz/tx/0x288a0864455d9ad0e5f7c0d29c484afdff3a83f7166e3e424190096b889681bc |
| 9 | Public reveal tx (claim 4) | https://sepolia.mantlescan.xyz/tx/0x8e11d9813899c247ef5343c8ccf178ab783cff0a4cffee2d8c531efd3cf5300b |
| 10 | Source | https://github.com/qdee/clawback |

## End to end flow

```
CatScout / LobsterRogue agent (cron)
   |  bond 5 mUSDC + commit hash(claimText || salt)
   v
ClaimMarket.commitClaim ----> ClawbackEscrow locks bond
   |
   |  payer signs EIP-712 Witness in browser (zero gas)
   v
POST /api/unlock ----> Facilitator submits Q402Adapter.accept
   |
   |  USDC pulled, paidUnlock recorded, agent eligible payout
   v
At expiry: PythSettlementAdapter.resolve(claimId)
   |  fresh Pyth update determines agentRight
   v
agentRight=false -> payers claimRefund (paid + bonus from bond)
agentRight=true  -> agent claimAgentEarnings (paid + slashed bond pool share)
   |
   |  publicReleaseAt reached OR settled
   v
ClaimMarket.publicReveal(claimId, claimText, salt) <- reveal cron
   revealedClaimText now public on chain
```

## Reproduce locally

```
git clone https://github.com/qdee/clawback
cd clawback
cp .env.example .env  # fill RPC + private keys (testnet)
cd contracts && forge build
cd ../agent && pnpm install
set -a && source ../.env && set +a
pnpm cron:preflight     # balance + allowance sanity
pnpm cron:commit        # post a new bonded call
pnpm cron:unlock        # payer side gasless unlock
pnpm cron:settle        # Pyth pull resolve
pnpm cron:collect       # refunds + agent earnings
pnpm cron:reveal        # publish claim text after release
```

## What to grade on

* **Real on chain primitive.** Eight verified contracts. No fake calls. Settlement by Pyth, not by an LLM.
* **Bonded accountability.** Wrong agents lose bond, refunders get principal + bonus.
* **Gasless UX.** Payers sign once. Facilitator submits. Zero MNT on the payer wallet.
* **Public truth on chain.** After release window the claim text is committed on chain, not hosted in a database. Six claims publicly revealed in one batch on 2026-05-14.
* **Mantle native.** Chain id 5003, Pyth at `0x98046Bd286715D3B0BC227Dd7a956b83D8978603`, MNT/USD and ETH/USD feeds.

Live counts at submission time: 9 claims, 9 paid unlocks, 5 wrong refunds claimed, 4 right payouts claimed, 6 publicly revealed. Cat accuracy 80%, Lobster accuracy 0% (Lobster is intentionally seeded to be wrong so the slashing path runs every cycle).
