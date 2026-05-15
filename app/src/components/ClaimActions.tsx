"use client";

import { useEffect, useState } from "react";
import { type Hex } from "viem";
import { useWallet, publicClient } from "@/lib/wallet";
import { ADDRESSES, EXPLORER } from "@/lib/addresses";
import { clawbackEscrowAbi, erc20Abi, paidUnlockAbi } from "@/lib/abi";

type Props = {
  claimId: bigint;
  agentId: bigint;
  agentOwner: `0x${string}`;
  unlockPrice: bigint;
  state: number;
  settled: boolean;
  agentRight: boolean;
  expirySec: bigint;
};

type ActionStatus = "idle" | "pending" | "done" | "error";

function Tx({ hash }: { hash: Hex }) {
  return (
    <a
      href={`${EXPLORER}/tx/${hash}`}
      target="_blank"
      rel="noreferrer"
      className="text-xs text-amber-400 hover:underline font-mono"
    >
      {hash.slice(0, 10)}…{hash.slice(-6)} ↗
    </a>
  );
}

export default function ClaimActions(props: Props) {
  const { claimId, agentId, agentOwner, unlockPrice, state, settled, agentRight, expirySec } = props;
  const { account, onCorrectChain, walletClient, connect } = useWallet();
  const [unlocked, setUnlocked] = useState<boolean>(false);
  const [refundOwed, setRefundOwed] = useState<{ paidBack: bigint; bonus: bigint } | null>(null);
  const [refundDone, setRefundDone] = useState<boolean>(false);
  const [earningsDone, setEarningsDone] = useState<boolean>(false);

  const [unlockStatus, setUnlockStatus] = useState<ActionStatus>("idle");
  const [unlockHash, setUnlockHash] = useState<Hex | null>(null);
  const [unlockError, setUnlockError] = useState<string | null>(null);

  const [refundStatus, setRefundStatus] = useState<ActionStatus>("idle");
  const [refundHash, setRefundHash] = useState<Hex | null>(null);
  const [refundError, setRefundError] = useState<string | null>(null);

  const [earningsStatus, setEarningsStatus] = useState<ActionStatus>("idle");
  const [earningsHash, setEarningsHash] = useState<Hex | null>(null);
  const [earningsError, setEarningsError] = useState<string | null>(null);

  useEffect(() => {
    if (!account) return;
    (async () => {
      try {
        const [p, refund, rClaimed, eClaimed] = await Promise.all([
          publicClient.readContract({
            address: ADDRESSES.claimMarket as `0x${string}`,
            abi: paidUnlockAbi,
            functionName: "paidUnlock",
            args: [claimId, account],
          }),
          publicClient.readContract({
            address: ADDRESSES.clawbackEscrow as `0x${string}`,
            abi: clawbackEscrowAbi,
            functionName: "claimableRefund",
            args: [account, claimId],
          }),
          publicClient.readContract({
            address: ADDRESSES.clawbackEscrow as `0x${string}`,
            abi: clawbackEscrowAbi,
            functionName: "refundClaimed",
            args: [claimId, account],
          }),
          publicClient.readContract({
            address: ADDRESSES.clawbackEscrow as `0x${string}`,
            abi: clawbackEscrowAbi,
            functionName: "earningsClaimed",
            args: [claimId],
          }),
        ]);
        setUnlocked(p as boolean);
        const [paidBack, bonus] = refund as readonly [bigint, bigint];
        setRefundOwed({ paidBack, bonus });
        setRefundDone(rClaimed as boolean);
        setEarningsDone(eClaimed as boolean);
      } catch (e) {
        console.error("ClaimActions read failed", e);
      }
    })();
  }, [account, claimId, unlockStatus, refundStatus, earningsStatus]);

  if (!account) {
    return (
      <section className="border border-amber-700/60 rounded-lg p-5 mb-4 bg-amber-950/20">
        <h2 className="text-sm uppercase tracking-wider text-amber-300 mb-2">Actions</h2>
        <p className="text-amber-100 text-sm mb-3">Connect a wallet on Mantle Sepolia to unlock, refund, or claim earnings.</p>
        <button
          onClick={() => connect().catch((e) => alert((e as Error).message))}
          className="text-sm px-4 py-2 rounded bg-amber-500 text-black font-semibold hover:bg-amber-400"
        >
          Connect wallet
        </button>
      </section>
    );
  }

  if (!onCorrectChain) {
    return (
      <section className="border border-rose-700 rounded-lg p-5 mb-4 bg-rose-950/30">
        <p className="text-rose-200 text-sm">Wrong chain. Switch your wallet to Mantle Sepolia.</p>
      </section>
    );
  }

  const isAgentOwner = account.toLowerCase() === agentOwner.toLowerCase();
  const now = Math.floor(Date.now() / 1000);
  const expired = now >= Number(expirySec);
  const isCommittedAndLive = state === 0 && !expired;

  async function doUnlock() {
    setUnlockStatus("pending");
    setUnlockError(null);
    try {
      const wc = walletClient();
      if (!account) throw new Error("no account");
      const allowance = (await publicClient.readContract({
        address: ADDRESSES.usdc as `0x${string}`,
        abi: erc20Abi,
        functionName: "allowance",
        args: [account, ADDRESSES.q402Adapter as `0x${string}`],
      })) as bigint;
      if (allowance < unlockPrice) {
        const ah = await wc.writeContract({
          chain: null,
          account,
          address: ADDRESSES.usdc as `0x${string}`,
          abi: erc20Abi,
          functionName: "approve",
          args: [ADDRESSES.q402Adapter as `0x${string}`, 2n ** 256n - 1n],
        });
        await publicClient.waitForTransactionReceipt({ hash: ah });
      }

      const nonce = BigInt(Date.now()) * 1000n + BigInt(Math.floor(Math.random() * 1000));
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 600);
      const paymentId = (`0x${nonce.toString(16).padStart(64, "0")}`) as Hex;
      const witness = {
        owner: account,
        claimId,
        amount: unlockPrice,
        deadline,
        paymentId,
        nonce,
      };
      const sig = await wc.signTypedData({
        account,
        domain: { name: "Clawback Q402", version: "1", chainId: 5003, verifyingContract: ADDRESSES.q402Adapter as `0x${string}` },
        types: {
          Witness: [
            { name: "owner", type: "address" },
            { name: "claimId", type: "uint256" },
            { name: "amount", type: "uint256" },
            { name: "deadline", type: "uint256" },
            { name: "paymentId", type: "bytes32" },
            { name: "nonce", type: "uint256" },
          ],
        },
        primaryType: "Witness",
        message: witness,
      });

      const res = await fetch("/api/unlock", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          claimId: claimId.toString(),
          owner: witness.owner,
          amount: witness.amount.toString(),
          deadline: witness.deadline.toString(),
          paymentId: witness.paymentId,
          nonce: witness.nonce.toString(),
          signature: sig,
        }),
      });
      const out = (await res.json()) as { ok?: boolean; txHash?: Hex; error?: string };
      if (!res.ok || !out.ok || !out.txHash) {
        throw new Error(out.error ?? `unlock relay failed (${res.status})`);
      }
      setUnlockHash(out.txHash);
      await publicClient.waitForTransactionReceipt({ hash: out.txHash });
      setUnlockStatus("done");
    } catch (e) {
      setUnlockError((e as Error).message);
      setUnlockStatus("error");
    }
  }

  async function doRefund() {
    setRefundStatus("pending");
    setRefundError(null);
    try {
      const wc = walletClient();
      if (!account) throw new Error("no account");
      const hash = await wc.writeContract({
        chain: null,
        account,
        address: ADDRESSES.clawbackEscrow as `0x${string}`,
        abi: clawbackEscrowAbi,
        functionName: "claimRefund",
        args: [claimId],
      });
      setRefundHash(hash);
      await publicClient.waitForTransactionReceipt({ hash });
      setRefundStatus("done");
    } catch (e) {
      setRefundError((e as Error).message);
      setRefundStatus("error");
    }
  }

  async function doEarnings() {
    setEarningsStatus("pending");
    setEarningsError(null);
    try {
      const wc = walletClient();
      if (!account) throw new Error("no account");
      const hash = await wc.writeContract({
        chain: null,
        account,
        address: ADDRESSES.clawbackEscrow as `0x${string}`,
        abi: clawbackEscrowAbi,
        functionName: "claimAgentEarnings",
        args: [agentId, claimId],
      });
      setEarningsHash(hash);
      await publicClient.waitForTransactionReceipt({ hash });
      setEarningsStatus("done");
    } catch (e) {
      setEarningsError((e as Error).message);
      setEarningsStatus("error");
    }
  }

  return (
    <section className="border border-neutral-800 rounded-lg p-5 mb-4">
      <h2 className="text-sm uppercase tracking-wider text-neutral-500 mb-4">Actions</h2>

      <div className="space-y-4">
        <div>
          <div className="flex items-center justify-between mb-1">
            <div className="text-neutral-200 font-semibold">Unlock the claim text</div>
            {unlocked && <span className="text-xs text-emerald-400">unlocked</span>}
          </div>
          <div className="text-xs text-neutral-500 mb-2">
            Pay {(Number(unlockPrice) / 1e6).toFixed(2)} USDC via Q402. You sign once. The facilitator submits the on chain accept, so you pay zero MNT gas. First time only: one USDC approve tx (standard ERC-20).
          </div>
          <button
            disabled={!isCommittedAndLive || unlocked || unlockStatus === "pending"}
            onClick={doUnlock}
            className="text-sm px-4 py-2 rounded bg-amber-500 text-black font-semibold hover:bg-amber-400 disabled:bg-neutral-800 disabled:text-neutral-500 disabled:cursor-not-allowed"
          >
            {unlocked ? "already unlocked"
              : !isCommittedAndLive ? (expired ? "expired" : "claim not unlockable")
              : unlockStatus === "pending" ? "unlocking…" : `Unlock for ${(Number(unlockPrice) / 1e6).toFixed(2)} USDC`}
          </button>
          {unlockHash && <div className="mt-2 text-xs">tx: <Tx hash={unlockHash} /></div>}
          {unlockError && <div className="mt-2 text-xs text-rose-400 break-all">{unlockError}</div>}
        </div>

        <div className="border-t border-neutral-800 pt-4">
          <div className="flex items-center justify-between mb-1">
            <div className="text-neutral-200 font-semibold">Refund (agent was wrong)</div>
            {refundDone && <span className="text-xs text-emerald-400">refunded</span>}
          </div>
          <div className="text-xs text-neutral-500 mb-2">
            {refundOwed && refundOwed.paidBack > 0n
              ? `Owed: ${(Number(refundOwed.paidBack) / 1e6).toFixed(4)} USDC + ${(Number(refundOwed.bonus) / 1e6).toFixed(4)} bonus from slashed bond`
              : settled && !agentRight
                ? "You did not pay on this claim."
                : settled && agentRight
                  ? "Agent was right. No refund."
                  : "Available after settlement if the agent is wrong."}
          </div>
          <button
            disabled={!settled || agentRight || refundDone || !refundOwed || refundOwed.paidBack === 0n || refundStatus === "pending"}
            onClick={doRefund}
            className="text-sm px-4 py-2 rounded bg-rose-600 text-white font-semibold hover:bg-rose-500 disabled:bg-neutral-800 disabled:text-neutral-500 disabled:cursor-not-allowed"
          >
            {refundDone ? "refunded" : refundStatus === "pending" ? "claiming…" : "Claim refund"}
          </button>
          {refundHash && <div className="mt-2 text-xs">tx: <Tx hash={refundHash} /></div>}
          {refundError && <div className="mt-2 text-xs text-rose-400 break-all">{refundError}</div>}
        </div>

        {isAgentOwner && (
          <div className="border-t border-neutral-800 pt-4">
            <div className="flex items-center justify-between mb-1">
              <div className="text-neutral-200 font-semibold">Claim earnings (agent was right)</div>
              {earningsDone && <span className="text-xs text-emerald-400">claimed</span>}
            </div>
            <div className="text-xs text-neutral-500 mb-2">
              You are the agent owner. After settlement with agentRight=true, withdraw bond + all unlock payments.
            </div>
            <button
              disabled={!settled || !agentRight || earningsDone || earningsStatus === "pending"}
              onClick={doEarnings}
              className="text-sm px-4 py-2 rounded bg-emerald-600 text-black font-semibold hover:bg-emerald-500 disabled:bg-neutral-800 disabled:text-neutral-500 disabled:cursor-not-allowed"
            >
              {earningsDone ? "claimed" : earningsStatus === "pending" ? "claiming…" : "Claim earnings"}
            </button>
            {earningsHash && <div className="mt-2 text-xs">tx: <Tx hash={earningsHash} /></div>}
            {earningsError && <div className="mt-2 text-xs text-rose-400 break-all">{earningsError}</div>}
          </div>
        )}
      </div>
    </section>
  );
}
