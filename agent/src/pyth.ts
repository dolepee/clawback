const HERMES_BASE = process.env.PYTH_HERMES_URL ?? "https://hermes.pyth.network";

export interface PythPriceSnapshot {
  id: `0x${string}`;
  priceE8: bigint;
  publishTime: number;
}

interface HermesResponse {
  parsed: {
    id: string;
    price: { price: string; conf: string; expo: number; publish_time: number };
  }[];
}

export async function fetchPythPriceE8(feedId: `0x${string}`): Promise<PythPriceSnapshot> {
  const url = `${HERMES_BASE}/v2/updates/price/latest?ids[]=${feedId.replace(/^0x/, "")}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Pyth Hermes ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as HermesResponse;
  const parsed = data.parsed.find((p) => `0x${p.id.toLowerCase()}` === feedId.toLowerCase());
  if (!parsed) throw new Error(`feed ${feedId} not returned`);
  return {
    id: feedId,
    priceE8: toE8(BigInt(parsed.price.price), parsed.price.expo),
    publishTime: parsed.price.publish_time,
  };
}

function toE8(raw: bigint, expo: number): bigint {
  if (expo === -8) return raw;
  if (expo < -8) return raw / 10n ** BigInt(-8 - expo);
  return raw * 10n ** BigInt(expo + 8);
}
