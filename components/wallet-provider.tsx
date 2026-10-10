"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  connectStudionetWallet,
  discoverWallets,
  setActiveWalletProvider,
  type WalletOption,
  userFacingSubmissionError,
} from "@/lib/genlayer";

type WalletContextValue = {
  address: string | null;
  wallets: WalletOption[];
  isRestoring: boolean;
  isConnecting: boolean;
  isWalletChooserOpen: boolean;
  walletError: string | null;
  connect: (walletId?: string, requestAccountSelection?: boolean) => Promise<string>;
  disconnect: () => void;
  openWalletChooser: () => void;
  closeWalletChooser: () => void;
};

const WalletContext = createContext<WalletContextValue | null>(null);
const walletStorageKey = "clause:connected-wallet";
const walletProviderStorageKey = "clause:wallet-provider";
const addressPattern = /^0x[a-fA-F0-9]{40}$/;

export function WalletProvider({ children }: Readonly<{ children: React.ReactNode }>) {
  const [address, setAddress] = useState<string | null>(null);
  const [wallets, setWallets] = useState<WalletOption[]>([]);
  const [isRestoring, setIsRestoring] = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isWalletChooserOpen, setIsWalletChooserOpen] = useState(false);
  const [walletError, setWalletError] = useState<string | null>(null);

  async function refreshWallets() {
    const discovered = await discoverWallets();
    setWallets(discovered);
    return discovered;
  }

  useEffect(() => {
    let active = true;

    async function restoreWallet() {
      try {
        const discovered = await refreshWallets();
        const savedProviderId = window.localStorage.getItem(walletProviderStorageKey);
        const savedWallet = savedProviderId
          ? discovered.find((wallet) => wallet.id === savedProviderId)
          : discovered.length === 1
            ? discovered[0]
            : null;

        if (!savedWallet) {
          if (active) window.localStorage.removeItem(walletStorageKey);
          return;
        }

        setActiveWalletProvider(savedWallet.provider);
        const accounts = await savedWallet.provider.request({ method: "eth_accounts" });
        const account = Array.isArray(accounts) && typeof accounts[0] === "string" ? accounts[0] : null;
        if (active && account && addressPattern.test(account)) {
          setAddress(account);
          window.localStorage.setItem(walletStorageKey, account);
        } else if (active) {
          setActiveWalletProvider(null);
          window.localStorage.removeItem(walletStorageKey);
          window.localStorage.removeItem(walletProviderStorageKey);
        }
      } catch {
        if (active) {
          setActiveWalletProvider(null);
          window.localStorage.removeItem(walletStorageKey);
          window.localStorage.removeItem(walletProviderStorageKey);
        }
      } finally {
        if (active) setIsRestoring(false);
      }
    }

    void restoreWallet();
    return () => { active = false; };
  }, []);

  async function connect(walletId?: string, requestAccountSelection = false) {
    setIsConnecting(true);
    setWalletError(null);
    try {
      const discovered = await refreshWallets();
      const savedProviderId = window.localStorage.getItem(walletProviderStorageKey);
      const wallet = walletId
        ? discovered.find((candidate) => candidate.id === walletId)
        : discovered.find((candidate) => candidate.id === savedProviderId) ?? (discovered.length === 1 ? discovered[0] : null);

      if (!wallet) {
        setIsWalletChooserOpen(true);
        throw new Error("Choose a wallet to connect to Clause.");
      }

      const account = await connectStudionetWallet({
        provider: wallet.provider,
        requestAccountSelection,
      });
      setAddress(account);
      window.localStorage.setItem(walletStorageKey, account);
      window.localStorage.setItem(walletProviderStorageKey, wallet.id);
      setIsWalletChooserOpen(false);
      return account;
    } catch (error) {
      setWalletError(userFacingSubmissionError(error));
      throw error;
    } finally {
      setIsConnecting(false);
    }
  }

  function disconnect() {
    setAddress(null);
    setActiveWalletProvider(null);
    window.localStorage.removeItem(walletStorageKey);
    window.localStorage.removeItem(walletProviderStorageKey);
  }

  function openWalletChooser() {
    setWalletError(null);
    setIsWalletChooserOpen(true);
    void refreshWallets();
  }

  function closeWalletChooser() {
    if (!isConnecting) setIsWalletChooserOpen(false);
  }

  const value = useMemo(() => ({
    address,
    wallets,
    isRestoring,
    isConnecting,
    isWalletChooserOpen,
    walletError,
    connect,
    disconnect,
    openWalletChooser,
    closeWalletChooser,
  }), [address, wallets, isRestoring, isConnecting, isWalletChooserOpen, walletError]);

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet() {
  const value = useContext(WalletContext);
  if (!value) throw new Error("useWallet must be used within WalletProvider.");
  return value;
}
