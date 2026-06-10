"use client";

import { useState } from "react";
import Link from "next/link";
import {
  encodePacked,
  encodeAbiParameters,
  keccak256,
  parseEventLogs,
  toHex,
  type Hex,
} from "viem";
import { ADDRESSES, EXPLORER } from "@/lib/addresses";
import { agentRegistryAbi, claimMarketAbi, erc20Abi, MARKET_ID } from "@/lib/abi";
import { publicClient, useWallet } from "@/lib/wallet";
import { shortHex } from "@/lib/format";

const BOND_AMOUNT = 1_000_000n; // 1 mUSDC
const UNLOCK_PRICE = 100_000n; // 0.10 mUSDC
const MINT_BUFFER = 2_000_000n; // enough for a few demo attempts

type StepState = "idle" | "pending" | "done" | "skipped" | "error";
type StepId = "registry" | "fund" | "approve" | "commit";

const CHALLENGE_STEPS: Array<{
  id: StepId;
  title: string;
  body: string;
  freshWallet: boolean;
}> = [
  {
    id: "registry",
    title: "Register challenger",
    body: "One-time identity entry in the AgentRegistry. Returning wallets skip it.",
    freshWallet: true,
  },
  {
    id: "fund",
    title: "Fund test bond",
    body: "Mint test mUSDC only if your testnet balance is below the required bond.",
    freshWallet: true,
  },
  {
    id: "approve",
    title: "Approve escrow",
    body: "Allow Clawback to lock exactly the bonded stake for this call.",
    freshWallet: true,
  },
  {
    id: "commit",
    title: "Commit prediction",
    body: "Post the sealed call on Mantle. Pyth can settle it after expiry.",
    freshWallet: false,
  },
];

const INITIAL_STEPS = Object.fromEntries(
  CHALLENGE_STEPS.map((step) => [step.id, "idle" as StepState]),
) as Record<StepId, StepState>;

function randomSalt(): bigint {
  const arr = new Uint32Array(2);
  crypto.getRandomValues(arr);
  return (BigInt(arr[0]) << 32n) + BigInt(arr[1]);
}

function txLink(hash: Hex) {
  return (
    <a href={`${EXPLORER}/tx/${hash}`} target="_blank" rel="noreferrer" className="tx-link">
      {shortHex(hash, 6, 4)} ↗
    </a>
  );
}

function cleanHandle(input: string, account?: Hex | null): string {
  const fallback = account ? `Challenger-${account.slice(2, 6)}` : "Challenger";
  const stripped = input.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 24);
  return stripped || fallback;
}

