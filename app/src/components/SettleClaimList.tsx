"use client";

import { useState } from "react";
import { encodeAbiParameters, type Hex } from "viem";
import { useWallet, publicClient } from "@/lib/wallet";
import { ADDRESSES, EXPLORER } from "@/lib/addresses";
import { CLAIM_STATE, MARKET_LABEL, pythAbi, pythAdapterAbi } from "@/lib/abi";
import {
  PYTH_CONTRACT,
  PYTH_ETH_USD_FEED,
  PYTH_MNT_USD_FEED,
  fetchUpdateBundle,
} from "@/lib/pyth-bundle";

export type SettleClaim = {
  id: string;
  agentId: string;
  agentHandle: string;
  marketId: number;
  state: number;
  expiry: string;
  bondAmount: string;
  unlockPrice: string;
  settled: boolean;
  agentRight: boolean;
};

type ActionStatus = "idle" | "pending" | "done" | "error";

export default function SettleClaimList({ claims }: { claims: SettleClaim[] }) {
  const { account, onCorrectChain, walletClient, connect, installed } = useWallet();

  const [busy, setBusy] = useState<Record<string, ActionStatus>>({});
  const [txs, setTxs] = useState<Record<string, Hex>>({});
  const [errs, setErrs] = useState<Record<string, string>>({});

  const now = Math.floor(Date.now() / 1000);

  async function resolve(claim: SettleClaim) {
    setBusy((b) => ({ ...b, [claim.id]: "pending" }));
    setErrs((e) => ({ ...e, [claim.id]: "" }));
    try {
      const wc = walletClient();
      if (!account) throw new Error("no account");
      const feeds: `0x${string}`[] = claim.marketId === 0 ? [PYTH_MNT_USD_FEED, PYTH_ETH_USD_FEED] : [PYTH_MNT_USD_FEED];
      const bundle = await fetchUpdateBundle(feeds);
      const fee = (await publicClient.readContract({
        address: PYTH_CONTRACT,
        abi: pythAbi,
        functionName: "getUpdateFee",
        args: [bundle],
      })) as bigint;
      const params = encodeAbiParameters([{ type: "bytes[]" }], [bundle]);
      const hash = await wc.writeContract({
        chain: null,
        account,
        address: ADDRESSES.pythSettlementAdapter as `0x${string}`,
        abi: pythAdapterAbi,
        functionName: "resolve",
        args: [BigInt(claim.id), params],
        value: fee,
      });
      setTxs((t) => ({ ...t, [claim.id]: hash }));
      await publicClient.waitForTransactionReceipt({ hash });
      setBusy((b) => ({ ...b, [claim.id]: "done" }));
    } catch (e) {
      setErrs((er) => ({ ...er, [claim.id]: (e as Error).message }));
      setBusy((b) => ({ ...b, [claim.id]: "error" }));
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="text-sm text-neutral-400">
          {claims.length} claim{claims.length === 1 ? "" : "s"} total
        </div>
        {account && onCorrectChain ? (
          <span className="text-xs text-emerald-400 font-mono">{account.slice(0, 6)}…{account.slice(-4)}</span>
        ) : !installed ? (
          <span className="text-xs text-neutral-500">install a wallet to settle</span>
        ) : (
          <button
            onClick={() => connect().catch((e) => alert((e as Error).message))}
            className="text-xs px-3 py-1.5 rounded bg-amber-500 text-black font-semibold hover:bg-amber-400"
          >
            connect wallet
          </button>
        )}
      </div>

      <div className="space-y-3">
        {claims.map((c) => {
          const expirySec = Number(c.expiry);
          const expired = now >= expirySec;
          const canResolve = c.state === CLAIM_STATE.COMMITTED && !c.settled && expired;
          const market = MARKET_LABEL[c.marketId] ?? `market #${c.marketId}`;
          const status = busy[c.id] ?? "idle";
          const tx = txs[c.id];
          const err = errs[c.id];

          let stateLabel: string;
          let stateCls: string;
          if (c.settled) {
            stateLabel = c.agentRight ? "settled: RIGHT" : "settled: WRONG";
            stateCls = c.agentRight ? "bg-emerald-700/30 text-emerald-300" : "bg-rose-700/30 text-rose-300";
          } else if (c.state === CLAIM_STATE.PUBLICLY_REVEALED) {
            stateLabel = "revealed";
            stateCls = "bg-amber-700/30 text-amber-300";
          } else if (expired) {
            stateLabel = "expired (needs resolve)";
            stateCls = "bg-amber-700/30 text-amber-300";
          } else {
            stateLabel = `live ${formatRemaining(expirySec - now)}`;
            stateCls = "bg-neutral-700/40 text-neutral-300";
          }

          return (
            <div key={c.id} className="border border-neutral-800 rounded-lg p-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-sm text-neutral-400 mb-1">
                  claim #{c.id} · agent {c.agentHandle} · {market}
                </div>
                <div className="flex items-center gap-3 mb-2">
                  <span className={`text-xs px-2 py-0.5 rounded ${stateCls}`}>{stateLabel}</span>
                  <span className="text-xs text-neutral-500">
                    expiry {new Date(expirySec * 1000).toLocaleString()}
                  </span>
                </div>
                <div className="text-xs text-neutral-500">
                  bond {(Number(c.bondAmount) / 1e6).toFixed(2)} USDC · unlock {(Number(c.unlockPrice) / 1e6).toFixed(2)} USDC
                </div>
                {tx && (
                  <div className="text-xs mt-2">
                    <a className="text-amber-400 hover:underline font-mono" href={`${EXPLORER}/tx/${tx}`} target="_blank" rel="noreferrer">
                      {tx.slice(0, 10)}…{tx.slice(-6)} ↗
                    </a>
                  </div>
                )}
                {err && <div className="text-xs text-rose-400 mt-2 break-all max-w-md">{err}</div>}
              </div>
              <div className="flex flex-col gap-2 items-end">
                {canResolve ? (
                  <button
                    disabled={!account || !onCorrectChain || status === "pending"}
                    onClick={() => resolve(c)}
                    className="text-sm px-4 py-2 rounded bg-amber-500 text-black font-semibold hover:bg-amber-400 disabled:bg-neutral-800 disabled:text-neutral-500 disabled:cursor-not-allowed"
                  >
                    {status === "pending" ? "resolving…" : status === "done" ? "resolved" : "Resolve via Pyth"}
                  </button>
                ) : (
                  <span className="text-xs text-neutral-600">no action</span>
                )}
                <a href={`/claim/${c.id}`} className="text-xs text-neutral-400 hover:text-white">view detail →</a>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function formatRemaining(sec: number): string {
  if (sec <= 0) return "expired";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
