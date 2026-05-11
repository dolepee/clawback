const HERMES_BASE = "https://hermes.pyth.network";

export const PYTH_MNT_USD_FEED = "0x4e3037c822d852d79af3ac80e35eb420ee3b870dca49f9344a38ef4773fb0585" as const;
export const PYTH_ETH_USD_FEED = "0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace" as const;
export const PYTH_CONTRACT = "0x98046Bd286715D3B0BC227Dd7a956b83D8978603" as const;

export async function fetchUpdateBundle(feedIds: `0x${string}`[]): Promise<`0x${string}`[]> {
  const params = feedIds.map((id) => `ids[]=${id.replace(/^0x/, "")}`).join("&");
  const url = `${HERMES_BASE}/v2/updates/price/latest?${params}&encoding=hex`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Pyth Hermes ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { binary: { data: string[] } };
  return data.binary.data.map((h) => (h.startsWith("0x") ? h : `0x${h}`) as `0x${string}`);
}
