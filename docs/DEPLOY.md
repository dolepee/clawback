# Deploy runbook

## Mantle Sepolia testnet

**Prereqs:**

* Foundry installed (`forge --version` works).
* A funded Mantle Sepolia EOA. Faucets:
  - https://faucet.sepolia.mantle.xyz
  - https://faucet.quicknode.com/mantle/sepolia
* `~0.6 MNT` minimum for the full bundle (5,702,345 gas at 100 gwei estimated 2026-05-10).

**One-shot deploy (auto-deploys MockUSDC since no real USDC on Mantle Sepolia):**

```bash
cd contracts
DEPLOYER_PRIVATE_KEY=0x... \
forge script script/Deploy.s.sol \
  --rpc-url https://rpc.sepolia.mantle.xyz \
  --broadcast \
  -vvv
```

**Deploy with a pre-existing USDC (mainnet path):**

```bash
DEPLOYER_PRIVATE_KEY=0x... \
USDC_ADDRESS=0x... \
forge script script/Deploy.s.sol \
  --rpc-url https://rpc.mantle.xyz \
  --broadcast \
  -vvv
```

**After successful broadcast, capture addresses into `.env`:**

```
AGENT_REGISTRY=0x...
CLAIM_MARKET=0x...
CLAWBACK_ESCROW=0x...
REPUTATION_LEDGER=0x...
SETTLEMENT_ADAPTER=0x...
Q402_ADAPTER=0x...
USDC_ADDRESS=0x...
```

**Verify on explorer:** https://sepolia.mantlescan.xyz (testnet) or https://mantlescan.xyz (mainnet).

## Post-deploy spike runs

**S1 Q402 hello world:**

```bash
cd agent
PAYER_PRIVATE_KEY=0x... \
FACILITATOR_PRIVATE_KEY=0x... \
Q402_ADAPTER=0x... \
USDC_ADDRESS=0x... \
CLAWBACK_ESCROW=0x... \
MANTLE_SEPOLIA_RPC_URL=https://rpc.sepolia.mantle.xyz \
pnpm spike:s1
```

The payer wallet must already have `mUSDC` (mint via `MockUSDC.mint(payer, 100_000_000)`) and have approved the Q402 adapter for at least 1 USDC.

**S2 Skills hello world (mainnet RPC, no broadcast):**

```bash
cd agent
pnpm tsx src/spikes/s2-skills.ts
```

Reads Merchant Moe Liquidity Book pools live, prints SkillsOutput JSON + hash.

## Mainnet considerations

* Real USDC on Mantle mainnet: TBD — confirm the canonical Circle deployment before mainnet broadcast.
* Pyth contract for settlement: `0xA2aa501b19aff244D90cc15a4Cf739D2725B5729`.
* Merchant Moe pools used by `runSkill`:
  - WMNT/USDT: `0x365722f12ceb2063286a268b03c654df81b7c00f`
  - mETH/USDT: `0x3f0047606dcad6177c13742f1854fc8c999cd2b6`