export function ChallengerEntry() {
  const { account, installed, onCorrectChain, connect, switchToMantleSepolia, walletClient } = useWallet();
  const [handle, setHandle] = useState("");
  const [direction, setDirection] = useState<"above" | "below">("above");
  const [threshold, setThreshold] = useState("0.60");
  const [hours, setHours] = useState("6");
  const [status, setStatus] = useState<StepState>("idle");
  const [message, setMessage] = useState<string>("Ready to create a challenger entry.");
  const [txs, setTxs] = useState<Array<{ label: string; hash: Hex }>>([]);
  const [claimId, setClaimId] = useState<bigint | null>(null);
  const [stepStates, setStepStates] = useState<Record<StepId, StepState>>(INITIAL_STEPS);
  const [stepTxs, setStepTxs] = useState<Partial<Record<StepId, Hex>>>({});

  const expiryHours = Math.max(1, Math.min(24, Math.round(Number(hours) || 6)));
  const promptsLabel = account
    ? "Fresh wallets may see up to four prompts; existing challengers usually only sign the final commit."
    : "Connect first. A fresh challenger wallet may need up to four prompts.";

  async function ensureConnected() {
    if (!installed) throw new Error("Install an injected wallet first.");
    if (!account) {
      await connect();
      throw new Error("Wallet connected. Click submit again to continue.");
    }
    if (!onCorrectChain) {
      await switchToMantleSepolia();
      throw new Error("Switched network. Click submit again to continue.");
    }
  }

  async function submit() {
    setStatus("pending");
    setMessage("Preparing the guided challenge flow...");
    setTxs([]);
    setClaimId(null);
    setStepStates(INITIAL_STEPS);
    setStepTxs({});

    let activeStep: StepId | null = null;
    const updateStep = (id: StepId, state: StepState, hash?: Hex) => {
      if (state === "pending") activeStep = id;
      if ((state === "done" || state === "skipped") && activeStep === id) activeStep = null;
      setStepStates((prev) => ({ ...prev, [id]: state }));
      if (hash) setStepTxs((prev) => ({ ...prev, [id]: hash }));
    };

    try {
      await ensureConnected();
      if (!account) throw new Error("Wallet not connected.");

      const thresholdValue = Number(threshold);
      if (!Number.isFinite(thresholdValue) || thresholdValue <= 0) {
        throw new Error("Enter a valid MNT/USD threshold.");
      }
      const expiry = BigInt(Math.floor(Date.now() / 1000) + expiryHours * 3600);
      const publicReleaseAt = expiry + 12n * 3600n;
      const thresholdE8 = BigInt(Math.round(thresholdValue * 1e8));
      const directionId = direction === "below" ? 1 : 0;
      const predictionParams = encodeAbiParameters(
        [{ type: "uint128" }, { type: "uint8" }],
        [thresholdE8, directionId],
      );
      const entrantHandle = cleanHandle(handle, account);
      const salt = randomSalt();
      const claimText =
        `[${entrantHandle}] Challenger call: MNT will be ${direction} $${thresholdValue.toFixed(4)} by ` +
        `${new Date(Number(expiry) * 1000).toISOString()}. Source: user-created benchmark entry on Clawback.`;
      const claimHash = keccak256(encodePacked(["string", "uint256"], [claimText, salt]));
      const skillsOutputHash = keccak256(
        toHex(
          JSON.stringify({
            source: "clawback-challenger-entry",
            handle: entrantHandle,
            direction,
            thresholdPriceUsd: thresholdValue.toFixed(8),
            expiry: expiry.toString(),
          }),
        ),
      );
      const metadataHash = keccak256(toHex(`challenger:${entrantHandle}:${account.toLowerCase()}`));
      const wc = walletClient();
      const nextTxs: Array<{ label: string; hash: Hex }> = [];

      let agentId = (await publicClient.readContract({
        address: ADDRESSES.agentRegistry,
        abi: agentRegistryAbi,
        functionName: "agentIdByOwner",
        args: [account],
      })) as bigint;

      if (agentId === 0n) {
        updateStep("registry", "pending");
        setMessage("Step 1/4: registering your challenger identity...");
        const registerTx = await wc.writeContract({
          chain: null,
          account,
          address: ADDRESSES.agentRegistry,
          abi: agentRegistryAbi,
          functionName: "registerAgent",
          args: [entrantHandle, 0, metadataHash],
        });
        nextTxs.push({ label: "registry", hash: registerTx });
        updateStep("registry", "pending", registerTx);
        setTxs([...nextTxs]);
        await publicClient.waitForTransactionReceipt({ hash: registerTx });
        updateStep("registry", "done", registerTx);
        agentId = (await publicClient.readContract({
          address: ADDRESSES.agentRegistry,
          abi: agentRegistryAbi,
          functionName: "agentIdByOwner",
          args: [account],
        })) as bigint;
      } else {
        updateStep("registry", "skipped");
      }

      const balance = (await publicClient.readContract({
        address: ADDRESSES.usdc,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [account],
      })) as bigint;
      if (balance < BOND_AMOUNT) {
        updateStep("fund", "pending");
        setMessage("Step 2/4: minting test mUSDC for the bonded call...");
        const mintTx = await wc.writeContract({
          chain: null,
          account,
          address: ADDRESSES.usdc,
          abi: erc20Abi,
          functionName: "mint",
          args: [account, MINT_BUFFER],
        });
        nextTxs.push({ label: "mUSDC mint", hash: mintTx });
        updateStep("fund", "pending", mintTx);
        setTxs([...nextTxs]);
        await publicClient.waitForTransactionReceipt({ hash: mintTx });
        updateStep("fund", "done", mintTx);
      } else {
        updateStep("fund", "skipped");
      }

      const allowance = (await publicClient.readContract({
        address: ADDRESSES.usdc,
        abi: erc20Abi,
        functionName: "allowance",
        args: [account, ADDRESSES.clawbackEscrow],
      })) as bigint;
      if (allowance < BOND_AMOUNT) {
        updateStep("approve", "pending");
        setMessage("Step 3/4: approving escrow for the bonded stake...");
        const approveTx = await wc.writeContract({
          chain: null,
          account,
          address: ADDRESSES.usdc,
          abi: erc20Abi,
          functionName: "approve",
          args: [ADDRESSES.clawbackEscrow, BOND_AMOUNT],
        });
        nextTxs.push({ label: "bond approve", hash: approveTx });
        updateStep("approve", "pending", approveTx);
        setTxs([...nextTxs]);
        await publicClient.waitForTransactionReceipt({ hash: approveTx });
        updateStep("approve", "done", approveTx);
      } else {
        updateStep("approve", "skipped");
      }

      updateStep("commit", "pending");
      setMessage("Step 4/4: committing the bonded prediction on Mantle...");
      const commitTx = await wc.writeContract({
        chain: null,
        account,
        address: ADDRESSES.claimMarket,
        abi: claimMarketAbi,
        functionName: "commitClaim",
        args: [
          agentId,
          claimHash,
          BOND_AMOUNT,
          UNLOCK_PRICE,
          expiry,
          publicReleaseAt,
          MARKET_ID.MNT_USDT_THRESHOLD,
          skillsOutputHash,
          predictionParams,
        ],
      });
      nextTxs.push({ label: "claim commit", hash: commitTx });
      updateStep("commit", "pending", commitTx);
      setTxs([...nextTxs]);
      const receipt = await publicClient.waitForTransactionReceipt({ hash: commitTx });
      updateStep("commit", "done", commitTx);
      const logs = parseEventLogs({
        abi: claimMarketAbi,
        logs: receipt.logs,
        eventName: "ClaimCommitted",
      });
      const committedId = logs[0]?.args.claimId as bigint | undefined;
      if (committedId) {
        setClaimId(committedId);
        localStorage.setItem(
          `clawback.challenger.${committedId.toString()}`,
          JSON.stringify({
            claimId: committedId.toString(),
            handle: entrantHandle,
            claimText,
            salt: salt.toString(),
            commitTx,
          }),
        );
      }
      setStatus("done");
      setMessage(
        `Challenger entry committed. It settles after the ${expiryHours}h expiry, then the receipt can be refreshed into the arena.`,
      );
    } catch (err) {
      setStatus("error");
      if (activeStep) updateStep(activeStep, "error");
      setMessage(err instanceof Error ? err.message : "Challenger entry failed.");
    }
  }

  return (
    <section className="challenger-entry" aria-label="Join the benchmark">
      <div>
        <p>Human vs AI entry</p>
        <h2>Beat the model</h2>
        <span>
          Think the AI is wrong? Bond your own call through the same contracts. Same rules,
          same receipts, same slashing. Seeded test entries are labeled as challengers until
          external wallets join the open registry.
        </span>
        <div className="challenge-preflight" aria-label="Challenge transaction preflight">
          <strong>{promptsLabel}</strong>
          <small>
            No instant result: the call resolves after expiry when Pyth posts the market truth.
            You can browse settled receipts while this one waits.
          </small>
        </div>
      </div>
      <div className="challenger-form">
        <label>
          Handle
          <input value={handle} onChange={(event) => setHandle(event.target.value)} placeholder="Challenger_01" />
        </label>
        <label>
          Direction
          <select value={direction} onChange={(event) => setDirection(event.target.value as "above" | "below")}>
            <option value="above">MNT above threshold</option>
            <option value="below">MNT below threshold</option>
          </select>
        </label>
        <label>
          Threshold
          <input value={threshold} onChange={(event) => setThreshold(event.target.value)} inputMode="decimal" />
        </label>
        <label>
          Expiry hours
          <input value={hours} onChange={(event) => setHours(event.target.value)} inputMode="numeric" />
        </label>
      </div>
      <div className="challenge-stepper" aria-label="Challenge transaction steps">
        {CHALLENGE_STEPS.map((step, index) => {
          const state = stepStates[step.id];
          const hash = stepTxs[step.id];
          return (
            <div className={`challenge-step challenge-step-${state}`} key={step.id}>
              <div className="challenge-step-index">{String(index + 1).padStart(2, "0")}</div>
              <div>
                <div className="challenge-step-title">
                  <span>{step.title}</span>
                  <em>
                    {state === "pending"
                      ? "waiting for wallet"
                      : state === "done"
                        ? "confirmed"
                        : state === "skipped"
                          ? "already set"
                          : state === "error"
                            ? "needs retry"
                            : step.freshWallet
                              ? "fresh wallet"
                              : "required"}
                  </em>
                </div>
                <p>{step.body}</p>
                {hash ? <span className="challenge-step-tx">{txLink(hash)}</span> : null}
              </div>
            </div>
          );
        })}
      </div>
      <div className="challenger-actions">
        <button onClick={() => submit()} disabled={status === "pending"}>
          {status === "pending" ? "Follow wallet prompts" : account ? "Start guided challenge" : "Connect and enter"}
        </button>
        <p aria-live="polite" className={status === "error" ? "text-red-300" : status === "done" ? "text-emerald-200" : ""}>
          {message}
        </p>
      </div>
      {txs.length > 0 ? (
        <div className="challenger-txs">
          {txs.map((tx) => (
            <span key={`${tx.label}-${tx.hash}`}>
              {tx.label}: {txLink(tx.hash)}
            </span>
          ))}
          {claimId ? <Link href={`/claim/${claimId.toString()}`}>Open claim #{claimId.toString()} →</Link> : null}
        </div>
      ) : null}
    </section>
  );
}
