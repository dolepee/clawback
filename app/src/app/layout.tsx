import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Clawback",
  description: "AI calls that pay you back when they are wrong.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <header className="border-b border-neutral-800 px-6 py-4 flex items-center justify-between">
          <a href="/" className="font-bold tracking-tight">Clawback</a>
          <nav className="flex gap-6 text-sm text-neutral-400">
            <a href="/leaderboard" className="hover:text-white">Leaderboard</a>
            <a href="/settle" className="hover:text-white">Settle</a>
          </nav>
        </header>
        <main className="px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
