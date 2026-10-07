"use client";

import { ChangeEvent, DragEvent, useMemo, useRef, useState } from "react";
import type { Assessment } from "@/lib/assessment";
import { connectStudionetWallet, isContractConfigured, submitForStudionetAssessment, type VerifiedAssessment } from "@/lib/genlayer";
import { redactSensitiveTextWithLocalNer, type RedactionSummary } from "@/lib/redaction";

const demoAgreement = [
  "CONSULTING SERVICES AGREEMENT",
  "",
  "8. Intellectual Property. Consultant hereby irrevocably assigns all intellectual property rights in any work created during the engagement to Client. All work shall be work made for hire.",
  "",
  "10. Liability. Consultant shall be liable for all losses, damages, costs and expenses arising from any breach of this Agreement.",
  "",
  "12. Termination. Client may terminate immediately and without notice upon any breach. This Agreement automatically renews for successive one-year terms unless either party gives 60 days' notice.",
  "",
  "14. Disputes. Any dispute shall be resolved by binding arbitration in the courts of the Client's chosen venue.",
].join("\n");

function AttentionMark({ level }: { level: string }) {
  return <span className={["attention attention--", level.replaceAll("_", "-")].join("")}>{level.replaceAll("_", " ")}</span>;
}

function conclusionLabel(conclusion: VerifiedAssessment["conclusion"]) {
  if (conclusion === "no_high_attention") return "No high attention found";
  if (conclusion === "unable_to_determine") return "Unable to determine";
  return "Attention required";
}

function shortAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export default function Home() {
  const [text, setText] = useState("");
  const [publicText, setPublicText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [redactionSummary, setRedactionSummary] = useState<RedactionSummary | null>(null);
  const [entityDetection, setEntityDetection] = useState<"local_model" | "rules_only" | null>(null);
  const [entityDetectionNote, setEntityDetectionNote] = useState<string | null>(null);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [walletPanelOpen, setWalletPanelOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isAssessing, setIsAssessing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isConnectingWallet, setIsConnectingWallet] = useState(false);
  const [publicTextApproved, setPublicTextApproved] = useState(false);
  const [submissionStage, setSubmissionStage] = useState<string | null>(null);
  const [verifiedAssessment, setVerifiedAssessment] = useState<VerifiedAssessment | null>(null);
  const [transactionHash, setTransactionHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const previewRun = useRef(0);
  const previewRequest = useRef<AbortController | null>(null);

  const visibleText = assessment ? publicText : text;
  const wordCount = useMemo(() => (visibleText.trim() ? visibleText.trim().split(/\s+/).length : 0), [visibleText]);

  function resetPreview() {
    setAssessment(null);
    setPublicText("");
    setRedactionSummary(null);
    setEntityDetection(null);
    setEntityDetectionNote(null);
    setPublicTextApproved(false);
    setVerifiedAssessment(null);
    setTransactionHash(null);
    setSubmissionStage(null);
  }

  async function analyze() {
    const run = previewRun.current + 1;
    previewRun.current = run;
    const controller = new AbortController();
    previewRequest.current = controller;
    setError(null);
    setIsAssessing(true);
    try {
      const assessmentRequest = fetch("/api/assess", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }), signal: controller.signal });
      const redactionRequest = redactSensitiveTextWithLocalNer(text);
      const [response, redacted] = await Promise.all([assessmentRequest, redactionRequest]);
      if (previewRun.current !== run) return;
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "We could not create the private preview.");
      setAssessment(data);
      setPublicText(redacted.text);
      setRedactionSummary(redacted.summary);
      setEntityDetection(redacted.entityDetection);
      setEntityDetectionNote(redacted.entityDetectionNote ?? null);
      setPublicTextApproved(false);
      setVerifiedAssessment(null);
      setTransactionHash(null);
    } catch (caught) {
      if (controller.signal.aborted || previewRun.current !== run) return;
      setError(caught instanceof Error ? caught.message : "We could not create the private preview.");
    } finally {
      if (previewRun.current === run) {
        previewRequest.current = null;
        setIsAssessing(false);
      }
    }
  }

  function cancelPreview() {
    previewRun.current += 1;
    previewRequest.current?.abort();
    previewRequest.current = null;
    setIsAssessing(false);
  }

  async function connectWallet(requestAccountSelection = false) {
    setError(null);
    setIsConnectingWallet(true);
    try {
      const account = await connectStudionetWallet({ requestAccountSelection });
      setWalletAddress(account);
      setWalletPanelOpen(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "We could not connect your wallet.");
    } finally {
      setIsConnectingWallet(false);
    }
  }

  async function submitToGenLayer() {
    setError(null);
    setIsSubmitting(true);
    setSubmissionStage("Preparing your public submission…");
    try {
      const result = await submitForStudionetAssessment({ contractText: publicText.trim(), onStage: setSubmissionStage });
      setVerifiedAssessment(result.assessment);
      setTransactionHash(result.transactionHash);
      setWalletAddress(result.account);
      setSubmissionStage("Consensus accepted. Your verified report is ready.");
      document.getElementById("verified-assessment")?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "We could not submit the assessment.");
      setSubmissionStage(null);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function acceptFile(file: File | undefined) {
    if (!file || isAssessing) return;
    setError(null);
    resetPreview();
    setFileName(file.name);
    const acceptedText = ["text/plain", "text/markdown", "text/html"].includes(file.type) || /\.(txt|md|html?)$/i.test(file.name);
    if (!acceptedText) {
      setError("This local prototype can read pasted text or .txt/.md/.html files today. PDF, DOCX, and image OCR are not enabled yet.");
      return;
    }
    setText(await file.text());
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);
    if (isAssessing) return;
    void acceptFile(event.dataTransfer.files[0]);
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    if (isAssessing) return;
    void acceptFile(event.target.files?.[0]);
  }

  return (
    <main>
      <nav className="nav shell" aria-label="Primary navigation">
        <a className="wordmark" href="#top" aria-label="Clause home">clause<span>.</span></a>
        <div className="nav__right">
          <span className="status-dot" /> Private by default
          <button className="wallet-button" onClick={() => walletAddress ? setWalletPanelOpen(true) : void connectWallet()} disabled={isConnectingWallet}>
            {isConnectingWallet ? "Connecting…" : walletAddress ? `Studionet · ${shortAddress(walletAddress)}` : "Connect wallet"}
          </button>
        </div>
      </nav>

      <section className="hero shell" id="top">
        <div className="hero__index">01 / READ WITH CLARITY</div>
        <p className="eyebrow">Contract reading, without the theatre</p>
        <h1>Know the terms<br />before they become<br /><em>your obligations.</em></h1>
        <p className="hero__lede">Clause turns dense agreements into a calm, practical reading experience. Start privately. Choose GenLayer verification only for a redacted copy you are comfortable making public.</p>
      </section>

      <section className="workspace shell" aria-labelledby="workspace-title">
        <div className="workspace__heading">
          <div><p className="eyebrow">Private workspace</p><h2 id="workspace-title">{assessment ? "Review, then decide." : "Bring the agreement."}</h2></div>
          <p>{assessment ? "The left panel is your private reading brief. The editable copy on the right is the only text Clause can send to GenLayer." : "Nothing is sent to GenLayer while you are creating a private preview."}</p>
        </div>

        <div className={["intake-grid", assessment ? "intake-grid--review" : ""].join(" ")}>
          {assessment ? (
            <aside className="private-brief" aria-label="Private contract preview">
              <div className="private-brief__header"><p className="eyebrow">Private preview / local only</p><span className="local-badge">Original hidden</span></div>
              <h3>{assessment.summary}</h3>
              <p className="private-brief__note">{assessment.confidenceNote}</p>
              <div className="private-brief__findings">
                {assessment.findings.length ? assessment.findings.map((finding) => (
                  <article key={finding.id} className="private-finding"><div><AttentionMark level={finding.attention} /><span>{finding.category}</span></div><strong>{finding.title}</strong><p>{finding.ask}</p></article>
                )) : <p>No strong pattern matched this preview. Confirm key definitions and attachments manually.</p>}
              </div>
              <button className="text-button private-brief__restart" onClick={resetPreview}>Start over with the original</button>
            </aside>
          ) : (
            <div className={["dropzone", isDragging ? "dropzone--active" : "", isAssessing ? "dropzone--locked" : ""].join(" ")} aria-disabled={isAssessing} onDragEnter={() => !isAssessing && setIsDragging(true)} onDragOver={(event) => event.preventDefault()} onDragLeave={() => setIsDragging(false)} onDrop={onDrop}>
              <div className="dropzone__ornament">↗</div>
              <p className="dropzone__label">Drop a document</p>
              <p className="dropzone__detail">Local text files work now.<br />PDF, DOCX, image OCR: next.</p>
              <label className={["file-button", isAssessing ? "file-button--locked" : ""].join(" ")}>Choose a file<input type="file" accept=".txt,.md,.html,.htm,.pdf,.docx,.png,.jpg,.jpeg" onChange={onFileChange} disabled={isAssessing} /></label>
              {fileName && <p className="file-name">Selected: {fileName}</p>}
            </div>
          )}

          <div className={["paste-panel", assessment ? "paste-panel--redacted" : ""].join(" ")}>
            <div className="paste-panel__top"><label htmlFor="agreement">{assessment ? "Editable public-safe copy" : "Or paste the agreement"}</label><span>{wordCount.toLocaleString()} words</span></div>
            {assessment && <p className="redaction-banner"><span>●</span> {entityDetection === "local_model" ? "Local name, organization and location detection plus privacy rules ran in your browser." : "Built-in privacy rules ran locally."} Review every line before submission.</p>}
            {isAssessing && <div className="redaction-processing" role="status" aria-live="polite"><span className="redaction-processing__pulse" aria-hidden="true" /><div><strong>Creating your private preview</strong><p>Clause is finding sensitive details locally. Your text and document controls are locked until the redacted copy is ready.</p></div><button className="redaction-processing__cancel" onClick={cancelPreview}>Cancel</button></div>}
            <textarea id="agreement" value={visibleText} disabled={isAssessing} onChange={(event) => {
              if (assessment) { setPublicText(event.target.value); setPublicTextApproved(false); } else { setText(event.target.value); }
              setVerifiedAssessment(null); setTransactionHash(null);
            }} placeholder="Paste the contract text here. Clause will create a private preview and a redacted, editable review copy." />
            <div className="paste-panel__bottom">
              {assessment ? <><span className="redaction-count">{redactionSummary?.total ?? 0} automatic redactions</span><button className="text-button" onClick={() => void analyze()} disabled={isAssessing}>Recreate redacted copy</button></> : <><button className="text-button" onClick={() => { setText(demoAgreement); resetPreview(); }} disabled={isAssessing}>Use sample agreement</button><button className="primary-button" onClick={() => void analyze()} disabled={isAssessing || text.trim().length < 80}>{isAssessing ? "Creating local preview…" : "Create private preview"}<span>→</span></button></>}
            </div>
          </div>
        </div>

        {error && <p className="message message--error" role="alert">{error}</p>}

        {assessment && <div className="submission-bar">
          <div><p className="eyebrow">Public submission check</p><p>Automatic redaction removed {redactionSummary?.total ?? 0} high-confidence items. It may miss context-specific details—edit this copy until it is safe to disclose.</p>{entityDetectionNote && <p className="redaction-model-note">{entityDetectionNote}</p>}{redactionSummary?.categories.length ? <p className="redaction-categories">{redactionSummary.categories.map((category) => `${category.count} ${category.label}`).join(" · ")}</p> : null}<label className="public-consent"><input type="checkbox" checked={publicTextApproved} onChange={(event) => setPublicTextApproved(event.target.checked)} /><span>I reviewed this exact copy and approve making it public on GenLayer Studionet.</span></label></div>
          <div className="submission-bar__action">{!isContractConfigured && <p className="configuration-note">Add <code>NEXT_PUBLIC_CLAUSE_CONTRACT_ADDRESS</code> to <code>.env.local</code> to enable submission.</p>}{submissionStage && <p className="submission-stage" role="status">{submissionStage}</p>}<button className="secondary-button public-submit" onClick={() => void submitToGenLayer()} disabled={!isContractConfigured || !publicTextApproved || publicText.trim().length < 20 || publicText.length > 50_000 || isSubmitting}>{isSubmitting ? "Awaiting consensus…" : "Submit to GenLayer"}<span>↗</span></button></div>
        </div>}
      </section>

      {verifiedAssessment && <section className="assessment shell verified-assessment" id="verified-assessment" aria-labelledby="verified-title">
        <div className="assessment__top"><div><p className="eyebrow">Studionet / consensus accepted</p><h2 id="verified-title">Your verified reading brief.</h2></div><AttentionMark level={verifiedAssessment.conclusion} /></div>
        <div className="verified-summary"><div><p className="brief-summary__label">Consensus conclusion</p><h3>{conclusionLabel(verifiedAssessment.conclusion)}</h3></div><dl><div><dt>Assessment</dt><dd>#{verifiedAssessment.assessment_id}</dd></div><div><dt>Transaction</dt><dd className="transaction-hash">{transactionHash}</dd></div></dl></div>
        <div className="findings-header"><p className="eyebrow">Consensus findings</p><span>{verifiedAssessment.findings.length} found</span></div>
        <div className="findings">{verifiedAssessment.findings.map((finding) => <article className="finding" key={finding.id}><div className="finding__meta"><AttentionMark level={finding.severity} /><span>{finding.category}</span></div><h3>{finding.clause_reference}</h3><p>{finding.summary}</p><div className="finding__ask"><span>Consider asking</span>{finding.question}</div></article>)}</div>
      </section>}

      {walletPanelOpen && walletAddress && <div className="wallet-modal-backdrop" role="presentation"><section className="wallet-modal" role="dialog" aria-modal="true" aria-labelledby="wallet-title"><button className="modal-close" aria-label="Close wallet menu" onClick={() => setWalletPanelOpen(false)}>×</button><p className="eyebrow">Wallet connected</p><h2 id="wallet-title">Your connection</h2><dl><div><dt>Wallet address</dt><dd>{walletAddress}</dd></div><div><dt>Network</dt><dd>GenLayer Studionet</dd></div></dl><button className="modal-button" onClick={() => void connectWallet(true)} disabled={isConnectingWallet}>{isConnectingWallet ? "Opening wallet…" : "Switch wallet"}</button><button className="modal-button modal-button--quiet" onClick={() => { setWalletAddress(null); setWalletPanelOpen(false); }}>Disconnect wallet</button><p className="wallet-modal__note">Disconnecting clears Clause’s connection in this browser tab. Your wallet extension stays unlocked until you lock it there.</p></section></div>}
    </main>
  );
}
