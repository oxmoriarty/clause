"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useWallet } from "@/components/wallet-provider";

function shortAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function AppNav() {
  const pathname = usePathname();
  const { address, connect, disconnect, isConnecting } = useWallet();
  const [menuOpen, setMenuOpen] = useState(false);

  const links = [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/assess", label: "Assess a contract" },
    { href: "/assessments", label: "My assessments" },
  ];

  return <nav className="nav app-nav shell" aria-label="Primary navigation">
    <Link className="wordmark" href={address ? "/dashboard" : "/"} aria-label="Clause home">clause<span>.</span></Link>
    {address && <div className="app-nav__links">{links.map((link) => <Link key={link.href} className={pathname === link.href || (link.href === "/assessments" && pathname.startsWith("/assessments/")) ? "is-active" : ""} href={link.href}>{link.label}</Link>)}</div>}
    <div className="nav__right">
      <span className="status-dot" /> Private by default
      {address ? <button className="wallet-button" onClick={() => setMenuOpen(true)}>Studionet · {shortAddress(address)}</button> : <button className="wallet-button" onClick={() => void connect().catch(() => undefined)} disabled={isConnecting}>{isConnecting ? "Connecting…" : "Connect wallet"}</button>}
    </div>
    {menuOpen && address && <div className="wallet-modal-backdrop" role="presentation"><section className="wallet-modal" role="dialog" aria-modal="true" aria-labelledby="wallet-title"><button className="modal-close" aria-label="Close wallet menu" onClick={() => setMenuOpen(false)}>×</button><p className="eyebrow">Wallet connected</p><h2 id="wallet-title">Your connection</h2><dl><div><dt>Wallet address</dt><dd>{address}</dd></div><div><dt>Network</dt><dd>GenLayer Studionet</dd></div></dl><button className="modal-button" onClick={() => void connect(true).catch(() => undefined)} disabled={isConnecting}>{isConnecting ? "Opening wallet…" : "Switch wallet"}</button><button className="modal-button modal-button--quiet" onClick={() => { disconnect(); setMenuOpen(false); }}>Disconnect wallet</button><p className="wallet-modal__note">Disconnecting clears Clause’s connection in this browser. Your wallet extension stays unlocked until you lock it there.</p></section></div>}
  </nav>;
}
