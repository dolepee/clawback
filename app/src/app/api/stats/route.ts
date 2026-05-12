import { NextResponse } from "next/server";
import { buildStats } from "@/lib/live-stats";

export const revalidate = 60;

export async function GET() {
  const stats = await buildStats();
  return NextResponse.json(stats);
}
