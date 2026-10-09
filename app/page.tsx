"use client";

import { useRouter } from "next/navigation";
import { AppNav } from "@/components/app-nav";
import { useWallet } from "@/components/wallet-provider";

export default function Home() {
  const router = useRouter();
  const { address, connect, isConnecting } = useWallet();

  async function startNow() {
    try {
      await connect();
      router.push("/dashboard");
    } catch {
      // The wallet already provides the user with the rejection reason.
    }
  }

  return <main>
    <AppNav />
    <section className="landing-hero shell">
      <p className="eyebrow">Private first · GenLayer verified</p>
      <h1>Know the terms<br />before they become<br /><em>your obligations.</em></h1>
      <p className="landing-hero__lede">Clause helps you find risks in contracts before you sign them.</p>
      <div className="landing-hero__actions">
        <button className="primary-button landing-hero__start" onClick={() => void (address ? router.push("/dashboard") : startNow())} disabled={isConnecting}>{isConnecting ? "Connecting wallet…" : address ? "Go to dashboard" : "Start now"}<span>→</span></button>
        <p>Your original contract stays on your device while you prepare a redacted copy for assessment.</p>
      </div>
    </section>
    <section className="landing-principles shell" aria-label="How Clause works">
      <article><span>01</span><h2>Prepare privately.</h2><p>Upload, paste, or scan a contract. Clause creates an editable redacted version locally in your browser.</p></article>
      <article><span>02</span><h2>Approve deliberately.</h2><p>Review the exact public-safe text before it ever reaches GenLayer.</p></article>
      <article><span>03</span><h2>Return with confidence.</h2><p>Independent validators assess practical risks, then your report stays linked to your wallet history.</p></article>
    </section>
  </main>;
}
