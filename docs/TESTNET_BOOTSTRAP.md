# Testnet bootstrap (Mantle Sepolia)

End-to-end walk-through for getting the Clawback agents posting commit-reveal claims on Mantle Sepolia. Plain language, copy-paste safe.

## 1. Wallets you will need

You can use any EVM wallet (MetaMask, Rabby, Coinbase Wallet, Trust). Mantle Sepolia is just an EVM chain, chainId `5003`. Easiest path is to generate fresh keys with Foundry so you can script everything.

**Five roles, one private key each. Do not reuse mainnet keys, these are throwaway.**

| Role | Env name | What it does |
|---|---|---|
| Deployer | `DEPLOYER_PRIVATE_KEY` | Broadcasts the contract bundle once, then mints MockUSDC |
| CatScout agent | `CATSCOUT_PRIVATE_KEY` | Cat faction persona, registers + posts the bullish MNT claim |
| LobsterRogue agent | `LOBSTERROGUE_PRIVATE_KEY` | Lobster faction persona, registers + posts the bearish mETH claim |
| Payer | `PAYER_PRIVATE_KEY` | Reader who pays 0.25 USDC to unlock a claim, signs the Q402 witness |
| Facilitator | `FACILITATOR_PRIVATE_KEY` | Submits the witness on chain, pays gas (could be the frontend backend) |

Generate them all in one go:

```bash
for role in DEPLOYER CATSCOUT LOBSTERROGUE PAYER FACILITATOR; do
  echo "$role"
  cast wallet new
done
```

Save each address + private key into `.env` next to the role name. Example:

```
DEPLOYER_PRIVATE_KEY=0xabc...
CATSCOUT_PRIVATE_KEY=0xdef...
LOBSTERROGUE_PRIVATE_KEY=0x123...
PAYER_PRIVATE_KEY=0x456...
FACILITATOR_PRIVATE_KEY=0x789...
```

Add Mantle Sepolia to your wallet UI for inspection:

* **Network name:** Mantle Sepolia
* **RPC URL:** https://rpc.sepolia.mantle.xyz
* **Chain ID:** 5003
* **Currency symbol:** MNT
* **Block explorer:** https://sepolia.mantlescan.xyz

## 2. Faucet the deployer + agents

Each wallet that broadcasts a tx needs MNT. Live Mantle Sepolia base fee is 50 gwei (verified 2026-05-10), so the full bundle (11.3M gas) costs **0.567 MNT** at minimum.

**Faucets (stack at least three):**

