"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useWallet } from "@/components/wallet-provider";

function shortAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function walletInitial(name: string) {
  if (name === "Rabby Wallet") return "R";
  if (name === "Trust Wallet") return "T";
  if (name === "Phantom") return "P";
  if (name === "OKX Wallet") return "O";
  if (name === "Coinbase Wallet") return "C";
  if (name === "MetaMask") return "M";
  return "W";
}

export function AppNav() {
  const pathname = usePathname();
  const {
    address,
    wallets,
    connect,
    disconnect,
    isConnecting,
    isWalletChooserOpen,
    walletError,
    openWalletChooser,
    closeWalletChooser,
  } = useWallet();
  const [menuOpen, setMenuOpen] = useState(false);

  const links = [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/assess", label: "Assess a contract" },
    { href: "/assessments", label: "My assessments" },
  ];

  return <>
    <nav className="nav app-nav shell" aria-label="Primary navigation">
      <Link className="wordmark" href={address ? "/dashboard" : "/"} aria-label="Clause home">clause<span>.</span></Link>
      {address && <div className="app-nav__links">{links.map((link) => <Link key={link.href} className={pathname === link.href || (link.href === "/assessments" && pathname.startsWith("/assessments/")) ? "is-active" : ""} href={link.href}>{link.label}</Link>)}</div>}
      <div className="nav__right">
        {address
          ? <button className="wallet-button" onClick={() => setMenuOpen(true)}>Studionet · {shortAddress(address)}</button>
          : <button className="wallet-button" onClick={openWalletChooser} disabled={isConnecting}>{isConnecting ? "Connecting…" : "Connect wallet"}</button>}
      </div>
    </nav>

    {isWalletChooserOpen && <div className="wallet-modal-backdrop" role="presentation">
      <section className="wallet-modal wallet-picker" role="dialog" aria-modal="true" aria-labelledby="wallet-picker-title">
        <button className="modal-close" aria-label="Close wallet selector" onClick={closeWalletChooser}>×</button>
        <p className="eyebrow">Connect to Clause</p>
        <h2 id="wallet-picker-title">Choose your wallet.</h2>
        <p className="wallet-picker__lede">Connect with a wallet that supports custom EVM networks. Clause will ask it to add or switch to GenLayer Studionet.</p>
        {wallets.length > 0 ? <div className="wallet-picker__options">
          {wallets.map((wallet) => <button className="wallet-option" key={wallet.id} onClick={() => void connect(wallet.id).catch(() => undefined)} disabled={isConnecting}>
            <span className={`wallet-option__mark${wallet.icon ? " wallet-option__mark--logo" : ""}`} aria-hidden="true">{wallet.icon ? <img src={wallet.icon} alt="" /> : walletInitial(wallet.name)}</span>
            <span>{wallet.name}</span>
            <span aria-hidden="true">→</span>
          </button>)}
        </div> : <div className="wallet-picker__empty"><strong>No wallet was detected.</strong><p>On a phone, open Clause inside the MetaMask, Rabby, or Trust Wallet browser. On desktop, install or unlock a wallet extension, then refresh this page.</p></div>}
        {walletError && <p className="wallet-picker__error" role="alert">{walletError}</p>}
        <p className="wallet-modal__note">Your wallet signs the transaction. Clause never sees your recovery phrase or private key.</p>
      </section>
    </div>}

    {menuOpen && address && <div className="wallet-modal-backdrop" role="presentation">
      <section className="wallet-modal" role="dialog" aria-modal="true" aria-labelledby="wallet-title">
        <button className="modal-close" aria-label="Close wallet menu" onClick={() => setMenuOpen(false)}>×</button>
        <p className="eyebrow">Wallet connected</p>
        <h2 id="wallet-title">Your connection</h2>
        <dl><div><dt>Wallet address</dt><dd>{address}</dd></div><div><dt>Network</dt><dd>GenLayer Studionet</dd></div></dl>
        <button className="modal-button" onClick={() => { setMenuOpen(false); openWalletChooser(); }} disabled={isConnecting}>{isConnecting ? "Opening wallet…" : "Switch wallet"}</button>
        <button className="modal-button modal-button--quiet" onClick={() => { disconnect(); setMenuOpen(false); }}>Disconnect wallet</button>
        <p className="wallet-modal__note">Disconnecting clears Clause’s connection in this browser. Your wallet extension stays unlocked until you lock it there.</p>
      </section>
    </div>}
  </>;
}
