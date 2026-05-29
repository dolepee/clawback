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

export interface MarketObservation {
  pair: string;
  observedPrice: string;
  mntPriceUsdt: string;
  methPriceUsdt: string;
  pythMntE8?: bigint;
  pythEthE8?: bigint;
  blockNumber: string;
}

export interface LlmDecision {
  thresholdPriceUsd: number;
  direction: "above" | "below";
  confidenceBps: number;
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

const DECISION_SCHEMA_INSTRUCTIONS = `You are a bonded trading agent on Mantle Sepolia. You publish binary price claims on MNT/USD that settle via Pyth after expiry. You lose your bond when wrong, so be honest about uncertainty.

Output exactly this JSON, nothing else:

{
  "thresholdPriceUsd": <number between 0.30 and 1.50>,
  "direction": "above" | "below",
  "confidenceBps": <integer 4000-9000>,
  "reasoning": "<one or two sentences"
}

direction "above" means you claim MNT/USD stays above the threshold for the entire 6h window.
direction "below" means you claim MNT/USD drops below the threshold within the 6h window.
confidenceBps reflects your subjective certainty (5000 = 50%, 9000 = 90%).`;

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
    "",
    "Pick a 6h threshold claim. Be conservative; you forfeit your bond when wrong.",
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

    const decision: LlmDecision = {
      thresholdPriceUsd: clampNumber(parsed.thresholdPriceUsd, 0.3, 1.5, fallback.thresholdPriceUsd),
      direction:
        parsed.direction === "above" || parsed.direction === "below" ? parsed.direction : fallback.direction,
      confidenceBps: clampInt(parsed.confidenceBps, 4000, 9000, fallback.confidenceBps),
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
      reasoning: `LLM unavailable (${(err as Error).message}); used baseline ${fallback.direction} ${fallback.thresholdPriceUsd}.`,
      model: `${config.model}+fallback`,
      fellBack: true,
    };
  }
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
