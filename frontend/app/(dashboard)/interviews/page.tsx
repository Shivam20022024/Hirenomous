'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2, Eye, FileText, Send, XCircle, Check, X } from 'lucide-react';
import { fetchApi } from '@/lib/api';

const STATUS_STYLES: Record<string, string> = {
  invited: 'bg-blue-100 text-blue-800',
  scheduled: 'bg-blue-100 text-blue-800',
  in_progress: 'bg-amber-100 text-amber-800',
  completed: 'bg-emerald-100 text-emerald-800',
  cancelled: 'bg-muted text-muted-foreground',
  expired: 'bg-orange-100 text-orange-800',
  failed: 'bg-destructive/10 text-destructive',
};

const REC_STYLES: Record<string, string> = {
  strong_match: 'bg-emerald-100 text-emerald-800',
  match: 'bg-blue-100 text-blue-800',
  weak_match: 'bg-orange-100 text-orange-800',
  no_match: 'bg-destructive/10 text-destructive',
};

const REC_LABEL: Record<string, string> = {
  strong_match: 'Strong match',
  match: 'Match',
  weak_match: 'Weak match',
  no_match: 'No match',
};

export default function InterviewsPage() {
  const [interviews, setInterviews] = useState<any[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [jobFilter, setJobFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [recFilter, setRecFilter] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (jobFilter) qs.set('job_id', jobFilter);
      if (statusFilter) qs.set('status', statusFilter);
      if (recFilter) qs.set('recommendation', recFilter);
      const [rows, jobsData] = await Promise.all([
        fetchApi(`/interviews${qs.toString() ? `?${qs}` : ''}`),
        fetchApi('/jobs'),
      ]);
      setInterviews(rows);
      setJobs(jobsData);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobFilter, statusFilter, recFilter]);

  const resend = async (id: string) => {
    setBusyId(id);
    try {
      const res = await fetchApi(`/interviews/${id}/send-invite`, { method: 'POST' });
      alert(res?.invite?.sent ? 'Invitation re-sent.' : `Invite not sent: ${res?.invite?.reason || 'unknown error'}`);
      load();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setBusyId(null);
    }
  };

  const cancel = async (id: string) => {
    if (!confirm('Cancel this interview? The candidate link will stop working.')) return;
    setBusyId(id);
    try {
      await fetchApi(`/interviews/${id}/cancel`, { method: 'POST' });
      load();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setBusyId(null);
    }
  };

  const decide = async (id: string, decision: 'select' | 'reject') => {
    const label = decision === 'select' ? 'select' : 'reject';
    if (!confirm(`Are you sure you want to ${label} this candidate?`)) return;
    setBusyId(id);
    try {
      const res = await fetchApi(`/interviews/${id}/decision`, {
        method: 'POST',
        body: JSON.stringify({ decision }),
      });
      if (decision === 'select') {
        const em = res?.selection_email;
        alert(em?.sent ? 'Candidate selected. Selection email sent.' : `Candidate selected. Selection email not sent: ${em?.errors?.[0] || 'no email configured'}`);
      }
      load();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setBusyId(null);
    }
  };

  const selectStyle = 'h-10 rounded-xl border border-border bg-card px-3 text-sm outline-none focus:border-primary';

  return (
    <div className="mx-auto max-w-[1240px] space-y-6 px-5 py-9 lg:px-8 lg:py-14">
      <div>
        <h1 className="text-3xl font-bold tracking-[-0.06em]">AI Interviews</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Invite interested candidates to an AI interview, review the AI report, and make the final decision.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <select value={jobFilter} onChange={(e) => setJobFilter(e.target.value)} className={selectStyle}>
          <option value="">All jobs</option>
          {jobs.map((j) => (
            <option key={j.id} value={j.id}>{j.title}</option>
          ))}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={selectStyle}>
          <option value="">All statuses</option>
          {['invited', 'in_progress', 'completed', 'cancelled', 'expired', 'failed'].map((s) => (
            <option key={s} value={s}>{s.replace('_', ' ')}</option>
          ))}
        </select>
        <select value={recFilter} onChange={(e) => setRecFilter(e.target.value)} className={selectStyle}>
          <option value="">All recommendations</option>
          {Object.keys(REC_LABEL).map((r) => (
            <option key={r} value={r}>{REC_LABEL[r]}</option>
          ))}
        </select>
      </div>

      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-muted/50 text-xs font-semibold text-muted-foreground">
              <tr>
                <th className="px-6 py-4">Candidate</th>
                <th className="px-6 py-4">Position</th>
                <th className="px-6 py-4">Interview Status</th>
                <th className="px-6 py-4">Date</th>
                <th className="px-6 py-4">AI Score</th>
                <th className="px-6 py-4">Recommendation</th>
                <th className="px-6 py-4">Duration</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-6 py-16 text-center">
                    <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" />
                  </td>
                </tr>
              ) : interviews.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-muted-foreground">
                    No interviews yet. Invite an interested candidate from the Candidates page.
                  </td>
                </tr>
              ) : (
                interviews.map((iv) => (
                  <tr key={iv.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-6 py-4 font-medium text-foreground">{iv.candidate_name}</td>
                    <td className="px-6 py-4 text-muted-foreground">{iv.position}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wider ${STATUS_STYLES[iv.status] || 'bg-muted text-muted-foreground'}`}>
                        {String(iv.status).replace('_', ' ')}
                      </span>
                      {iv.status === 'completed' && iv.evaluation_status !== 'evaluated' && (
                        <span className="ml-1 text-[10px] text-muted-foreground">({iv.evaluation_status})</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-xs text-muted-foreground">
                      {iv.completed_at
                        ? new Date(iv.completed_at).toLocaleDateString()
                        : iv.invited_at
                        ? new Date(iv.invited_at).toLocaleDateString()
                        : new Date(iv.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 font-semibold">
                      {iv.overall_score != null ? `${Math.round(iv.overall_score)}/100` : '—'}
                    </td>
                    <td className="px-6 py-4">
                      {iv.recommendation ? (
                        <span className={`inline-flex items-center rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wider ${REC_STYLES[iv.recommendation] || 'bg-muted'}`}>
                          {REC_LABEL[iv.recommendation] || iv.recommendation}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-xs text-muted-foreground">
                      {iv.duration_seconds ? `${Math.round(iv.duration_seconds / 60)} min` : '—'}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-1">
                        <Link
                          href={`/interviews/${iv.id}`}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-primary/10 hover:text-primary"
                          title="View report"
                        >
                          {iv.status === 'completed' ? <FileText size={15} /> : <Eye size={15} />}
                        </Link>
                        {['invited', 'scheduled', 'expired', 'in_progress'].includes(iv.status) && (
                          <button
                            onClick={() => resend(iv.id)}
                            disabled={busyId === iv.id}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-primary/10 hover:text-primary disabled:opacity-40"
                            title="Resend invitation"
                          >
                            <Send size={15} />
                          </button>
                        )}
                        {!['completed', 'cancelled', 'expired', 'failed'].includes(iv.status) && (
                          <button
                            onClick={() => cancel(iv.id)}
                            disabled={busyId === iv.id}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-40"
                            title="Cancel interview"
                          >
                            <XCircle size={15} />
                          </button>
                        )}
                        {iv.status === 'completed' && !iv.recruiter_decision && (
                          <>
                            <button
                              onClick={() => decide(iv.id, 'select')}
                              disabled={busyId === iv.id}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-emerald-600 hover:bg-emerald-50 disabled:opacity-40"
                              title="Select candidate"
                            >
                              <Check size={15} />
                            </button>
                            <button
                              onClick={() => decide(iv.id, 'reject')}
                              disabled={busyId === iv.id}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-destructive hover:bg-destructive/10 disabled:opacity-40"
                              title="Reject candidate"
                            >
                              <X size={15} />
                            </button>
                          </>
                        )}
                        {iv.recruiter_decision && (
                          <span className="ml-1 text-[10px] font-semibold uppercase text-muted-foreground">
                            {iv.recruiter_decision}
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
