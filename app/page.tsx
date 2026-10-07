"use client";

import { ChangeEvent, DragEvent, useEffect, useMemo, useRef, useState } from "react";
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
  const [isPublicPreviewReady, setIsPublicPreviewReady] = useState(false);
  const [redactionSummary, setRedactionSummary] = useState<RedactionSummary | null>(null);
  const [entityDetection, setEntityDetection] = useState<"local_model" | "rules_only" | null>(null);
  const [entityDetectionNote, setEntityDetectionNote] = useState<string | null>(null);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [walletPanelOpen, setWalletPanelOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isAssessing, setIsAssessing] = useState(false);
  const [isReadingUpload, setIsReadingUpload] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isStartingCamera, setIsStartingCamera] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isConnectingWallet, setIsConnectingWallet] = useState(false);
  const [publicTextApproved, setPublicTextApproved] = useState(false);
  const [submissionStage, setSubmissionStage] = useState<string | null>(null);
  const [verifiedAssessment, setVerifiedAssessment] = useState<VerifiedAssessment | null>(null);
  const [transactionHash, setTransactionHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const previewRun = useRef(0);
  const uploadRun = useRef(0);
  const ocrWorker = useRef<{ terminate: () => Promise<unknown> } | null>(null);
  const cameraVideo = useRef<HTMLVideoElement | null>(null);
  const cameraStream = useRef<MediaStream | null>(null);
  const cameraRun = useRef(0);

  const visibleText = isPublicPreviewReady ? publicText : text;
  const wordCount = useMemo(() => (visibleText.trim() ? visibleText.trim().split(/\s+/).length : 0), [visibleText]);

  useEffect(() => () => {
    cameraStream.current?.getTracks().forEach((track) => track.stop());
  }, []);

  function resetPreview() {
    setIsPublicPreviewReady(false);
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
    setError(null);
    setIsAssessing(true);
    try {
      const redacted = await redactSensitiveTextWithLocalNer(text);
      if (previewRun.current !== run) return;
      setPublicText(redacted.text);
      setRedactionSummary(redacted.summary);
      setEntityDetection(redacted.entityDetection);
      setEntityDetectionNote(redacted.entityDetectionNote ?? null);
      setIsPublicPreviewReady(true);
      setPublicTextApproved(false);
      setVerifiedAssessment(null);
      setTransactionHash(null);
    } catch (caught) {
      if (previewRun.current !== run) return;
      setError(caught instanceof Error ? caught.message : "We could not create the private preview.");
    } finally {
      if (previewRun.current === run) {
        setIsAssessing(false);
      }
    }
  }

  function cancelPreview() {
    previewRun.current += 1;
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

  function cancelUploadRead() {
    uploadRun.current += 1;
    void ocrWorker.current?.terminate();
    ocrWorker.current = null;
    setIsReadingUpload(false);
    setUploadProgress(null);
  }

  function releaseCamera() {
    cameraStream.current?.getTracks().forEach((track) => track.stop());
    cameraStream.current = null;
    if (cameraVideo.current) cameraVideo.current.srcObject = null;
  }

  function closeScanner() {
    cameraRun.current += 1;
    releaseCamera();
    setIsScannerOpen(false);
    setIsStartingCamera(false);
    setCameraError(null);
  }

  async function startScanner() {
    if (isAssessing || isReadingUpload) return;
    const run = cameraRun.current + 1;
    cameraRun.current = run;
    releaseCamera();
    setIsScannerOpen(true);
    setIsStartingCamera(true);
    setCameraError(null);

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError("This browser does not provide camera access. Use an image upload instead.");
      setIsStartingCamera(false);
      return;
    }

    try {
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      });
      if (cameraRun.current !== run) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      cameraStream.current = stream;
      if (!cameraVideo.current) throw new Error("The camera preview could not start.");
      cameraVideo.current.srcObject = stream;
      await cameraVideo.current.play();
    } catch (caught) {
      if (cameraRun.current !== run) return;
      const name = caught instanceof DOMException ? caught.name : "";
      if (name === "NotAllowedError" || name === "SecurityError") {
        setCameraError("Camera permission was denied. Allow it in your browser, then try again.");
      } else if (name === "NotFoundError") {
        setCameraError("No camera was found on this device. Upload a photo instead.");
      } else {
        setCameraError(caught instanceof Error ? caught.message : "We could not start the camera.");
      }
      releaseCamera();
    } finally {
      if (cameraRun.current === run) setIsStartingCamera(false);
    }
  }

  function captureScan() {
    const video = cameraVideo.current;
    if (!video || video.videoWidth < 1 || video.videoHeight < 1) {
      setCameraError("The camera is still preparing. Please wait a moment and try again.");
      return;
    }

    // Preserve legibility while keeping local OCR responsive on mobile devices.
    const longestSide = Math.max(video.videoWidth, video.videoHeight);
    const scale = Math.min(1, 2000 / longestSide);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const context = canvas.getContext("2d");
    if (!context) {
      setCameraError("We could not prepare this camera image.");
      return;
    }
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob) {
        setCameraError("We could not capture this page. Please try again.");
        return;
      }
      closeScanner();
      void acceptFile(new File([blob], `clause-scan-${Date.now()}.jpg`, { type: "image/jpeg" }));
    }, "image/jpeg", 0.92);
  }

  async function acceptFile(file: File | undefined) {
    if (!file || isAssessing || isReadingUpload) return;
    const run = uploadRun.current + 1;
    uploadRun.current = run;
    setError(null);
    resetPreview();
    setFileName(file.name);
    const isDocx = file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || /\.docx$/i.test(file.name);
    const isImage = file.type.startsWith("image/") || /\.(png|jpe?g|webp)$/i.test(file.name);
    const isPlainText = ["text/plain", "text/markdown", "text/html"].includes(file.type) || /\.(txt|md|html?)$/i.test(file.name);
    if (!isPlainText && !isDocx && !isImage) {
      setError("Clause can read pasted text, .txt, .md, .html, .docx, PNG, JPEG, and WebP files locally. PDF upload is not enabled yet.");
      return;
    }
    setIsReadingUpload(true);
    try {
      if (isDocx) {
        const mammoth = await import("mammoth");
        const result = await mammoth.default.extractRawText({ arrayBuffer: await file.arrayBuffer() });
        if (!result.value.trim()) throw new Error("This DOCX file did not contain readable text.");
        if (uploadRun.current !== run) return;
        setText(result.value);
      } else if (isImage) {
        setUploadProgress("Preparing local OCR…");
        const Tesseract = await import("tesseract.js");
        const worker = await Tesseract.createWorker("eng", 1, {
          logger: (message) => {
            if (uploadRun.current !== run) return;
            const percent = Math.round(message.progress * 100);
            setUploadProgress(percent ? `${message.status} · ${percent}%` : message.status);
          },
        });
        ocrWorker.current = worker;
        const result = await worker.recognize(file);
        await worker.terminate();
        ocrWorker.current = null;
        if (uploadRun.current !== run) return;
        if (!result.data.text.trim()) throw new Error("No readable text was found in this image.");
        setText(result.data.text);
      } else {
        const extractedText = await file.text();
        if (uploadRun.current !== run) return;
        setText(extractedText);
      }
    } catch (caught) {
      if (uploadRun.current !== run) return;
      setFileName(null);
      setError(caught instanceof Error ? `We could not read this file locally: ${caught.message}` : "We could not read this file locally.");
    } finally {
      if (uploadRun.current === run) {
        ocrWorker.current = null;
        setIsReadingUpload(false);
        setUploadProgress(null);
      }
    }
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);
    if (isAssessing || isReadingUpload) return;
    void acceptFile(event.dataTransfer.files[0]);
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    if (isAssessing || isReadingUpload) return;
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
          <div><p className="eyebrow">Private workspace</p><h2 id="workspace-title">{isPublicPreviewReady ? "Review the public copy." : "Bring the agreement."}</h2></div>
          <p>{isPublicPreviewReady ? "The original stays on this device. Review the editable redacted copy before you decide whether to ask GenLayer for an assessment." : "Nothing is sent to GenLayer while you create a redacted, editable copy."}</p>
        </div>

        <div className={["intake-grid", isPublicPreviewReady ? "intake-grid--review" : ""].join(" ")}>
          {isPublicPreviewReady ? (
            <aside className="private-brief" aria-label="Private contract preview">
              <div className="private-brief__header"><p className="eyebrow">Privacy boundary / local only</p><span className="local-badge">Original hidden</span></div>
              <h3>No assessment yet.</h3>
              <p className="private-brief__note">Clause has only prepared a redacted copy. Risks, findings, and conclusions are produced solely by the Intelligent Contract after a successful GenLayer Studionet transaction.</p>
              <div className="private-boundary"><p><span>01</span> Review the editable copy on the right.</p><p><span>02</span> Approve only text you are comfortable making public.</p><p><span>03</span> Submit to GenLayer for the first assessment.</p></div>
              <button className="text-button private-brief__restart" onClick={resetPreview}>Return to original contract</button>
            </aside>
          ) : (
            <div className={["dropzone", isDragging ? "dropzone--active" : "", isAssessing || isReadingUpload ? "dropzone--locked" : ""].join(" ")} aria-disabled={isAssessing || isReadingUpload} onDragEnter={() => !isAssessing && !isReadingUpload && setIsDragging(true)} onDragOver={(event) => event.preventDefault()} onDragLeave={() => setIsDragging(false)} onDrop={onDrop}>
              <div className="dropzone__ornament">↗</div>
              <p className="dropzone__label">Drop a document</p>
              <p className="dropzone__detail">Text, DOCX, and images stay local.<br />PDF upload: next.</p>
              <div className="dropzone-actions"><label className={["file-button", isAssessing || isReadingUpload ? "file-button--locked" : ""].join(" ")}>Choose a file<input type="file" accept=".txt,.md,.html,.htm,.docx,.png,.jpg,.jpeg,.webp" onChange={onFileChange} disabled={isAssessing || isReadingUpload} /></label><button className="camera-button" onClick={() => void startScanner()} disabled={isAssessing || isReadingUpload}><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 8V5h3M17 5h3v3M20 16v3h-3M7 19H4v-3M8 9h8v6H8z" /></svg>Scan</button></div>
              {fileName && <p className="file-name">Selected: {fileName}</p>}
              {isReadingUpload && <div className="upload-processing" role="status" aria-live="polite"><span className="redaction-processing__pulse" aria-hidden="true" /><p>{uploadProgress ?? "Reading document locally…"}</p><button onClick={cancelUploadRead}>Cancel</button></div>}
            </div>
          )}

          <div className={["paste-panel", isPublicPreviewReady ? "paste-panel--redacted" : ""].join(" ")}>
            <div className="paste-panel__top"><label htmlFor="agreement">{isPublicPreviewReady ? "Editable public-safe copy" : "Or paste the agreement"}</label><span>{wordCount.toLocaleString()} words</span></div>
            {isPublicPreviewReady && <p className="redaction-banner"><span>●</span> {entityDetection === "local_model" ? "Local name, organization and location detection plus privacy rules ran in your browser." : "Built-in privacy rules ran locally."} No contract assessment has been performed.</p>}
            {isAssessing && <div className="redaction-processing" role="status" aria-live="polite"><div className="redaction-processing__copy"><span className="redaction-processing__pulse" aria-hidden="true" /><div><strong>Creating your private preview</strong><p>Clause is finding sensitive details locally. Your text and document controls are locked until the redacted copy is ready.</p></div></div><button className="redaction-processing__cancel" onClick={cancelPreview}>Cancel</button><div className="redaction-processing__bar" role="progressbar" aria-label="Creating private preview" aria-valuetext="Redacting sensitive information locally"><span /></div></div>}
            <textarea id="agreement" value={visibleText} disabled={isAssessing || isReadingUpload} onChange={(event) => {
              if (isPublicPreviewReady) { setPublicText(event.target.value); setPublicTextApproved(false); } else { setText(event.target.value); }
              setVerifiedAssessment(null); setTransactionHash(null);
            }} placeholder="Paste the contract text here. Clause will create a private preview and a redacted, editable review copy." />
            <div className="paste-panel__bottom">
              {isPublicPreviewReady ? <><span className="redaction-count">{redactionSummary?.total ?? 0} automatic redactions</span><button className="text-button" onClick={() => void analyze()} disabled={isAssessing || isReadingUpload}>Recreate redacted copy</button></> : <><button className="text-button" onClick={() => { setText(demoAgreement); resetPreview(); }} disabled={isAssessing || isReadingUpload}>Use sample agreement</button><button className="primary-button" onClick={() => void analyze()} disabled={isAssessing || isReadingUpload || text.trim().length < 80}>{isAssessing ? "Creating private copy…" : "Create private copy"}<span>→</span></button></>}
            </div>
          </div>
        </div>

        {error && <p className="message message--error" role="alert">{error}</p>}

        {isPublicPreviewReady && <div className="submission-bar">
          <div><p className="eyebrow">Public submission check</p><p>Automatic redaction removed {redactionSummary?.total ?? 0} high-confidence items. It may miss context-specific details—edit this copy until it is safe to disclose. No risk assessment has been made at this stage.</p>{entityDetectionNote && <p className="redaction-model-note">{entityDetectionNote}</p>}{redactionSummary?.categories.length ? <p className="redaction-categories">{redactionSummary.categories.map((category) => `${category.count} ${category.label}`).join(" · ")}</p> : null}<label className="public-consent"><input type="checkbox" checked={publicTextApproved} onChange={(event) => setPublicTextApproved(event.target.checked)} /><span>I reviewed this exact copy and approve making it public on GenLayer Studionet for Intelligent Contract assessment.</span></label></div>
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
      {isScannerOpen && <div className="scanner-backdrop" role="presentation"><section className="scanner-modal" role="dialog" aria-modal="true" aria-labelledby="scanner-title"><button className="modal-close" aria-label="Close camera scanner" onClick={closeScanner}>×</button><p className="eyebrow">Private camera scan</p><h2 id="scanner-title">Frame one page.</h2><p className="scanner-modal__lede">Keep the page flat, bright, and fully inside the frame. The captured image and text stay on this device.</p><div className="scanner-viewfinder">{!cameraError && <video ref={cameraVideo} autoPlay muted playsInline />}{!cameraError && <span className="scanner-viewfinder__frame" aria-hidden="true" />}{isStartingCamera && <div className="scanner-viewfinder__status">Opening camera…</div>}{cameraError && <div className="scanner-viewfinder__status scanner-viewfinder__status--error">{cameraError}</div>}</div><div className="scanner-actions"><button className="modal-button modal-button--quiet" onClick={closeScanner}>Cancel</button>{cameraError ? <button className="modal-button" onClick={() => void startScanner()}>Try again</button> : <button className="modal-button" onClick={captureScan} disabled={isStartingCamera}>Capture page</button>}</div></section></div>}
    </main>
  );
}
