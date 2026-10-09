"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { connectStudionetWallet } from "@/lib/genlayer";

type BrowserProvider = {
  request: (request: { method: string; params?: unknown[] }) => Promise<unknown>;
};

type WalletContextValue = {
  address: string | null;
  isRestoring: boolean;
  isConnecting: boolean;
  connect: (requestAccountSelection?: boolean) => Promise<string>;
  disconnect: () => void;
};

const WalletContext = createContext<WalletContextValue | null>(null);
const walletStorageKey = "clause:connected-wallet";
const addressPattern = /^0x[a-fA-F0-9]{40}$/;

function browserProvider(): BrowserProvider | null {
  return (window as Window & { ethereum?: BrowserProvider }).ethereum ?? null;
}

export function WalletProvider({ children }: Readonly<{ children: React.ReactNode }>) {
  const [address, setAddress] = useState<string | null>(null);
  const [isRestoring, setIsRestoring] = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);

  useEffect(() => {
    let active = true;

    async function restoreWallet() {
      const provider = browserProvider();
      if (!provider) {
        if (active) setIsRestoring(false);
        return;
      }

      try {
        const accounts = await provider.request({ method: "eth_accounts" });
        const account = Array.isArray(accounts) && typeof accounts[0] === "string" ? accounts[0] : null;
        if (active && account && addressPattern.test(account)) {
          setAddress(account);
          window.localStorage.setItem(walletStorageKey, account);
        } else if (active) {
          window.localStorage.removeItem(walletStorageKey);
        }
      } finally {
        if (active) setIsRestoring(false);
      }
    }

    void restoreWallet();
    return () => { active = false; };
  }, []);

  async function connect(requestAccountSelection = false) {
    setIsConnecting(true);
    try {
      const account = await connectStudionetWallet({ requestAccountSelection });
      setAddress(account);
      window.localStorage.setItem(walletStorageKey, account);
      return account;
    } finally {
      setIsConnecting(false);
    }
  }

  function disconnect() {
    setAddress(null);
    window.localStorage.removeItem(walletStorageKey);
  }

  const value = useMemo(() => ({ address, isRestoring, isConnecting, connect, disconnect }), [address, isRestoring, isConnecting]);
  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet() {
  const value = useContext(WalletContext);
  if (!value) throw new Error("useWallet must be used within WalletProvider.");
  return value;
}
