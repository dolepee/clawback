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

const DISCONNECTED_KEY = "clawback.wallet.disconnected";
const WALLET_CHANGED_EVENT = "clawback.wallet.changed";

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
    if (typeof window === "undefined") return;

    const refresh = () => {
      if (!window.ethereum) {
        setInstalled(false);
        setAccount(null);
        setChainId(null);
        return;
      }
      setInstalled(true);
      window.ethereum.request({ method: "eth_chainId" }).then((id) => setChainId(parseInt(id as string, 16))).catch(() => {});
      if (window.localStorage.getItem(DISCONNECTED_KEY) === "1") {
        setAccount(null);
        return;
      }
      window.ethereum.request({ method: "eth_accounts" }).then((res) => {
        const accs = res as string[];
        setAccount((accs && accs[0]) ? (accs[0] as Hex) : null);
      }).catch(() => setAccount(null));
    };

    refresh();
    const initTimer = window.setTimeout(refresh, 500);

    const onAccounts = (...args: unknown[]) => {
      const accs = args[0] as string[];
      window.localStorage.removeItem(DISCONNECTED_KEY);
      setAccount((accs && accs[0]) ? (accs[0] as Hex) : null);
    };
    const onChain = (...args: unknown[]) => setChainId(parseInt(args[0] as string, 16));
    const onWalletChanged = () => refresh();
    const onEthereumInitialized = () => refresh();
    window.ethereum?.on?.("accountsChanged", onAccounts);
    window.ethereum?.on?.("chainChanged", onChain);
    window.addEventListener(WALLET_CHANGED_EVENT, onWalletChanged);
    window.addEventListener("ethereum#initialized", onEthereumInitialized);
    return () => {
      window.clearTimeout(initTimer);
      window.ethereum?.removeListener?.("accountsChanged", onAccounts);
      window.ethereum?.removeListener?.("chainChanged", onChain);
      window.removeEventListener(WALLET_CHANGED_EVENT, onWalletChanged);
      window.removeEventListener("ethereum#initialized", onEthereumInitialized);
    };
  }, []);

  async function connect() {
    if (!window.ethereum) throw new Error("No injected wallet detected. Install MetaMask.");
    window.localStorage.removeItem(DISCONNECTED_KEY);
    const accs = (await window.ethereum.request({ method: "eth_requestAccounts" })) as string[];
    if (!accs[0]) throw new Error("No wallet account selected.");
    setAccount(accs[0] as Hex);
    const id = parseInt((await window.ethereum.request({ method: "eth_chainId" })) as string, 16);
    setChainId(id);
    if (id !== mantleSepolia.id) {
      await switchToMantleSepolia();
    }
  }

  async function disconnect() {
    window.localStorage.setItem(DISCONNECTED_KEY, "1");
    setAccount(null);
    try {
      await window.ethereum?.request({
        method: "wallet_revokePermissions",
        params: [{ eth_accounts: {} }],
      });
    } catch {
      // Not every injected wallet supports permission revocation. The local
      // disconnected flag still keeps the dapp UI disconnected.
    } finally {
      window.dispatchEvent(new Event(WALLET_CHANGED_EVENT));
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
    disconnect,
    switchToMantleSepolia,
    walletClient,
  };
}
