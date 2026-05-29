export const maxDuration = 60;
import { NextResponse } from "next/server";
import { buildStats } from "@/lib/live-stats";

export const dynamic = "force-dynamic";
export const revalidate = 60;

export async function GET() {
  const stats = await buildStats();
  const json = JSON.parse(
    JSON.stringify(stats, (_, v) => (typeof v === "bigint" ? v.toString() : v)),
  );
  return NextResponse.json(json);
}
