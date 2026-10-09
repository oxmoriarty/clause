"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { AppNav } from "@/components/app-nav";
import { ProtectedPage } from "@/components/protected-page";
import { useWallet } from "@/components/wallet-provider";
import { getAssessmentForWallet, type StoredAssessment, type VerifiedFinding } from "@/lib/genlayer";

const severityOrder = ["high", "moderate", "low"] as const;

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Date unavailable" : new Intl.DateTimeFormat("en", { dateStyle: "full", timeStyle: "short" }).format(date);
}

function referenceTerms(reference: string) {
  const ignored = new Set(["agreement", "contract"]);
  return [...new Set(reference
    .split("/")
    .map((part) => part.trim().replace(/^\d+[.)]?\s*/, ""))
    .filter((part) => part.length >= 4 && !ignored.has(part.toLowerCase()))
  )].sort((first, second) => second.length - first.length);
}

function highlightReferencedText(contractText: string, reference: string | null): ReactNode {
  if (!reference) return contractText;
  const terms = referenceTerms(reference);
  if (!terms.length) return contractText;
  const expression = new RegExp(`(${terms.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "ig");
  return contractText.split(expression).map((part, index) => terms.some((term) => part.toLowerCase() === term.toLowerCase())
    ? <mark className="contract-reference-mark" key={`${part}-${index}`}>{part}</mark>
    : part,
  );
}

export default function AssessmentDetailPage() {
  const params = useParams<{ assessmentId: string }>();
  const { address } = useWallet();
  const [assessment, setAssessment] = useState<StoredAssessment | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeFindingId, setActiveFindingId] = useState<string | null>(null);

  useEffect(() => {
    if (!address || !params.assessmentId) return;
    let active = true;
    void getAssessmentForWallet(address, params.assessmentId).then((record) => {
      if (active) { setAssessment(record); setError(record ? null : "This assessment is not available for the connected wallet."); }
    }).catch((caught) => { if (active) setError(caught instanceof Error ? caught.message : "Clause could not load this assessment."); }).finally(() => { if (active) setIsLoading(false); });
    return () => { active = false; };
  }, [address, params.assessmentId]);

  const severityCounts = useMemo(() => severityOrder.map((severity) => ({
    severity,
    count: assessment?.report.findings.filter((finding) => finding.severity === severity).length ?? 0,
  })), [assessment]);
  const activeFinding = assessment?.report.findings.find((finding) => finding.id === activeFindingId) ?? null;

  useEffect(() => {
    if (!activeFindingId) return;
    const frame = window.requestAnimationFrame(() => {
      const target = document.querySelector<HTMLElement>("#submitted-contract .contract-reference-mark") ?? document.getElementById("submitted-contract");
      target?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeFindingId]);

  function locateFinding(finding: VerifiedFinding) {
    setActiveFindingId(finding.id);
  }

  return <ProtectedPage><main>
    <AppNav />
    <section className="assessment-detail shell">
      <Link className="text-button print-hidden" href="/assessments">← My assessments</Link>
      {isLoading && <p className="history-state">Loading assessment…</p>}
      {!isLoading && error && <div className="history-state history-state--error"><p>{error}</p></div>}
      {!isLoading && assessment && <>
        <div className="assessment-detail__heading">
          <div><p className="eyebrow">Assessment #{assessment.assessment_id}</p><h1>{assessment.title}</h1><p>{formatDate(assessment.assessed_at)}</p></div>
          <div className="assessment-detail__actions print-hidden"><Link className="detail-action detail-action--quiet" href="/assess">New assessment <span>→</span></Link><button className="detail-action" type="button" onClick={() => window.print()}>Print / save PDF <span>↗</span></button></div>
        </div>

        <div className="assessment-detail__ledger" aria-label="Assessment summary">
          <div><p className="eyebrow">Consensus conclusion</p><span className={`history-card__status history-card__status--${assessment.report.conclusion.replaceAll("_", "-")}`}>{assessment.report.conclusion.replaceAll("_", " ")}</span></div>
          <div className="severity-ledger"><p className="eyebrow">Finding severity</p><dl>{severityCounts.map(({ severity, count }) => <div key={severity}><dt>{severity}</dt><dd>{count}</dd></div>)}</dl></div>
          <div><p className="eyebrow">Total findings</p><strong>{assessment.report.findings.length}</strong></div>
        </div>

        <div className="assessment-detail__grid">
          <article>
            <p className="eyebrow">Redacted contract assessed</p>
            <p className="contract-reference-status" aria-live="polite">{activeFinding ? <>Showing text related to <b>{activeFinding.clause_reference}</b>.</> : "Select a finding to locate its referenced clause."}</p>
            <pre id="submitted-contract">{highlightReferencedText(assessment.contract_text, activeFinding?.clause_reference ?? null)}</pre>
          </article>
          <article>
            <p className="eyebrow">Assessment report</p><h2>{assessment.report.findings.length} findings</h2>
            {assessment.report.findings.map((finding) => <div className={activeFindingId === finding.id ? "detail-finding detail-finding--active" : "detail-finding"} key={finding.id}>
              <div className="detail-finding__meta"><span className={`attention attention--${finding.severity}`}>{finding.severity}</span><button type="button" onClick={() => locateFinding(finding)}>{activeFindingId === finding.id ? "Located in contract" : "Locate in contract"} <span>←</span></button></div>
              <h3>{finding.clause_reference}</h3><p>{finding.summary}</p><b>Consider asking</b><p>{finding.question}</p>
            </div>)}
            {(assessment.report.missing_context.length > 0 || assessment.report.uncertainty.length > 0) && <div className="detail-notes">{assessment.report.missing_context.length > 0 && <div><b>Missing context</b><ul>{assessment.report.missing_context.map((item) => <li key={item}>{item}</li>)}</ul></div>}{assessment.report.uncertainty.length > 0 && <div><b>Assessment uncertainty</b><ul>{assessment.report.uncertainty.map((item) => <li key={item}>{item}</li>)}</ul></div>}</div>}
          </article>
        </div>
      </>}
    </section>
  </main></ProtectedPage>;
}
