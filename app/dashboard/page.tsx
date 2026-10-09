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

function conclusionLabel(value: AssessmentSummary["conclusion"]) {
  if (value === "no_high_attention") return "No high attention";
  if (value === "unable_to_determine") return "Unable to determine";
  return "Attention required";
}

export default function DashboardPage() {
  const { address } = useWallet();
  const [assessments, setAssessments] = useState<AssessmentSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!address) return;
    let active = true;
    setIsLoading(true);
    void getAssessmentSummaries(address).then((records) => {
      if (active) { setAssessments(records); setError(null); }
    }).catch((caught) => {
      if (active) setError(caught instanceof Error ? caught.message : "Clause could not load assessment history.");
    }).finally(() => { if (active) setIsLoading(false); });
    return () => { active = false; };
  }, [address]);

  return <ProtectedPage><main>
    <AppNav />
    <section className="dashboard-history shell" aria-labelledby="recent-assessments-title">
      <div className="section-heading"><div><h2 id="recent-assessments-title">Recent Assessments</h2></div><Link className="text-button" href="/assessments">View all assessments</Link></div>
      {isLoading && <p className="history-state">Loading your assessment history…</p>}
      {!isLoading && error && <div className="history-state history-state--error"><p>{error}</p><p>Deploy the new history-enabled Clause contract, then replace the address in <code>.env.local</code>.</p></div>}
      {!isLoading && !error && assessments.length === 0 && <div className="history-state history-state--empty"><p>No assessments yet.</p><Link className="text-button" href="/assess">Assess your first contract <span>→</span></Link></div>}
      {!isLoading && !error && assessments.length > 0 && <div className="history-grid">{assessments.slice(0, 3).map((assessment) => <Link className="history-card" href={`/assessments/${assessment.assessment_id}`} key={assessment.assessment_id}><div><span className={`history-card__status history-card__status--${assessment.conclusion.replaceAll("_", "-")}`}>{conclusionLabel(assessment.conclusion)}</span><span>#{assessment.assessment_id}</span></div><h3>{assessment.title}</h3><p>{assessment.finding_count} finding{assessment.finding_count === 1 ? "" : "s"} · {formatDate(assessment.assessed_at)}</p><b>Open report <span>→</span></b></Link>)}</div>}
    </section>
  </main></ProtectedPage>;
}
