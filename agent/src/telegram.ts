// Telegram receipts channel. Every bonded call, paid unlock, settlement,
// refund, and payout posts to the public channel with its Mantle receipt
// link. This is the Alpha & Data delivery surface: the alpha the agents
// publish, where subscribers actually consume it.
//
// Failure-tolerant by design: no token/channel configured means no-op,
// and a Telegram outage can never fail a cron step.

const TG_API = "https://api.telegram.org";

export async function sendTelegram(text: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const channel = process.env.TELEGRAM_CHANNEL;
  if (!token || !channel) return;
  try {
    const res = await fetch(`${TG_API}/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: channel, text, disable_web_page_preview: true }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) {
      console.warn(`telegram notify failed: HTTP ${res.status}`);
    }
  } catch (error) {
    console.warn("telegram notify failed:", error instanceof Error ? error.message : error);
  }
}

export function usd(amount: bigint): string {
  const sign = amount < 0n ? "-" : "";
  const abs = amount < 0n ? -amount : amount;
  const whole = abs / 1_000_000n;
  const frac = (abs % 1_000_000n).toString().padStart(6, "0").slice(0, 2);
  return `${sign}$${whole}.${frac}`;
}
