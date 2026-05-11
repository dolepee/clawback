"use client";

import { useEffect, useState } from "react";
import {
  createPublicClient,
  createWalletClient,
  custom,
  http,
  type Hex,
  type WalletClient,
} from "viem";
import { mantleSepolia } from "./chain";

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown }) => Promise<unknown>;
      on?: (event: string, handler: (...args: unknown[]) => void) => void;
      removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
      isMetaMask?: boolean;
    };
  }
}

export const publicClient = createPublicClient({
  chain: mantleSepolia,
  transport: http(undefined, { batch: true }),
});

export function useWallet() {
  const [account, setAccount] = useState<Hex | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [installed, setInstalled] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.ethereum) return;
    setInstalled(true);
    window.ethereum.request({ method: "eth_accounts" }).then((res) => {
      const accs = res as string[];
      if (accs && accs[0]) setAccount(accs[0] as Hex);
    });
    window.ethereum.request({ method: "eth_chainId" }).then((id) => setChainId(parseInt(id as string, 16)));

    const onAccounts = (...args: unknown[]) => {
      const accs = args[0] as string[];
      setAccount((accs && accs[0]) ? (accs[0] as Hex) : null);
    };
    const onChain = (...args: unknown[]) => setChainId(parseInt(args[0] as string, 16));
    window.ethereum.on?.("accountsChanged", onAccounts);
    window.ethereum.on?.("chainChanged", onChain);
    return () => {
      window.ethereum?.removeListener?.("accountsChanged", onAccounts);
      window.ethereum?.removeListener?.("chainChanged", onChain);
    };
  }, []);

  async function connect() {
    if (!window.ethereum) throw new Error("No injected wallet detected. Install MetaMask.");
    const accs = (await window.ethereum.request({ method: "eth_requestAccounts" })) as string[];
    setAccount(accs[0] as Hex);
    const id = parseInt((await window.ethereum.request({ method: "eth_chainId" })) as string, 16);
    setChainId(id);
    if (id !== mantleSepolia.id) {
      await switchToMantleSepolia();
    }
  }

  async function switchToMantleSepolia() {
    if (!window.ethereum) return;
    const hex = `0x${mantleSepolia.id.toString(16)}`;
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: hex }],
      });
    } catch (err: unknown) {
      const e = err as { code?: number };
      if (e?.code === 4902) {
        await window.ethereum.request({
          method: "wallet_addEthereumChain",
          params: [{
            chainId: hex,
            chainName: mantleSepolia.name,
            nativeCurrency: mantleSepolia.nativeCurrency,
            rpcUrls: mantleSepolia.rpcUrls.default.http,
            blockExplorerUrls: [mantleSepolia.blockExplorers.default.url],
          }],
        });
      } else {
        throw err;
      }
    }
  }

  function walletClient(): WalletClient {
    if (!window.ethereum) throw new Error("No injected wallet");
    if (!account) throw new Error("Wallet not connected");
    return createWalletClient({
      account,
      chain: mantleSepolia,
      transport: custom(window.ethereum),
    });
  }

  return {
    account,
    chainId,
    installed,
    onCorrectChain: chainId === mantleSepolia.id,
    connect,
    switchToMantleSepolia,
    walletClient,
  };
}
