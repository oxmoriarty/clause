"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppNav } from "@/components/app-nav";
import { ProtectedPage } from "@/components/protected-page";
import { useWallet } from "@/components/wallet-provider";
import { getAssessmentSummaries, type AssessmentSummary } from "@/lib/genlayer";

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Date unavailable" : new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export default function AssessmentsPage() {
  const { address } = useWallet();
  const [assessments, setAssessments] = useState<AssessmentSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!address) return;
    let active = true;
    void getAssessmentSummaries(address).then((records) => {
      if (active) { setAssessments(records); setError(null); }
    }).catch((caught) => { if (active) setError(caught instanceof Error ? caught.message : "Clause could not load assessment history."); }).finally(() => { if (active) setIsLoading(false); });
    return () => { active = false; };
  }, [address]);

  return <ProtectedPage><main>
    <AppNav />
    <section className="history-page shell"><h1>My assessments.</h1>
      {isLoading && <p className="history-state">Loading your assessment history…</p>}
      {!isLoading && error && <div className="history-state history-state--error"><p>{error}</p><p>Assessment history requires the new Clause V2 contract.</p></div>}
      {!isLoading && !error && assessments.length === 0 && <div className="history-state history-state--empty"><p>No assessments yet.</p><Link className="text-button" href="/assess">Assess your first contract <span>→</span></Link></div>}
      {!isLoading && !error && assessments.length > 0 && <div className="history-list">{assessments.map((assessment) => <Link href={`/assessments/${assessment.assessment_id}`} className="history-row" key={assessment.assessment_id}><div><span className={`history-card__status history-card__status--${assessment.conclusion.replaceAll("_", "-")}`}>{assessment.conclusion.replaceAll("_", " ")}</span><h2>{assessment.title}</h2></div><p>{assessment.finding_count} finding{assessment.finding_count === 1 ? "" : "s"}</p><p>{formatDate(assessment.assessed_at)}</p><span>Open <b>→</b></span></Link>)}</div>}
    </section>
  </main></ProtectedPage>;
}
