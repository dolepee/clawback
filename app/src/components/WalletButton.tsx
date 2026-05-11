"use client";

import { useWallet } from "@/lib/wallet";

function short(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function WalletButton() {
  const { account, installed, onCorrectChain, connect, switchToMantleSepolia } = useWallet();

  if (!installed) {
    return (
      <a
        href="https://metamask.io/download/"
        target="_blank"
        rel="noreferrer"
        className="text-xs px-3 py-1.5 rounded bg-neutral-900 border border-neutral-800 text-neutral-400 hover:text-white"
      >
        install wallet
      </a>
    );
  }

  if (!account) {
    return (
      <button
        onClick={() => connect().catch((e) => alert(e.message))}
        className="text-xs px-3 py-1.5 rounded bg-amber-600 text-black font-semibold hover:bg-amber-500"
      >
        connect wallet
      </button>
    );
  }

  if (!onCorrectChain) {
    return (
      <button
        onClick={() => switchToMantleSepolia().catch((e) => alert(e.message))}
        className="text-xs px-3 py-1.5 rounded bg-rose-700 text-white hover:bg-rose-600"
      >
        switch to Mantle Sepolia
      </button>
    );
  }

  return (
    <span className="text-xs px-3 py-1.5 rounded bg-emerald-900/40 border border-emerald-800 text-emerald-300 font-mono">
      {short(account)}
    </span>
  );
}
