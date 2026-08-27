'use client';

import { useState, useEffect } from 'react';
import { Search, Mail, Phone, ExternalLink, Download, Clock, Trash2, X, FileText, Play, Eye, Loader2 } from 'lucide-react';
import { fetchApi } from '@/lib/api';

export default function CandidatesPage() {
  const [candidates, setCandidates] = useState<any[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [jobId, setJobId] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedCandidate, setSelectedCandidate] = useState<any>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [candidatesData, jobsData] = await Promise.all([
        fetchApi(jobId ? `/candidates?job_id=${jobId}` : '/candidates'),
        fetchApi('/jobs')
      ]);
      setCandidates(candidatesData);
      setJobs(jobsData);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [jobId]);

  const handleExport = async () => {
    try {
      const blob = await fetchApi(`/export/candidates${jobId ? `?job_id=${jobId}` : ''}`);
      if (blob) {
        const url = window.URL.createObjectURL(blob as Blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `candidates_export.xlsx`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
      }
    } catch (err) {
      console.error('Failed to export', err);
    }
  };

  const handleSendEmail = async () => {
    const scopeLabel = jobId ? `interested candidates for ${jobs.find(j => j.id === jobId)?.title || 'the selected job'}` : 'all interested candidates across every job';
    if (!confirm(`Are you sure you want to email ${scopeLabel}?`)) return;
    setActionLoading(true);
    try {
      const res = await fetchApi(`/email/send-shortlisted${jobId ? `?job_id=${jobId}` : ''}`, { method: 'POST' });
      alert(res.message || 'Emails sent successfully.');
      loadData();
    } catch (err: any) {
      alert(`Failed to send emails: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleCallSingle = async (e: React.MouseEvent, candidateId: string) => {
    e.stopPropagation();
    setActionLoading(true);
    try {
      await fetchApi(`/bolna/call-candidate/${candidateId}`, { method: 'POST' });
      alert('Call initiated successfully.');
      loadData();
    } catch (err: any) {
      alert(`Failed to call: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async (e: React.MouseEvent, candidateId: string) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this candidate?')) return;
    try {
      await fetchApi(`/candidates/${candidateId}`, { method: 'DELETE' });
      setCandidates(prev => prev.filter(c => c.candidate_id !== candidateId));
      if (selectedCandidate?.candidate_id === candidateId) {
        setSelectedCandidate(null);
      }
    } catch (err) {
      console.error('Failed to delete candidate', err);
      alert('Failed to delete candidate');
    }
  };


  const filteredCandidates = candidates.filter(c => {
    const q = query.toLowerCase();
    const matchesSearch = c.name?.toLowerCase().includes(q) ||
                          c.email?.toLowerCase().includes(q) ||
                          c.role?.toLowerCase().includes(q);
    const matchesStatus = statusFilter ? c.status?.toUpperCase() === statusFilter : true;
    return matchesSearch && matchesStatus;
  });

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'shortlisted': 
      case 'interested':
        return 'bg-emerald-100 text-emerald-800';
      case 'rejected': 
      case 'not_interested':
        return 'bg-destructive/10 text-destructive';
      case 'pending': 
      case 'callback_required':
        return 'bg-orange-100 text-orange-800';
      default: 
        return 'bg-muted text-muted-foreground';
    }
  };

  if (loading) return <div className="p-12 text-center"><div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div></div>;

  return (
    <div className="mx-auto max-w-[1240px] space-y-6 px-5 py-9 lg:px-8 lg:py-14">
      <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-3xl font-bold tracking-[-0.06em]">Candidates</h1>
          <p className="mt-2 text-sm text-muted-foreground">View and manage all candidates across your organization.</p>
        </div>
        <div className="flex gap-2">
          <label className="flex h-11 items-center gap-2 rounded-xl border border-border bg-card px-3 text-sm text-muted-foreground">
            <Search size={16}/>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search candidates" className="bg-transparent outline-none placeholder:text-muted-foreground"/>
          </label>
          <select value={jobId} onChange={e => setJobId(e.target.value)} className="h-11 rounded-xl border border-border bg-card px-3 text-sm text-muted-foreground outline-none">
            <option value="">All Jobs</option>
            {jobs.map(j => <option key={j.id} value={j.id}>{j.title}</option>)}
          </select>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="h-11 rounded-xl border border-border bg-card px-3 text-sm text-muted-foreground outline-none">
            <option value="">All Statuses</option>
            <option value="INTERESTED">Interested</option>
            <option value="CALLBACK_REQUIRED">Callback Required</option>
            <option value="NOT_INTERESTED">Not Interested</option>
          </select>
          <button onClick={handleSendEmail} disabled={actionLoading} className="whitespace-nowrap flex h-11 items-center justify-center rounded-xl border border-border bg-card px-4 text-sm font-semibold text-foreground shadow-sm hover:bg-muted disabled:opacity-50">
            {actionLoading ? <Loader2 size={16} className="animate-spin mr-2"/> : <Mail size={16} className="mr-2" />} Email Interested
          </button>
          <button onClick={handleExport} className="whitespace-nowrap flex h-11 items-center justify-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 hover:opacity-90">
            <Download size={16} className="mr-2" /> Export
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-muted/50 text-xs font-semibold text-muted-foreground">
              <tr>
                <th className="px-6 py-4">Candidate</th>
                <th className="px-6 py-4">Role</th>
                <th className="px-6 py-4">Score</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Contact</th>
                <th className="px-6 py-4">Date</th>
                <th className="px-6 py-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredCandidates.length > 0 ? filteredCandidates.map(candidate => (
                <tr 
                  key={candidate.candidate_id} 
                  className="hover:bg-muted/30 cursor-pointer transition-colors"
                  onClick={() => setSelectedCandidate(candidate)}
                >
                  <td className="px-6 py-4">
                    <div className="font-medium text-foreground">{candidate.name || 'Unknown'}</div>
                    <div className="text-xs text-muted-foreground max-w-[200px] truncate">{candidate.summary || 'No summary'}</div>
                  </td>
                  <td className="px-6 py-4 text-muted-foreground">{candidate.role || 'Unassigned'}</td>
                  <td className="px-6 py-4">
                    <span className="font-semibold">{candidate.score || 0}%</span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wider ${getStatusColor(candidate.status)}`}>
                      {candidate.status || 'uploaded'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col gap-1 text-xs text-muted-foreground">
                      {candidate.email && <span className="flex items-center gap-1"><Mail size={12}/>{candidate.email}</span>}
                      {candidate.phone && <span className="flex items-center gap-1"><Phone size={12}/>{candidate.phone}</span>}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-xs text-muted-foreground">
                    {candidate.created_at ? new Date(candidate.created_at).toLocaleDateString() : 'N/A'}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {candidate.status?.toUpperCase() === 'CALLBACK_REQUIRED' && (
                        <button 
                          onClick={(e) => handleCallSingle(e, candidate.candidate_id)}
                          disabled={actionLoading}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-primary transition-colors hover:bg-primary/10 disabled:opacity-50"
                          title="Call Now"
                        >
                          <Phone size={16} />
                        </button>
                      )}
                      <button 
                        onClick={(e) => { e.stopPropagation(); setSelectedCandidate(candidate); }}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
                        title="View Details"
                      >
                        <Eye size={16} />
                      </button>
                      <button 
                        onClick={(e) => handleDelete(e, candidate.candidate_id)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                        title="Delete Candidate"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-muted-foreground">
                    No candidates found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedCandidate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4 sm:p-6" onClick={() => setSelectedCandidate(null)}>
          <div className="relative w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl border border-border bg-card shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-card/90 px-6 py-4 backdrop-blur">
              <h2 className="text-xl font-bold tracking-tight">Candidate Details</h2>
              <button onClick={() => setSelectedCandidate(null)} className="rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 space-y-6">
              <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                <div>
                  <h3 className="text-2xl font-bold">{selectedCandidate.name || 'Unknown'}</h3>
                  <p className="text-muted-foreground">{selectedCandidate.role || 'Unassigned Role'}</p>
                </div>
                <div className="flex gap-2">
                  <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wider ${getStatusColor(selectedCandidate.status)}`}>
                    {selectedCandidate.status || 'uploaded'}
                  </span>
                  <span className="inline-flex items-center rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                    Score: {selectedCandidate.score || 0}%
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 rounded-xl bg-muted/50 p-4 text-sm">
                {selectedCandidate.email && (
                  <div className="flex items-center gap-2"><Mail size={14} className="text-muted-foreground"/> {selectedCandidate.email}</div>
                )}
                {selectedCandidate.phone && (
                  <div className="flex items-center gap-2"><Phone size={14} className="text-muted-foreground"/> {selectedCandidate.phone}</div>
                )}
                {selectedCandidate.created_at && (
                  <div className="flex items-center gap-2"><Clock size={14} className="text-muted-foreground"/> {new Date(selectedCandidate.created_at).toLocaleString()}</div>
                )}
              </div>

              {selectedCandidate.summary && (
                <div>
                  <h4 className="mb-2 font-semibold flex items-center gap-2"><FileText size={16}/> Summary</h4>
                  <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground leading-relaxed">
                    {selectedCandidate.summary}
                  </div>
                </div>
              )}

              {selectedCandidate.transcript && (
                <div>
                  <h4 className="mb-2 font-semibold">AI Conversation Transcript</h4>
                  <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground whitespace-pre-wrap font-mono h-64 overflow-y-auto">
                    {selectedCandidate.transcript}
                  </div>
                </div>
              )}

              {selectedCandidate.recording_url && (
                <div>
                  <h4 className="mb-2 font-semibold flex items-center gap-2"><Play size={16}/> Recording</h4>
                  <audio controls src={selectedCandidate.recording_url} className="w-full mt-2" />
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
