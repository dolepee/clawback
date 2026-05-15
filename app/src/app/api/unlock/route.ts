import { NextResponse } from "next/server";
import { createWalletClient, http, isAddress, isHex, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mantleSepolia, publicClient } from "@/lib/chain";
import { ADDRESSES, RPC_URL } from "@/lib/addresses";
import { q402AdapterAbi } from "@/lib/abi";

/// Facilitator backed unlock. Payer signs an EIP-712 Witness in the browser,
/// posts it here. This server submits Q402Adapter.accept from the facilitator
/// key, so the payer pays zero MNT gas. Mirrors the cron facilitator path.

interface UnlockBody {
  claimId: string;
  owner: string;
  amount: string;
  deadline: string;
  paymentId: string;
  nonce: string;
  signature: string;
}

function parseBody(json: unknown): UnlockBody | null {
  if (typeof json !== "object" || json === null) return null;
  const b = json as Record<string, unknown>;
  if (typeof b.claimId !== "string") return null;
  if (typeof b.owner !== "string" || !isAddress(b.owner)) return null;
  if (typeof b.amount !== "string") return null;
  if (typeof b.deadline !== "string") return null;
  if (typeof b.paymentId !== "string" || !isHex(b.paymentId) || b.paymentId.length !== 66) return null;
  if (typeof b.nonce !== "string") return null;
  if (typeof b.signature !== "string" || !isHex(b.signature)) return null;
  return b as unknown as UnlockBody;
}

export async function POST(req: Request) {
  const key = process.env.FACILITATOR_PRIVATE_KEY;
  if (!key) {
    return NextResponse.json({ error: "facilitator not configured" }, { status: 503 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const body = parseBody(raw);
  if (!body) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  let witness: {
    owner: `0x${string}`;
    claimId: bigint;
    amount: bigint;
    deadline: bigint;
    paymentId: Hex;
    nonce: bigint;
  };
  try {
    witness = {
      owner: body.owner as `0x${string}`,
      claimId: BigInt(body.claimId),
      amount: BigInt(body.amount),
      deadline: BigInt(body.deadline),
      paymentId: body.paymentId as Hex,
      nonce: BigInt(body.nonce),
    };
  } catch {
    return NextResponse.json({ error: "bigint parse failed" }, { status: 400 });
  }

  const facilitatorKey = key.startsWith("0x") ? (key as Hex) : (`0x${key}` as Hex);
  const account = privateKeyToAccount(facilitatorKey);
  const wallet = createWalletClient({ account, chain: mantleSepolia, transport: http(RPC_URL) });

  try {
    const txHash = await wallet.writeContract({
      address: ADDRESSES.q402Adapter as `0x${string}`,
      abi: q402AdapterAbi,
      functionName: "accept",
      args: [witness, body.signature as Hex],
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
    return NextResponse.json({
      ok: true,
      txHash,
      blockNumber: receipt.blockNumber.toString(),
      gasUsed: receipt.gasUsed.toString(),
      facilitator: account.address,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
