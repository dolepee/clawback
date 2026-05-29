// LLM client for Clawback agent decisions.
//
// Reads market observation context and asks an LLM (Z.ai by default, any
// OpenAI-compatible endpoint via env) to emit a structured decision for
// a Pyth-settled threshold claim:
//
//   { thresholdPriceUsd, direction, confidenceBps, reasoning }
//
// The decision is hashed into skillsOutputHash and the full prompt +
// response is persisted in the encrypted reveal vault, so judges can
// audit the model's reasoning after publicReleaseAt.

import type { ElfaSnapshot } from "./elfa.js";
import { renderForPrompt as renderElfaForPrompt } from "./elfa.js";

export interface MarketObservation {
  pair: string;
  observedPrice: string;
  mntPriceUsdt: string;
  methPriceUsdt: string;
  pythMntE8?: bigint;
  pythEthE8?: bigint;
  blockNumber: string;
  // Optional Elfa AI signal snapshot. Present when ELFA_API_KEY is set;
  // null otherwise. The prompt builder appends the rendered signals to
  // the user message when this is non-null.
  elfaTriggers?: ElfaSnapshot | null;
  // Recent MNT/USD snapshots from prior commits, ordered oldest first.
  // Lets the model anchor confidence on observed volatility instead of
  // defaulting to the schema floor when given only a single spot price.
  priceHistory?: Array<{ publishTime: number; priceE8: bigint }>;
}

export interface LlmDecision {
  thresholdPriceUsd: number;
  direction: "above" | "below";
  // On-chain confidence. Computed in code from the chosen threshold's
  // safety margin vs recent volatility — keeps the number mechanically
  // calibrated rather than dependent on the model's mood / floor-hugging
  // tendencies.
  confidenceBps: number;
  // The model's own confidence call, for the encrypted audit record.
  // Diverges from confidenceBps when the model floor-hugs.
  modelConfidenceBps: number;
  reasoning: string;
  model: string;
  fellBack: boolean;
}

export interface LlmConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

// Providers tried in order. Z.ai is a hackathon sponsor (highest judging
// alignment); Bankr is the reliable fallback. Set ZAI_API_KEY and/or
// BANKR_LLM_KEY; the chain skips any missing provider and falls back to
// a deterministic baseline only when every provider throws.
const ZAI_BASE_URL = "https://api.z.ai/api/paas/v4";
const ZAI_DEFAULT_MODEL = "glm-4-air";
const BANKR_BASE_URL = "https://llm.bankr.bot/v1";
const BANKR_DEFAULT_MODEL = "deepseek-v3.2";

export interface LlmProvider {
  label: string;
  config: LlmConfig;
}

export function providersFromEnv(): LlmProvider[] {
  const providers: LlmProvider[] = [];
  const zai = process.env.ZAI_API_KEY ?? process.env.LLM_API_KEY;
  if (zai) {
    providers.push({
      label: "z.ai",
      config: {
        baseUrl: process.env.ZAI_BASE_URL ?? process.env.LLM_BASE_URL ?? ZAI_BASE_URL,
        apiKey: zai,
        model: process.env.ZAI_MODEL ?? process.env.LLM_MODEL ?? ZAI_DEFAULT_MODEL,
      },
    });
  }
  const bankr = process.env.BANKR_LLM_KEY;
  if (bankr) {
    providers.push({
      label: "bankr",
      config: {
        baseUrl: BANKR_BASE_URL,
        apiKey: bankr,
        model: process.env.BANKR_LLM_MODEL ?? BANKR_DEFAULT_MODEL,
      },
    });
  }
  return providers;
}

// Kept for callers that want a single config (legacy / tests).
export function llmConfigFromEnv(): LlmConfig | null {
  const providers = providersFromEnv();
  return providers.length > 0 ? providers[0].config : null;
}

const DECISION_SCHEMA_INSTRUCTIONS = `You are a bonded trading agent on Mantle Sepolia. You publish binary price claims on MNT/USD that settle via Pyth after expiry. You lose your bond when wrong.

Output exactly this JSON, nothing else:

{
  "thresholdPriceUsd": <number between 0.30 and 1.50>,
  "direction": "above" | "below",
  "confidenceBps": <integer 3000-9500>,
  "reasoning": "<one or two sentences"
}

direction "above" means you claim MNT/USD stays above the threshold for the entire 6h window.
direction "below" means you claim MNT/USD drops below the threshold within the 6h window.

CONFIDENCE CALIBRATION (use the numbers from the user message, do not estimate them yourself):

The user message provides three precomputed inputs:
- recentRangeBps: observed MNT/USD range as bps of the midpoint over the snapshot window
- thresholdSafetyMarginBps: how far your threshold sits from current spot, in bps
- candidateConfidenceBps: a math-derived baseline confidence for that safety margin vs that range

Heuristic the math uses (so you understand it):
- ratio R = thresholdSafetyMarginBps / recentRangeBps
- R >= 3.0 → candidate ~9000 (threshold is 3x observed range away, very safe)
- R between 1.5 and 3.0 → candidate 7000-8500
- R between 0.5 and 1.5 → candidate 5000-7000
- R < 0.5 → candidate 4000-5000 (threshold inside recent variance, near coin flip)

Your job:
1. Pick a thresholdPriceUsd and direction. You can mirror the candidate's logic or pick a more aggressive / safer threshold.
2. Set confidenceBps = candidateConfidenceBps for the threshold you actually chose, unless you have a SPECIFIC reason from the data to override. State the override reason in reasoning.
3. Do NOT default to 3000 just to look conservative. The on-chain accuracy track record is permanent; under-confident calls on safe thresholds make the agent look unsophisticated.`;

