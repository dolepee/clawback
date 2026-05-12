import { NextResponse } from "next/server";
import { buildHealth } from "@/lib/live-stats";

export const revalidate = 60;

export async function GET() {
  const health = await buildHealth();
  return NextResponse.json(health);
}
