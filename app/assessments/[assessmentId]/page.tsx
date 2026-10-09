"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AppNav } from "@/components/app-nav";
import { ProtectedPage } from "@/components/protected-page";
import { useWallet } from "@/components/wallet-provider";
import { getAssessmentForWallet, type StoredAssessment } from "@/lib/genlayer";

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Date unavailable" : new Intl.DateTimeFormat("en", { dateStyle: "full", timeStyle: "short" }).format(date);
}

export default function AssessmentDetailPage() {
  const params = useParams<{ assessmentId: string }>();
  const { address } = useWallet();
  const [assessment, setAssessment] = useState<StoredAssessment | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!address || !params.assessmentId) return;
    let active = true;
    void getAssessmentForWallet(address, params.assessmentId).then((record) => {
      if (active) { setAssessment(record); setError(record ? null : "This assessment is not available for the connected wallet."); }
    }).catch((caught) => { if (active) setError(caught instanceof Error ? caught.message : "Clause could not load this assessment."); }).finally(() => { if (active) setIsLoading(false); });
    return () => { active = false; };
  }, [address, params.assessmentId]);

  return <ProtectedPage><main>
    <AppNav />
    <section className="assessment-detail shell">
      <Link className="text-button" href="/assessments">← My assessments</Link>
      {isLoading && <p className="history-state">Loading assessment…</p>}
      {!isLoading && error && <div className="history-state history-state--error"><p>{error}</p></div>}
      {!isLoading && assessment && <><div className="assessment-detail__heading"><div><p className="eyebrow">Assessment #{assessment.assessment_id}</p><h1>{assessment.title}</h1><p>{formatDate(assessment.assessed_at)}</p></div><span className={`history-card__status history-card__status--${assessment.report.conclusion.replaceAll("_", "-")}`}>{assessment.report.conclusion.replaceAll("_", " ")}</span></div><div className="assessment-detail__grid"><article><p className="eyebrow">Redacted contract assessed</p><pre>{assessment.contract_text}</pre></article><article><p className="eyebrow">Assessment report</p><h2>{assessment.report.findings.length} findings</h2>{assessment.report.findings.map((finding) => <div className="detail-finding" key={finding.id}><span className={`attention attention--${finding.severity}`}>{finding.severity}</span><h3>{finding.clause_reference}</h3><p>{finding.summary}</p><b>Consider asking</b><p>{finding.question}</p></div>)}{(assessment.report.missing_context.length > 0 || assessment.report.uncertainty.length > 0) && <div className="detail-notes">{assessment.report.missing_context.length > 0 && <div><b>Missing context</b><ul>{assessment.report.missing_context.map((item) => <li key={item}>{item}</li>)}</ul></div>}{assessment.report.uncertainty.length > 0 && <div><b>Assessment uncertainty</b><ul>{assessment.report.uncertainty.map((item) => <li key={item}>{item}</li>)}</ul></div>}</div>}</article></div></>}
    </section>
  </main></ProtectedPage>;
}
