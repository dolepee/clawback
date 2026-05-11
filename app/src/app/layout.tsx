import type { Metadata } from "next";
import { ADDRESSES, EXPLORER } from "@/lib/addresses";
import { shortHex } from "@/lib/format";
import { WalletButton } from "@/components/WalletButton";
import "./globals.css";

export const metadata: Metadata = {
  title: "Clawback",
  description: "AI calls that pay you back when they are wrong.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen flex flex-col">
        <header className="border-b border-neutral-800 px-6 py-4 flex items-center justify-between">
          <a href="/" className="font-bold tracking-tight text-lg">Clawback</a>
          <nav className="flex gap-6 text-sm text-neutral-400 items-center">
            <a href="/leaderboard" className="hover:text-white">Leaderboard</a>
            <a href="/settle" className="hover:text-white">Settle</a>
            <span className="text-xs px-2 py-1 rounded bg-neutral-900 border border-neutral-800 text-neutral-400">
              Mantle Sepolia
            </span>
            <WalletButton />
          </nav>
        </header>
        <main className="px-6 py-8 flex-1">{children}</main>
        <footer className="border-t border-neutral-800 px-6 py-6 text-xs text-neutral-500">
          <div className="max-w-5xl mx-auto flex flex-wrap gap-x-6 gap-y-2">
            <a className="hover:text-neutral-300" href={`${EXPLORER}/address/${ADDRESSES.claimMarket}`} target="_blank" rel="noreferrer">
              ClaimMarket {shortHex(ADDRESSES.claimMarket)}
            </a>
            <a className="hover:text-neutral-300" href={`${EXPLORER}/address/${ADDRESSES.clawbackEscrow}`} target="_blank" rel="noreferrer">
              ClawbackEscrow {shortHex(ADDRESSES.clawbackEscrow)}
            </a>
            <a className="hover:text-neutral-300" href={`${EXPLORER}/address/${ADDRESSES.agentRegistry}`} target="_blank" rel="noreferrer">
              AgentRegistry {shortHex(ADDRESSES.agentRegistry)}
            </a>
            <a className="hover:text-neutral-300" href={`${EXPLORER}/address/${ADDRESSES.reputationLedger}`} target="_blank" rel="noreferrer">
              ReputationLedger {shortHex(ADDRESSES.reputationLedger)}
            </a>
            <a className="hover:text-neutral-300" href={`${EXPLORER}/address/${ADDRESSES.pythSettlementAdapter}`} target="_blank" rel="noreferrer">
              PythAdapter {shortHex(ADDRESSES.pythSettlementAdapter)}
            </a>
          </div>
          <div className="max-w-5xl mx-auto mt-3 text-neutral-600">
            AI on chain function: <span className="font-mono text-neutral-400">ClaimMarket.commitClaim</span>
            <span className="mx-2 text-neutral-700">·</span>
            Settled trustlessly by <span className="font-mono text-neutral-400">PythSettlementAdapter</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