export async function decideWithProviders(
  observation: MarketObservation,
  providers: LlmProvider[],
  fallback: { thresholdPriceUsd: number; direction: "above" | "below"; confidenceBps: number },
): Promise<LlmDecision> {
  for (const provider of providers) {
    try {
      const decision = await decideThresholdClaim(observation, provider.config, fallback);
      if (!decision.fellBack) return { ...decision, model: `${provider.label}:${decision.model}` };
      console.warn(`[llm] ${provider.label} returned fallback, trying next provider`);
    } catch (err) {
      console.warn(`[llm] ${provider.label} threw, trying next:`, (err as Error).message);
    }
  }
  return {
    thresholdPriceUsd: fallback.thresholdPriceUsd,
    direction: fallback.direction,
    confidenceBps: fallback.confidenceBps,
    modelConfidenceBps: fallback.confidenceBps,
    reasoning: providers.length === 0
      ? "No LLM provider configured (set ZAI_API_KEY or BANKR_LLM_KEY); used baseline."
      : "All LLM providers failed; used baseline.",
    model: providers.length === 0 ? "baseline:no-provider" : "baseline:all-failed",
    fellBack: true,
  };
}

export async function decideThresholdClaim(
  observation: MarketObservation,
  config: LlmConfig,
  fallback: { thresholdPriceUsd: number; direction: "above" | "below"; confidenceBps: number },
): Promise<LlmDecision> {
  const elfaSection = renderElfaForPrompt(observation.elfaTriggers ?? null);
  const historySection = renderPriceHistoryForPrompt(observation.priceHistory ?? []);
  const calibration = computeCalibrationInputs(observation, fallback);
  const calibrationSection = calibration
    ? [
        `PRECOMPUTED CALIBRATION INPUTS:`,
        `- recentRangeBps = ${calibration.recentRangeBps}`,
        `- driftBps (first→last) = ${calibration.driftBps}`,
        `- currentMidpoint = ${calibration.midpoint.toFixed(6)}`,
        `- baselineThresholdPriceUsd = ${calibration.baselineThresholdPriceUsd.toFixed(6)} (baseline ${calibration.baselineDirection})`,
        `- thresholdSafetyMarginBps (baseline) = ${calibration.baselineSafetyMarginBps}`,
        `- candidateConfidenceBps (baseline) = ${calibration.baselineCandidateConfidence}`,
        ``,
        `If you change the threshold, recompute safety margin = abs(currentMidpoint - yourThreshold) / currentMidpoint * 10000, then apply the heuristic from the system prompt to set confidenceBps.`,
      ].join("\n")
    : null;
  const userPrompt = [
    `Live Mantle Sepolia observation at block ${observation.blockNumber}:`,
    `- ${observation.pair} = ${observation.observedPrice}`,
    `- MNT/USDT (Merchant Moe) = ${observation.mntPriceUsdt}`,
    `- mETH/USDT (Merchant Moe) = ${observation.methPriceUsdt}`,
    observation.pythMntE8 != null
      ? `- Pyth MNT/USD = ${(Number(observation.pythMntE8) / 1e8).toFixed(6)}`
      : null,
    observation.pythEthE8 != null
      ? `- Pyth ETH/USD = ${(Number(observation.pythEthE8) / 1e8).toFixed(2)}`
      : null,
    historySection ? "" : null,
    historySection || null,
    calibrationSection ? "" : null,
    calibrationSection || null,
    elfaSection ? "" : null,
    elfaSection || null,
    "",
    "Pick a 6h threshold claim. Use the precomputed calibration as your anchor — only override with a specific data-backed reason.",
  ]
    .filter(Boolean)
    .join("\n");

  const body = {
    model: config.model,
    messages: [
      { role: "system", content: DECISION_SCHEMA_INSTRUCTIONS },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.2,
    response_format: { type: "json_object" },
  };

  try {
    const resp = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      throw new Error(`LLM HTTP ${resp.status}: ${text.slice(0, 200)}`);
    }
    const payload = (await resp.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) throw new Error("LLM response missing content");

    const parsed = JSON.parse(content) as {
      thresholdPriceUsd?: unknown;
      direction?: unknown;
      confidenceBps?: unknown;
      reasoning?: unknown;
    };

    const finalThreshold = clampNumber(parsed.thresholdPriceUsd, 0.3, 1.5, fallback.thresholdPriceUsd);
    const finalDirection: "above" | "below" =
      parsed.direction === "above" || parsed.direction === "below" ? parsed.direction : fallback.direction;
    const modelConfidence = clampInt(parsed.confidenceBps, 3000, 9500, fallback.confidenceBps);
    // Mechanically calibrated on-chain confidence: derive from the model's
    // actual chosen threshold's safety margin vs recent observed range.
    // Falls back to the model's own number when there's no price history
    // to anchor against.
    let onChainConfidence = modelConfidence;
    if (calibration) {
      const chosenSafetyMarginBps = Math.round(
        (Math.abs(calibration.midpoint - finalThreshold) / calibration.midpoint) * 10_000,
      );
      onChainConfidence = candidateConfidenceFor(chosenSafetyMarginBps, calibration.recentRangeBps);
    }
    const decision: LlmDecision = {
      thresholdPriceUsd: finalThreshold,
      direction: finalDirection,
      confidenceBps: onChainConfidence,
      modelConfidenceBps: modelConfidence,
      reasoning: typeof parsed.reasoning === "string" ? parsed.reasoning.trim() : "(model returned no reasoning)",
      model: config.model,
      fellBack: false,
    };
    return decision;
  } catch (err) {
    console.warn(`[llm] decision failed, falling back to deterministic baseline:`, (err as Error).message);
    return {
      thresholdPriceUsd: fallback.thresholdPriceUsd,
      direction: fallback.direction,
      confidenceBps: fallback.confidenceBps,
      modelConfidenceBps: fallback.confidenceBps,
      reasoning: `LLM unavailable (${(err as Error).message}); used baseline ${fallback.direction} ${fallback.thresholdPriceUsd}.`,
      model: `${config.model}+fallback`,
      fellBack: true,
    };
  }
}