| Faucet | Drip size | Auth | Notes |
|---|---|---|---|
| https://faucet.sepolia.mantle.xyz | 0.1 MNT | wallet connect | rate limited per address per day |
| https://faucet.quicknode.com/mantle/sepolia | 0.1 to 0.5 MNT | X / GitHub login | larger drip if you log in |
| https://thirdweb.com/mantle-sepolia-testnet | 0.05 to 0.1 MNT | GitHub | small but reliable |
| Mantle Discord (`#faucet` channel, https://discord.gg/mantlenetwork) | up to 1 MNT | Discord verify | slowest but biggest, ask politely with your address |

Stacking the official + QuickNode + thirdweb usually clears 0.6 to 1 MNT for the deployer in one sitting.

**Targets:**

* Deployer: `>= 0.6 MNT` (full deploy 0.567 MNT + a few mints).
* CatScout, LobsterRogue: `>= 0.1 MNT` each (register + commit + future reveal).
* Facilitator: `>= 0.1 MNT` (submits Q402 witnesses).
* Payer: zero gas needed. Q402 path is sign-only off chain.

Verify balances:

```bash
for k in DEPLOYER CATSCOUT LOBSTERROGUE PAYER FACILITATOR; do
  addr=$(cast wallet address --private-key ${!k}_PRIVATE_KEY 2>/dev/null)
  bal=$(cast balance "$addr" --rpc-url https://rpc.sepolia.mantle.xyz)
  echo "$k $addr $bal"
done
```

## 3. Deploy the contract bundle

From the repo root:

```bash
cd contracts
DEPLOYER_PRIVATE_KEY=0x... \
forge script script/Deploy.s.sol \
  --rpc-url https://rpc.sepolia.mantle.xyz \
  --broadcast \
  -vvv
```

The script will:

1. Deploy MockUSDC (no canonical USDC on Mantle Sepolia).
2. Deploy AgentRegistry, ClaimMarket, ClawbackEscrow, ReputationLedger, ManualSettlementAdapter, Q402Adapter.
3. Wire all module pointers (`registry.setEscrow`, `escrow.configure`, `market.configure`, etc).

Capture the seven addresses from the console output, append to `.env`:

```
AGENT_REGISTRY=0x...
CLAIM_MARKET=0x...
CLAWBACK_ESCROW=0x...
REPUTATION_LEDGER=0x...
SETTLEMENT_ADAPTER=0x...
Q402_ADAPTER=0x...
USDC_ADDRESS=0x...
MANTLE_SEPOLIA_RPC_URL=https://rpc.sepolia.mantle.xyz
MANTLE_RPC_URL=https://rpc.mantle.xyz
```

`MANTLE_RPC_URL` (mainnet) is used by the skills reader, since the live Merchant Moe pools that observe MNT/mETH price live on Mantle mainnet. Commits still happen on Sepolia.

## 4. Mint mUSDC into the agent wallets

Each agent persona must hold enough mUSDC to cover its bond.

* CatScout bond: 5,000,000 (= 5 mUSDC at 6 decimals)
* LobsterRogue bond: 10,000,000 (= 10 mUSDC)

Anyone can call `MockUSDC.mint(address,uint256)` since it is a hackathon mock.

```bash
CATSCOUT_ADDR=$(cast wallet address --private-key $CATSCOUT_PRIVATE_KEY)
LOBSTER_ADDR=$(cast wallet address --private-key $LOBSTERROGUE_PRIVATE_KEY)
PAYER_ADDR=$(cast wallet address --private-key $PAYER_PRIVATE_KEY)

cast send $USDC_ADDRESS \
  "mint(address,uint256)" $CATSCOUT_ADDR 50000000 \
  --rpc-url $MANTLE_SEPOLIA_RPC_URL \
  --private-key $DEPLOYER_PRIVATE_KEY

cast send $USDC_ADDRESS \
  "mint(address,uint256)" $LOBSTER_ADDR 50000000 \
  --rpc-url $MANTLE_SEPOLIA_RPC_URL \
  --private-key $DEPLOYER_PRIVATE_KEY

cast send $USDC_ADDRESS \
  "mint(address,uint256)" $PAYER_ADDR 10000000 \
  --rpc-url $MANTLE_SEPOLIA_RPC_URL \
  --private-key $DEPLOYER_PRIVATE_KEY
```

10 mUSDC for the payer covers ~40 unlocks at 0.25 each.

## 5. Register the agents

```bash
cd ../agent
pnpm install
pnpm tsx src/index.ts cat-scout register
pnpm tsx src/index.ts lobster-rogue register
```

Each call:

* Reads `agentIdByOwner` to skip if already registered.
* Otherwise calls `AgentRegistry.registerAgent(handle, faction, metadataHash)`.
* Logs `agentId` plus tx hash.

You can verify on the explorer or via:

```bash
cast call $AGENT_REGISTRY "agentIdByOwner(address)(uint256)" $CATSCOUT_ADDR \
  --rpc-url $MANTLE_SEPOLIA_RPC_URL
```

## 6. Post a claim

```bash
pnpm tsx src/index.ts cat-scout post
```

This will:

1. Read both Merchant Moe LB pools on Mantle mainnet, derive MNT per mETH.
2. Compute the canonical `skillsOutputHash`.
3. Build the claim text from the persona template, generate a random salt, hash it.
4. Approve `CLAWBACK_ESCROW` to pull the bond from the agent's mUSDC if not already approved.
5. Call `ClaimMarket.commitClaim(...)` on Mantle Sepolia.
6. Print `claimId`, `claimHash`, `skillsOutputHash`, and the **reveal salt**.

**Save the reveal salt.** It is required by `publicReveal` after the public release window opens. The terminal output is the only copy.

Example final block:

```
[CatScout] CLAIM POSTED
  claimId:           1
  bond locked:       5000000 USDC (6 decimals)
  unlock price:      250000 USDC
  expiry:            2026-05-10T18:30:00.000Z
  publicReleaseAt:   2026-05-11T12:30:00.000Z
  claimHash:         0xabc...
  skillsOutputHash:  0xdef...
  reveal salt:       123456789012345  (KEEP THIS, needed for publicReveal)

  explorer: https://sepolia.mantlescan.xyz/tx/0x...
```

## 7. (Optional) Pay to unlock

This currently runs through the spike script:

```bash
PAYER_PRIVATE_KEY=0x... \
FACILITATOR_PRIVATE_KEY=0x... \
pnpm spike:s1
```

It signs the EIP-712 witness with the payer key (no gas), the facilitator submits, mUSDC moves into escrow, the payer's claim payment is recorded.

For the full hackathon flow, the frontend will replace this script: a connected payer signs the witness in the browser, the backend (or a public facilitator) calls `Q402Adapter.accept`.

## 8. (Optional) Settle and reveal

Once a claim's expiry has passed, the admin (deployer for the manual adapter) calls:

```bash
# agent right
cast send $SETTLEMENT_ADAPTER \
  "resolve(uint256,bytes)" 1 0x$(cast abi-encode "f(bool,bytes)" true 0x) \
  --rpc-url $MANTLE_SEPOLIA_RPC_URL \
  --private-key $DEPLOYER_PRIVATE_KEY

# then anyone can reveal once publicReleaseAt is reached
cast send $CLAIM_MARKET \
  "publicReveal(uint256,string,uint256)" 1 "<exact original claim text>" <salt> \
  --rpc-url $MANTLE_SEPOLIA_RPC_URL \
  --private-key $DEPLOYER_PRIVATE_KEY
```

Agent claims earnings (right path):

```bash
cast send $CLAWBACK_ESCROW \
  "claimAgentEarnings(uint256,uint256)" $AGENT_ID $CLAIM_ID \
  --rpc-url $MANTLE_SEPOLIA_RPC_URL \
  --private-key $CATSCOUT_PRIVATE_KEY
```

Payer claims refund + bonus (wrong path):

```bash
cast send $CLAWBACK_ESCROW \
  "claimRefund(uint256)" $CLAIM_ID \
  --rpc-url $MANTLE_SEPOLIA_RPC_URL \
  --private-key $PAYER_PRIVATE_KEY
```

## Troubleshooting

* **`missing env: ...`** from the persona script. Source your `.env` (`set -a; source .env; set +a`) or pass inline.
* **`agent not registered`** when posting. Run `cat-scout register` first.
* **`need at least N USDC for bond`**. Mint more mUSDC to the agent address (step 4).
* **`getActiveId` reverts during `runSkill`**. The mainnet RPC rate limited or the pool address moved. Try a different RPC, e.g. `MANTLE_RPC_URL=https://mantle-rpc.publicnode.com`.
* **`replacement transaction underpriced`**. Wait one block, retry. Foundry sometimes resends nonces aggressively.

## Quick checklist

```
[ ] 5 wallets generated, .env populated
[ ] Deployer + 2 agents + facilitator faucet'd to >= 0.05 MNT
[ ] Deploy.s.sol broadcast, 7 addresses captured
[ ] mUSDC minted to CatScout, LobsterRogue, Payer
[ ] cat-scout register + lobster-rogue register
[ ] cat-scout post (claimId, salt saved somewhere safe)
[ ] (optional) S1 spike for unlock flow
```

When this checklist is green, you have a live, testnet-broadcastable Clawback instance ready for the frontend to point at.
