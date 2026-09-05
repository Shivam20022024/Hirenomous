'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Loader2, Check, X, HelpCircle, FileText, RefreshCw, MessageSquare } from 'lucide-react';
import { fetchApi } from '@/lib/api';

const REC_LABEL: Record<string, string> = {
  strong_match: 'STRONG MATCH',
  match: 'MATCH',
  weak_match: 'WEAK MATCH',
  no_match: 'NO MATCH',
};
const REC_STYLE: Record<string, string> = {
  strong_match: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  match: 'bg-blue-100 text-blue-800 border-blue-200',
  weak_match: 'bg-orange-100 text-orange-800 border-orange-200',
  no_match: 'bg-destructive/10 text-destructive border-destructive/20',
};

const DIMENSIONS: [string, string][] = [
  ['technical_knowledge', 'Technical Knowledge'],
  ['problem_solving', 'Problem Solving'],
  ['communication', 'Communication'],
  ['role_specific', 'Role-specific Skills'],
  ['experience', 'Experience'],
  ['answer_relevance', 'Answer Relevance'],
];

export default function InterviewReportPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id as string;
  const router = useRouter();

  const [report, setReport] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [transcript, setTranscript] = useState<any[] | null>(null);
  const [showTranscript, setShowTranscript] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetchApi(`/interviews/${id}/report`);
      setReport(r);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const openTranscript = async () => {
    setShowTranscript(true);
    if (transcript) return;
    try {
      const t = await fetchApi(`/interviews/${id}/transcript`);
      setTranscript(t.transcript || []);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const reevaluate = async () => {
    setBusy(true);
    try {
      await fetchApi(`/interviews/${id}/reevaluate`, { method: 'POST' });
      await load();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setBusy(false);
    }
  };

  const decide = async (decision: 'select' | 'reject' | 'needs_review') => {
    const labels: Record<string, string> = { select: 'select', reject: 'reject', needs_review: 'mark for human review' };
    if (!confirm(`Are you sure you want to ${labels[decision]} this candidate?`)) return;
    setBusy(true);
    try {
      const res = await fetchApi(`/interviews/${id}/decision`, {
        method: 'POST',
        body: JSON.stringify({ decision }),
      });
      if (decision === 'select') {
        const em = res?.selection_email;
        alert(em?.sent ? 'Candidate selected — selection email sent.' : `Candidate selected. Selection email not sent (${em?.errors?.[0] || 'SMTP not configured'}).`);
      }
      await load();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="p-16 text-center">
        <Loader2 className="mx-auto h-7 w-7 animate-spin text-primary" />
      </div>
    );
  }
  if (!report) {
    return <div className="p-16 text-center text-muted-foreground">Interview not found.</div>;
  }

  const scores = report.scores || {};
  const overall = scores.overall;
  const rec = report.recommendation;
  const aiReport = report.ai_report || {};
  const evaluated = report.evaluation_status === 'evaluated' || report.evaluation_status === 'needs_review';
  const decided = report.recruiter_decision;

  return (
    <div className="mx-auto max-w-[1000px] space-y-6 px-5 py-9 lg:px-8 lg:py-14">
      <Link href="/interviews" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft size={15} /> Back to interviews
      </Link>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-primary">AI Interview Report</p>
          <h1 className="mt-1 text-3xl font-bold tracking-[-0.06em]">{report.candidate_name}</h1>
          <p className="text-muted-foreground">{report.position}</p>
        </div>
        <span className="inline-flex items-center rounded-full bg-muted px-3 py-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {String(report.status).replace('_', ' ')}
        </span>
      </div>

      {report.status !== 'completed' ? (
        <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          This interview has not been completed yet, so there is no report to show.
        </div>
      ) : !evaluated ? (
        <div className="rounded-2xl border border-border bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">
            The interview is complete but the AI evaluation has not finished (status: {report.evaluation_status}).
          </p>
          <button
            onClick={reevaluate}
            disabled={busy}
            className="mt-4 inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw size={14} />} Run evaluation
          </button>
        </div>
      ) : (
        <>
          {/* Overall + recommendation */}
          <div className="grid gap-4 sm:grid-cols-[1fr_1.4fr]">
            <div className="rounded-2xl border border-border bg-card p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Overall Score</p>
              <p className="mt-3 text-4xl font-bold tracking-tight">
                {overall != null ? Math.round(overall) : '—'}
                <span className="text-lg text-muted-foreground"> / 100</span>
              </p>
              {rec && (
                <span className={`mt-4 inline-flex items-center rounded-lg border px-3 py-1.5 text-xs font-bold uppercase tracking-wider ${REC_STYLE[rec] || 'bg-muted'}`}>
                  AI Recommendation: {REC_LABEL[rec] || rec}
                </span>
              )}
              <p className="mt-3 text-[11px] text-muted-foreground">
                Advisory only. The recruiter makes the final decision.
              </p>
            </div>

            <div className="rounded-2xl border border-border bg-card p-6">
              <p className="mb-4 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Breakdown</p>
              <div className="space-y-3">
                {DIMENSIONS.map(([key, label]) => {
                  const v = scores[key];
                  return (
                    <div key={key}>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">{label}</span>
                        <span className="font-semibold">{v != null ? `${Math.round(v)}/100` : '—'}</span>
                      </div>
                      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, v || 0)}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Strengths / areas */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-border bg-card p-6">
              <h3 className="mb-3 text-sm font-bold text-foreground">Strengths</h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                {(aiReport.strengths || []).length ? (
                  aiReport.strengths.map((s: string, i: number) => (
                    <li key={i} className="flex gap-2">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                      {s}
                    </li>
                  ))
                ) : (
                  <li className="text-muted-foreground/70">None highlighted.</li>
                )}
              </ul>
            </div>
            <div className="rounded-2xl border border-border bg-card p-6">
              <h3 className="mb-3 text-sm font-bold text-foreground">Areas to Improve</h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                {(aiReport.areas_to_improve || []).length ? (
                  aiReport.areas_to_improve.map((s: string, i: number) => (
                    <li key={i} className="flex gap-2">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-orange-500" />
                      {s}
                    </li>
                  ))
                ) : (
                  <li className="text-muted-foreground/70">None highlighted.</li>
                )}
              </ul>
            </div>
          </div>

          {aiReport.summary && (
            <div className="rounded-2xl border border-border bg-card p-6">
              <h3 className="mb-2 text-sm font-bold text-foreground">Summary</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">{aiReport.summary}</p>
            </div>
          )}

          {/* Interview meta */}
          <div className="flex flex-wrap gap-6 rounded-2xl border border-border bg-card p-6 text-sm">
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Questions</p>
              <p className="mt-1 font-semibold">{report.questions_total}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Answered</p>
              <p className="mt-1 font-semibold">{report.questions_answered}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Duration</p>
              <p className="mt-1 font-semibold">{report.duration_minutes != null ? `${report.duration_minutes} min` : '—'}</p>
            </div>
            {report.evaluation_status === 'needs_review' && (
              <div className="flex items-center gap-1.5 text-xs font-medium text-orange-600">
                <HelpCircle size={13} /> Flagged for human review (limited interview data)
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card p-6">
            <button
              onClick={openTranscript}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-background px-4 text-sm font-semibold hover:bg-muted"
            >
              <MessageSquare size={15} /> View Transcript
            </button>

            {decided ? (
              <span className="inline-flex items-center gap-2 rounded-xl bg-muted px-4 py-2 text-sm font-semibold text-muted-foreground">
                Recruiter decision: <span className="uppercase text-foreground">{decided}</span>
                {report.recruiter_feedback ? ` — “${report.recruiter_feedback}”` : ''}
              </span>
            ) : (
              <>
                <button
                  onClick={() => decide('select')}
                  disabled={busy}
                  className="inline-flex h-10 items-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
                >
                  <Check size={15} /> Select Candidate
                </button>
                <button
                  onClick={() => decide('reject')}
                  disabled={busy}
                  className="inline-flex h-10 items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-4 text-sm font-semibold text-destructive hover:bg-destructive/20 disabled:opacity-50"
                >
                  <X size={15} /> Reject Candidate
                </button>
                <button
                  onClick={() => decide('needs_review')}
                  disabled={busy}
                  className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-background px-4 text-sm font-semibold hover:bg-muted disabled:opacity-50"
                >
                  <HelpCircle size={15} /> Needs Review
                </button>
              </>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Selecting a candidate updates their status and sends the standard selection email. Inviting or
            completing an interview never does this.
          </p>
        </>
      )}

      {/* Transcript modal */}
      {showTranscript && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm"
          onClick={() => setShowTranscript(false)}
        >
          <div
            className="relative max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-border bg-card shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 flex items-center justify-between border-b border-border bg-card/90 px-6 py-4 backdrop-blur">
              <h2 className="flex items-center gap-2 text-lg font-bold">
                <FileText size={18} /> Interview Transcript
              </h2>
              <button onClick={() => setShowTranscript(false)} className="rounded-full p-2 text-muted-foreground hover:bg-muted">
                <X size={18} />
              </button>
            </div>
            <div className="space-y-4 p-6">
              {transcript === null ? (
                <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" />
              ) : transcript.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground">No transcript recorded.</p>
              ) : (
                transcript.map((t, i) => (
                  <div key={i} className={`flex ${t.role === 'candidate' ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${
                        t.role === 'candidate'
                          ? 'bg-primary text-primary-foreground rounded-tr-sm'
                          : 'border border-border bg-muted text-foreground rounded-tl-sm'
                      }`}
                    >
                      <p className="mb-0.5 text-[10px] font-bold uppercase tracking-wider opacity-70">
                        {t.role === 'candidate' ? report.candidate_name : 'AI Interviewer'}
                      </p>
                      {t.text}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