interface CalibrationInputs {
  recentRangeBps: number;
  driftBps: number;
  midpoint: number;
  baselineThresholdPriceUsd: number;
  baselineDirection: "above" | "below";
  baselineSafetyMarginBps: number;
  baselineCandidateConfidence: number;
}

function computeCalibrationInputs(
  observation: MarketObservation,
  fallback: { thresholdPriceUsd: number; direction: "above" | "below" },
): CalibrationInputs | null {
  const history = observation.priceHistory ?? [];
  if (history.length < 2) return null;
  const prices = history.map((s) => Number(s.priceE8) / 1e8);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const midpoint = (min + max) / 2;
  if (midpoint <= 0) return null;
  const sorted = [...history].sort((a, b) => a.publishTime - b.publishTime);
  const first = Number(sorted[0].priceE8) / 1e8;
  const last = Number(sorted[sorted.length - 1].priceE8) / 1e8;
  const recentRangeBps = Math.round(((max - min) / midpoint) * 10_000);
  const driftBps = Math.round(((last - first) / first) * 10_000);
  const baselineThresholdPriceUsd = fallback.thresholdPriceUsd;
  const baselineDirection = fallback.direction;
  const baselineSafetyMarginBps = Math.round((Math.abs(midpoint - baselineThresholdPriceUsd) / midpoint) * 10_000);
  const baselineCandidateConfidence = candidateConfidenceFor(baselineSafetyMarginBps, recentRangeBps);
  return {
    recentRangeBps,
    driftBps,
    midpoint,
    baselineThresholdPriceUsd,
    baselineDirection,
    baselineSafetyMarginBps,
    baselineCandidateConfidence,
  };
}

// Maps safety-margin / observed-range ratio to a baseline confidence anchor.
// This is the exact formula the system prompt describes so the model has
// a numeric anchor to start from rather than reinventing the heuristic.
function candidateConfidenceFor(safetyMarginBps: number, recentRangeBps: number): number {
  const range = Math.max(recentRangeBps, 1);
  const r = safetyMarginBps / range;
  if (r >= 3.0) return 9000;
  if (r >= 2.0) return 8000;
  if (r >= 1.5) return 7000;
  if (r >= 1.0) return 6000;
  if (r >= 0.5) return 5000;
  return 4000;
}

function renderPriceHistoryForPrompt(history: Array<{ publishTime: number; priceE8: bigint }>): string | null {
  if (history.length === 0) return null;
  const sorted = [...history].sort((a, b) => a.publishTime - b.publishTime);
  const prices = sorted.map((s) => Number(s.priceE8) / 1e8);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const first = prices[0];
  const last = prices[prices.length - 1];
  const rangeBps = (((max - min) / ((min + max) / 2)) * 10_000).toFixed(0);
  const driftBps = (((last - first) / first) * 10_000).toFixed(0);
  const lines = sorted.map((s) => {
    const ts = new Date(s.publishTime * 1000).toISOString().replace("T", " ").slice(0, 16) + "Z";
    return `  ${ts}  ${(Number(s.priceE8) / 1e8).toFixed(6)}`;
  });
  return [
    `MNT/USD recent Pyth snapshots (oldest → newest):`,
    ...lines,
    `Range: ${min.toFixed(6)} to ${max.toFixed(6)} (${rangeBps} bps) | Drift first→last: ${driftBps} bps`,
  ].join("\n");
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === "number" ? Math.round(value) : Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}
