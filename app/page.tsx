"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppNav } from "@/components/app-nav";
import { useWallet } from "@/components/wallet-provider";

export default function Home() {
  const router = useRouter();
  const { address, openWalletChooser, isConnecting } = useWallet();
  const [shouldOpenDashboard, setShouldOpenDashboard] = useState(false);

  useEffect(() => {
    if (shouldOpenDashboard && address) router.push("/dashboard");
  }, [address, router, shouldOpenDashboard]);

  function startNow() {
    setShouldOpenDashboard(true);
    openWalletChooser();
  }

  return <main>
    <AppNav />
    <section className="landing-hero shell">
      <p className="eyebrow">Private first · GenLayer verified</p>
      <h1>Know the terms<br />before they become<br /><em>your obligations.</em></h1>
      <p className="landing-hero__lede">Clause helps you find risks in contracts before you sign them.</p>
      <div className="landing-hero__actions">
        <button className="primary-button landing-hero__start" onClick={() => address ? router.push("/dashboard") : startNow()} disabled={isConnecting}>{isConnecting ? "Connecting wallet…" : address ? "Go to dashboard" : "Start now"}<span>→</span></button>
        <p>Your original contract stays on your device while you prepare a redacted copy for assessment.</p>
      </div>
    </section>
    <section className="landing-principles shell" aria-label="How Clause works">
      <article><span>01</span><h2>Upload your contract.</h2><p>Upload, paste, or scan a contract to get an editable redacted version.</p></article>
      <article><span>02</span><h2>Review the public copy.</h2><p>Review the redacted, public-safe copy before it is assessed.</p></article>
      <article><span>03</span><h2>Get your assessment.</h2><p>Submit the approved copy to receive a report of practical risks.</p></article>
    </section>
  </main>;
}
