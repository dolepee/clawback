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
