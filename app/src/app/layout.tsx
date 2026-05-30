import type { Metadata } from "next";
import { ADDRESSES, EXPLORER } from "@/lib/addresses";
import { shortHex } from "@/lib/format";
import { WalletButton } from "@/components/WalletButton";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://clawback-bay.vercel.app"),
  title: "Clawback",
  description: "AI calls that pay you back when they are wrong.",
  icons: {
    icon: "/clawback-logo.svg",
    shortcut: "/clawback-logo.svg",
  },
  openGraph: {
    title: "Clawback",
    description: "AI calls that pay you back when they are wrong.",
    type: "website",
    url: "https://clawback-bay.vercel.app",
  },
  twitter: {
    card: "summary_large_image",
    title: "Clawback",
    description: "AI calls that pay you back when they are wrong.",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen flex flex-col">
        <header className="sticky top-0 z-20 border-b border-white/10 bg-black/45 px-4 md:px-6 py-3 md:py-4 backdrop-blur-xl flex items-center justify-between gap-3">
          <a href="/" className="flex items-center gap-2 md:gap-3 font-bold tracking-tight text-base md:text-lg shrink-0">
            <img
              src="/clawback-logo.svg"
              alt="Clawback logo"
              className="h-8 w-8 md:h-9 md:w-9 rounded-xl border border-emerald-300/30 bg-neutral-950 shadow-[0_0_24px_rgba(16,185,129,0.22)]"
            />
            <span>Clawback</span>
          </a>
          <div className="flex items-center gap-3 md:gap-5 min-w-0">
            <nav className="hidden md:flex gap-5 text-sm text-neutral-400 items-center">
              <a href="/how-it-works" className="hover:text-white">How it works</a>
              <a href="/feed" className="hover:text-white">Feed</a>
              <a href="/leaderboard" className="hover:text-white">Leaderboard</a>
              <a href="/settle" className="hover:text-white">Settle</a>
            </nav>
            <span className="hidden md:inline text-xs px-2 py-1 rounded bg-neutral-900 border border-neutral-800 text-neutral-400">
              Mantle Sepolia
            </span>
            <WalletButton />
          </div>
        </header>
        <nav className="md:hidden border-b border-white/10 bg-black/35 px-4 py-2 flex gap-4 text-xs text-neutral-400 overflow-x-auto backdrop-blur-xl">
          <a href="/how-it-works" className="hover:text-white whitespace-nowrap">How it works</a>
          <a href="/feed" className="hover:text-white whitespace-nowrap">Feed</a>
          <a href="/leaderboard" className="hover:text-white whitespace-nowrap">Leaderboard</a>
          <a href="/settle" className="hover:text-white whitespace-nowrap">Settle</a>
          <span className="ml-auto text-[10px] px-2 py-0.5 rounded bg-neutral-900 border border-neutral-800 text-neutral-500 whitespace-nowrap">
            Mantle Sepolia
          </span>
        </nav>
        <main className="px-4 md:px-6 py-6 md:py-8 flex-1">{children}</main>
        <footer className="border-t border-neutral-800 px-4 md:px-6 py-6 text-xs text-neutral-500">
          <div className="max-w-5xl mx-auto flex flex-wrap gap-3 items-center mb-4 text-[11px]">
            <span className="uppercase tracking-[0.24em] text-neutral-400">powered by</span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-400/[0.06] px-2.5 py-1 text-emerald-200/90">
              <span className="size-1.5 rounded-full bg-emerald-300" /> Mantle
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-400/30 bg-violet-400/[0.06] px-2.5 py-1 text-violet-200/90">
              <span className="size-1.5 rounded-full bg-violet-300" /> Pyth oracle
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-400/[0.06] px-2.5 py-1 text-amber-200/90">
              <span className="size-1.5 rounded-full bg-amber-300" /> Bankr LLM
            </span>
            <span className="text-neutral-500">no wallet required to browse</span>
          </div>
          <div className="max-w-5xl mx-auto mb-3 text-neutral-400 max-w-3xl leading-relaxed">
            Every bet, refund, and payout on this site is a real transaction on Mantle Sepolia (a public crypto network).
            Click any of the contract links below to verify on the public block explorer.
          </div>
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
        </footer>
      </body>
    </html>
  );
}
