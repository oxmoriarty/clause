"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AppNav } from "@/components/app-nav";
import { ProtectedPage } from "@/components/protected-page";
import { useWallet } from "@/components/wallet-provider";
import { getAssessmentForWallet, getAssessmentSummaries, type AssessmentSummary, type StoredAssessment } from "@/lib/genlayer";

type SeverityFilter = "all" | "high" | "moderate" | "low";
type DateFilter = "all" | "week" | "month" | "year";

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Date unavailable" : new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function isWithinDateRange(value: string, range: DateFilter) {
  if (range === "all") return true;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  const days = range === "week" ? 7 : range === "month" ? 30 : 365;
  return date.getTime() >= Date.now() - days * 24 * 60 * 60 * 1000;
}

export default function AssessmentsPage() {
  const { address } = useWallet();
  const [assessments, setAssessments] = useState<AssessmentSummary[]>([]);
  const [records, setRecords] = useState<Record<string, StoredAssessment>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [severity, setSeverity] = useState<SeverityFilter>("all");
  const [dateRange, setDateRange] = useState<DateFilter>("all");

  useEffect(() => {
    if (!address) return;
    const walletAddress = address;
    let active = true;
    async function loadAssessments() {
      try {
        const summaries = await getAssessmentSummaries(walletAddress);
        const loadedRecords = await Promise.all(summaries.map(async (summary) => {
          try { return await getAssessmentForWallet(walletAddress, summary.assessment_id); } catch { return null; }
        }));
        if (!active) return;
        setAssessments(summaries);
        setRecords(Object.fromEntries(loadedRecords.filter((record): record is StoredAssessment => Boolean(record)).map((record) => [record.assessment_id, record])));
        setError(null);
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : "Clause could not load assessment history.");
      } finally {
        if (active) setIsLoading(false);
      }
    }
    void loadAssessments();
    return () => { active = false; };
  }, [address]);

  const filteredAssessments = useMemo(() => {
    const query = search.trim().toLowerCase();
    return assessments.filter((assessment) => {
      const report = records[assessment.assessment_id]?.report;
      const searchableReport = report?.findings.map((finding) => `${finding.category} ${finding.clause_reference} ${finding.summary}`).join(" ").toLowerCase() ?? "";
      const matchesSearch = !query || `${assessment.title} ${assessment.assessment_id} ${searchableReport}`.toLowerCase().includes(query);
      const matchesSeverity = severity === "all" || Boolean(report?.findings.some((finding) => finding.severity === severity));
      return matchesSearch && matchesSeverity && isWithinDateRange(assessment.assessed_at, dateRange);
    });
  }, [assessments, dateRange, records, search, severity]);

  return <ProtectedPage restoringTitle="Loading your Assessments…" restoringDescription="Finding assessments associated with your wallet."><main>
    <AppNav />
    <section className="history-page shell"><h1>My assessments.</h1>
      {isLoading && <p className="history-state">Loading your assessment history…</p>}
      {!isLoading && error && <div className="history-state history-state--error"><p>{error}</p><p>Assessment history requires the new Clause V2 contract.</p></div>}
      {!isLoading && !error && assessments.length === 0 && <div className="history-state history-state--empty"><p>No assessments yet.</p><Link className="text-button" href="/assess">Assess your first contract <span>→</span></Link></div>}
      {!isLoading && !error && assessments.length > 0 && <>
        <form className="history-tools" onSubmit={(event) => event.preventDefault()} aria-label="Filter assessments">
          <label className="history-search"><span>Search</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Title, clause, or risk" type="search" /></label>
          <label><span>Risk severity</span><select value={severity} onChange={(event) => setSeverity(event.target.value as SeverityFilter)}><option value="all">All risks</option><option value="high">High</option><option value="moderate">Moderate</option><option value="low">Low</option></select></label>
          <label><span>Date assessed</span><select value={dateRange} onChange={(event) => setDateRange(event.target.value as DateFilter)}><option value="all">All time</option><option value="week">Last 7 days</option><option value="month">Last 30 days</option><option value="year">Last year</option></select></label>
          <p>{filteredAssessments.length} of {assessments.length} shown</p>
        </form>
        {filteredAssessments.length === 0 ? <div className="history-state history-state--empty history-state--filtered"><p>No assessments match those filters.</p><button className="text-button" type="button" onClick={() => { setSearch(""); setSeverity("all"); setDateRange("all"); }}>Clear filters</button></div> : <div className="history-list">{filteredAssessments.map((assessment) => <Link href={`/assessments/${assessment.assessment_id}`} className="history-row" key={assessment.assessment_id}><div><span className={`history-card__status history-card__status--${assessment.conclusion.replaceAll("_", "-")}`}>{assessment.conclusion.replaceAll("_", " ")}</span><h2>{assessment.title}</h2></div><p>{assessment.finding_count} finding{assessment.finding_count === 1 ? "" : "s"}</p><p>{formatDate(assessment.assessed_at)}</p><span>Open <b>→</b></span></Link>)}</div>}
      </>}
    </section>
  </main></ProtectedPage>;
}
