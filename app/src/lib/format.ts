export function formatUsdc(amount: bigint): string {
  const n = Number(amount) / 1e6;
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function shortHex(h: string, head = 6, tail = 4): string {
  if (!h.startsWith("0x")) return h;
  return h.slice(0, 2 + head) + "..." + h.slice(-tail);
}

export function formatTimestamp(seconds: bigint | number): string {
  const ms = Number(seconds) * 1000;
  return new Date(ms).toISOString().replace("T", " ").slice(0, 19) + " UTC";
}

export function relativeTime(seconds: bigint | number): string {
  const now = Date.now() / 1000;
  const t = Number(seconds);
  const diff = t - now;
  const abs = Math.abs(diff);
  const tag = diff < 0 ? "ago" : "from now";
  if (abs < 60) return `${Math.round(abs)}s ${tag}`;
  if (abs < 3600) return `${Math.round(abs / 60)}m ${tag}`;
  if (abs < 86400) return `${(abs / 3600).toFixed(1)}h ${tag}`;
  return `${(abs / 86400).toFixed(1)}d ${tag}`;
}

export function factionLabel(faction: number): "Cat" | "Lobster" {
  return faction === 0 ? "Cat" : "Lobster";
}

import { decodeAbiParameters } from "viem";
import { MARKET_ID } from "./abi";

export type PredictionParams =
  | { kind: "outperform"; minOutperformBps: number; commitMntPriceUsd: number; commitEthPriceUsd: number }
  | { kind: "threshold"; thresholdPriceUsd: number; direction: "above" | "below" }
  | { kind: "raw"; hex: `0x${string}` };

export function decodePredictionParams(marketId: number, params: `0x${string}`): PredictionParams {
  try {
    if (marketId === MARKET_ID.MNT_OUTPERFORMS_METH) {
      const [minOutperformBps, commitMntE8, commitEthE8] = decodeAbiParameters(
        [{ type: "int64" }, { type: "uint64" }, { type: "uint64" }],
        params,
      ) as [bigint, bigint, bigint];
      return {
        kind: "outperform",
        minOutperformBps: Number(minOutperformBps),
        commitMntPriceUsd: Number(commitMntE8) / 1e8,
        commitEthPriceUsd: Number(commitEthE8) / 1e8,
      };
    }
    if (marketId === MARKET_ID.MNT_USDT_THRESHOLD) {
      const [thresholdE8, direction] = decodeAbiParameters(
        [{ type: "uint128" }, { type: "uint8" }],
        params,
      ) as [bigint, number];
      return {
        kind: "threshold",
        thresholdPriceUsd: Number(thresholdE8) / 1e8,
        direction: direction === 1 ? "below" : "above",
      };
    }
  } catch {
    /* fall through to raw */
  }
  return { kind: "raw", hex: params };
}

export function predictionQuestion(p: PredictionParams, expirySeconds: bigint): string {
  const hours = Number(expirySeconds - BigInt(Math.floor(Date.now() / 1000))) / 3600;
  const horizon = hours > 0 ? `${hours.toFixed(1)}h` : `at expiry`;
  if (p.kind === "outperform") {
    return `Does MNT outperform mETH by at least ${(p.minOutperformBps / 100).toFixed(2)}% by ${horizon}? Commit snapshot: MNT $${p.commitMntPriceUsd.toFixed(4)}, ETH $${p.commitEthPriceUsd.toFixed(2)}.`;
  }
  if (p.kind === "threshold") {
    return `Does MNT/USD trade ${p.direction} $${p.thresholdPriceUsd.toFixed(4)} by ${horizon}?`;
  }
  return `Raw params: ${p.hex.slice(0, 20)}...`;
}
