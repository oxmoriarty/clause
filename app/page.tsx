"use client";

import { ChangeEvent, DragEvent, useMemo, useState } from "react";
import type { Assessment } from "@/lib/assessment";

const demoAgreement = `CONSULTING SERVICES AGREEMENT

8. Intellectual Property. Consultant hereby irrevocably assigns all intellectual property rights in any work created during the engagement to Client. All work shall be work made for hire.

10. Liability. Consultant shall be liable for all losses, damages, costs and expenses arising from any breach of this Agreement.

12. Termination. Client may terminate immediately and without notice upon any breach. This Agreement automatically renews for successive one-year terms unless either party gives 60 days' notice.

14. Disputes. Any dispute shall be resolved by binding arbitration in the courts of the Client's chosen venue.

This Agreement is governed by the laws of the Federal Republic of Nigeria.`;

function AttentionMark({ level }: { level: string }) {
  return <span className={`attention attention--${level.replaceAll("_", "-")}`}>{level.replaceAll("_", " ")}</span>;
}

export default function Home() {
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isAssessing, setIsAssessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const wordCount = useMemo(() => text.trim() ? text.trim().split(/\s+/).length : 0, [text]);

  async function analyze() {
    setError(null); setIsAssessing(true);
    try {
      const response = await fetch("/api/assess", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "We could not create the preview.");
      setAssessment(data);
      document.getElementById("assessment")?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (caught) { setError(caught instanceof Error ? caught.message : "We could not create the preview."); }
    finally { setIsAssessing(false); }
  }

  async function acceptFile(file: File | undefined) {
    if (!file) return;
    setError(null); setAssessment(null); setFileName(file.name);
    const acceptedText = ["text/plain", "text/markdown", "text/html"].includes(file.type) || /\.(txt|md|html?)$/i.test(file.name);
    if (!acceptedText) { setError("This free local prototype can read pasted text or .txt/.md/.html files today. PDF, DOCX, and image OCR are the next processing milestone; the original is not uploaded anywhere."); return; }
    setText(await file.text());
  }

  function onDrop(event: DragEvent<HTMLDivElement>) { event.preventDefault(); setIsDragging(false); void acceptFile(event.dataTransfer.files[0]); }
  function onFileChange(event: ChangeEvent<HTMLInputElement>) { void acceptFile(event.target.files?.[0]); }

  return <main>
    <nav className="nav shell" aria-label="Primary navigation"><a className="wordmark" href="#top" aria-label="Clause home">clause<span>.</span></a><div className="nav__right"><span className="status-dot" /> Private by default <a href="#how-it-works">How it works</a></div></nav>
    <section className="hero shell" id="top"><div className="hero__index">01 / READ WITH CLARITY</div><p className="eyebrow">Contract reading, without the theatre</p><h1>Know the terms<br />before they become<br /><em>your obligations.</em></h1><p className="hero__lede">Clause turns dense agreements into a calm, practical reading experience. Start privately. Choose GenLayer verification only for a redacted packet you are comfortable making public.</p><div className="hero__notes"><span>No account required to try it</span><span>Not legal advice</span><span>Built for global agreements</span></div></section>
    <section className="workspace shell" aria-labelledby="workspace-title"><div className="workspace__heading"><div><p className="eyebrow">Private workspace</p><h2 id="workspace-title">Bring the agreement.</h2></div><p>Your text stays in this browser for the local preview. Nothing is sent to GenLayer at this stage.</p></div><div className="intake-grid"><div className={`dropzone ${isDragging ? "dropzone--active" : ""}`} onDragEnter={() => setIsDragging(true)} onDragOver={(event) => event.preventDefault()} onDragLeave={() => setIsDragging(false)} onDrop={onDrop}><div className="dropzone__ornament">↗</div><p className="dropzone__label">Drop a document</p><p className="dropzone__detail">Local text files work now.<br />PDF, DOCX, image OCR: next.</p><label className="file-button">Choose a file<input type="file" accept=".txt,.md,.html,.htm,.pdf,.docx,.png,.jpg,.jpeg" onChange={onFileChange} /></label>{fileName && <p className="file-name">Selected: {fileName}</p>}</div><div className="paste-panel"><div className="paste-panel__top"><label htmlFor="agreement">Or paste the agreement</label><span>{wordCount.toLocaleString()} words</span></div><textarea id="agreement" value={text} onChange={(event) => { setText(event.target.value); setAssessment(null); }} placeholder="Paste the contract text here. We will call out practical obligations, attention points, and missing context." /><div className="paste-panel__bottom"><button className="text-button" onClick={() => { setText(demoAgreement); setAssessment(null); }}>Use sample agreement</button><button className="primary-button" onClick={() => void analyze()} disabled={isAssessing || text.trim().length < 80}>{isAssessing ? "Reading terms…" : "Create private preview"}<span>→</span></button></div></div></div>{error && <p className="message message--error" role="alert">{error}</p>}</section>
    {assessment && <section className="assessment shell" id="assessment" aria-labelledby="assessment-title"><div className="assessment__top"><div><p className="eyebrow">Private preview / local rules</p><h2 id="assessment-title">Your reading brief.</h2></div><span className="local-badge">No GenLayer submission</span></div><div className="brief-grid"><article className="brief-summary"><p className="brief-summary__label">First read</p><h3>{assessment.summary}</h3><p>{assessment.confidenceNote}</p><dl><div><dt>Agreement</dt><dd>{assessment.contractType}</dd></div><div><dt>Governing law</dt><dd>{assessment.governingLaw ?? "Not confidently detected"}</dd></div></dl></article><article className="what-agreeing"><p className="brief-summary__label">What to confirm</p><ul>{assessment.obligations.map((item) => <li key={item}>{item}</li>)}</ul><p className="brief-summary__label">Missing context</p><ul>{assessment.missingContext.map((item) => <li key={item}>{item}</li>)}</ul></article></div><div className="findings-header"><p className="eyebrow">Attention points</p><span>{assessment.findings.length} found</span></div>{assessment.findings.length ? <div className="findings">{assessment.findings.map((finding) => <article className="finding" key={finding.id}><div className="finding__meta"><AttentionMark level={finding.attention} /><span>{finding.category}</span></div><h3>{finding.title}</h3><p>{finding.explanation}</p><div className="finding__ask"><span>Ask before signing</span>{finding.ask}</div><p className="finding__evidence">Preview signal: {finding.evidence}</p></article>)}</div> : <div className="empty-findings">No strong pattern matched this short preview. That is not a safety finding—confirm definitions, attachments, payment terms, and the governing-law clause manually.</div>}<div className="verification-callout"><div><p className="eyebrow">The verification boundary</p><h3>Want an assessment validators can check?</h3><p>Clause will first prepare a redacted evidence packet for your review. Submitting it to GenLayer makes that packet and its consensus result public. This build does not submit anything automatically.</p></div><button className="secondary-button" disabled>Prepare public packet <span>↗</span></button></div></section>}
    <section className="principles shell" id="how-it-works"><div className="principles__title"><p className="eyebrow">A deliberate boundary</p><h2>Private reading.<br />Public verification—<em>only by choice.</em></h2></div><ol><li><span>01</span><div><h3>Read privately</h3><p>Extract, organize, and surface questions without uploading the original contract to a chain.</p></div></li><li><span>02</span><div><h3>Choose what can be checked</h3><p>Review a minimal, redacted packet of clauses and public legal sources before disclosure.</p></div></li><li><span>03</span><div><h3>Verify the judgment</h3><p>GenLayer validators independently assess the approved material—not a backend’s unverified answer.</p></div></li></ol></section>
    <footer className="footer shell"><a className="wordmark" href="#top">clause<span>.</span></a><p>Understand before you sign. Not a substitute for legal counsel.</p><span>Studionet-ready / v0.1</span></footer>
  </main>;
}
