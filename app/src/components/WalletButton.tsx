"use client";

import { useWallet } from "@/lib/wallet";

function short(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function WalletButton() {
  const { account, installed, onCorrectChain, connect, disconnect, switchToMantleSepolia } = useWallet();

  if (!installed) {
    return (
      <a
        href="https://metamask.io/download/"
        target="_blank"
        rel="noreferrer"
        className="min-h-10 rounded-lg border border-emerald-300/45 bg-white/[0.025] px-4 py-2 text-sm font-semibold text-neutral-100 transition-colors hover:border-emerald-200 hover:text-white"
      >
        Install wallet
      </a>
    );
  }

  if (!account) {
    return (
      <button
        onClick={() => connect().catch((e) => alert(e.message))}
        className="min-h-10 rounded-lg border border-emerald-300/45 bg-emerald-300 px-4 py-2 text-sm font-bold text-black transition-colors hover:bg-emerald-200"
      >
        Connect wallet
      </button>
    );
  }

  if (!onCorrectChain) {
    return (
      <button
        onClick={() => switchToMantleSepolia().catch((e) => alert(e.message))}
        className="min-h-10 rounded-lg border border-red-400/45 bg-red-500/15 px-4 py-2 text-sm font-semibold text-red-100 hover:bg-red-500/25"
      >
        Switch to Mantle Sepolia
      </button>
    );
  }

  return (
    <button
      onClick={() => disconnect().catch((e) => alert(e.message))}
      className="min-h-10 rounded-lg border border-emerald-300/30 bg-emerald-300/10 px-4 py-2 text-sm font-semibold text-emerald-200 hover:border-emerald-300/60 hover:text-emerald-100"
      title={`Disconnect ${account}`}
    >
      <span className="hidden font-mono md:inline">
        {short(account)}
      </span>
      <span className="hidden px-1 text-emerald-600 md:inline">·</span>
      Disconnect
    </button>
  );
}
