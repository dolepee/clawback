// Elfa AI real-time triggers for the LlmScout agent.
//
// Once the Mantle Phase II compute credit lands and ELFA_API_KEY is set,
// fetchElfaTriggers() runs before every LLM decision and feeds the model
// a structured snapshot of recent sentiment, smart-money flow, and
// anomaly signals on MNT/USD. Without the key, the function returns null
// and the LLM persona behaves exactly as it does today (Pyth + Merchant
// Moe observation only).
//
// The exact Elfa endpoint shape will be finalized when the API docs land
// from the sponsor. The wire-up below is intentionally tolerant: any
// shape we get back is collapsed into a generic TriggerSignal array and
// rendered into the prompt as a bulleted list. The only contract the
// rest of the code depends on is `{ signals, fetchedAt, source }`.

export interface TriggerSignal {
  // Free-form category. Examples we expect: "sentiment", "smart_money",
  // "anomaly", "narrative", "flow_imbalance". The LLM only needs a label
  // it can reason over.
  kind: string;
  // Short label shown verbatim to the model.
  label: string;
  // Normalised magnitude in [-1, 1] when meaningful, null otherwise.
  // Positive = bullish on MNT, negative = bearish on MNT.
  score: number | null;
  // Single-sentence rationale to give the model context.
  description: string;
  // Unix seconds; signals older than the trigger fetch are dropped.
  validUntil?: number;
}

export interface ElfaSnapshot {
  signals: TriggerSignal[];
  fetchedAt: number;
  source: "elfa" | "elfa+cache" | "fallback";
}

export interface ElfaConfig {
  baseUrl: string;
  apiKey: string;
  symbol: string;
  windowHours: number;
}

export function elfaConfigFromEnv(): ElfaConfig | null {
  const apiKey = process.env.ELFA_API_KEY;
  if (!apiKey) return null;
  return {
    baseUrl: process.env.ELFA_BASE_URL ?? "https://api.elfa.ai/v1",
    apiKey,
    symbol: process.env.ELFA_SYMBOL ?? "MNT",
    windowHours: Number(process.env.ELFA_WINDOW_HOURS ?? 6),
  };
}

export async function fetchElfaTriggers(): Promise<ElfaSnapshot | null> {
  const config = elfaConfigFromEnv();
  if (!config) return null;

  try {
    // TODO: replace the path + payload shape with Elfa's actual endpoint
    // once the sponsor confirms the contract. The placeholder below
    // expects an OpenAPI-style /signals route returning either a
    // pre-shaped array or a generic envelope. Either shape is tolerated
    // by the parser.
    const url = `${config.baseUrl}/signals?symbol=${encodeURIComponent(config.symbol)}&window=${config.windowHours}h`;
    const resp = await fetch(url, {
      method: "GET",
      headers: {
        authorization: `Bearer ${config.apiKey}`,
        accept: "application/json",
      },
      signal: AbortSignal.timeout(8_000),
    });
    if (!resp.ok) {
      const body = await resp.text().catch(() => "");
      console.warn(`[elfa] HTTP ${resp.status}: ${body.slice(0, 200)}`);
      return null;
    }
    const payload = (await resp.json()) as unknown;
    const signals = collapseToSignals(payload);
    return {
      signals,
      fetchedAt: Math.floor(Date.now() / 1000),
      source: "elfa",
    };
  } catch (err) {
    console.warn(`[elfa] fetch threw:`, (err as Error).message);
    return null;
  }
}

// Renders the snapshot as a prompt fragment the LLM can read. The
// LlmScout reasoning loop appends this to the existing observation
// section so the model sees Pyth + Merchant Moe + Elfa together.
export function renderForPrompt(snapshot: ElfaSnapshot | null): string {
  if (!snapshot || snapshot.signals.length === 0) return "";
  const lines = ["Real-time Elfa triggers (last few hours):"];
  for (const sig of snapshot.signals.slice(0, 6)) {
    const score = sig.score == null ? "n/a" : sig.score.toFixed(2);
    lines.push(`- [${sig.kind}] ${sig.label} (score=${score}): ${sig.description}`);
  }
  return lines.join("\n");
}

// Tolerant parser: accepts whatever shape Elfa returns and normalises
// into TriggerSignal[]. Replace once Elfa documents the actual schema.
function collapseToSignals(payload: unknown): TriggerSignal[] {
  if (!payload) return [];
  const candidates =
    Array.isArray(payload)
      ? payload
      : Array.isArray((payload as { data?: unknown[] }).data)
        ? (payload as { data: unknown[] }).data
        : Array.isArray((payload as { signals?: unknown[] }).signals)
          ? (payload as { signals: unknown[] }).signals
          : [];
  const now = Math.floor(Date.now() / 1000);
  const out: TriggerSignal[] = [];
  for (const raw of candidates) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const kind = typeof r.kind === "string" ? r.kind : typeof r.type === "string" ? r.type : "signal";
    const label =
      typeof r.label === "string"
        ? r.label
        : typeof r.name === "string"
          ? r.name
          : typeof r.title === "string"
            ? r.title
            : kind;
    const description =
      typeof r.description === "string"
        ? r.description
        : typeof r.summary === "string"
          ? r.summary
          : typeof r.detail === "string"
            ? r.detail
            : label;
    const score = typeof r.score === "number" ? r.score : typeof r.magnitude === "number" ? r.magnitude : null;
    const validUntil =
      typeof r.validUntil === "number"
        ? r.validUntil
        : typeof r.expires_at === "number"
          ? r.expires_at
          : undefined;
    if (validUntil && validUntil < now) continue;
    out.push({ kind, label, score, description, validUntil });
  }
  return out;
}
