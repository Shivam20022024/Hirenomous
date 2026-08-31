'use client';

import { useState, useEffect, useRef } from 'react';
import { Phone, Users, CheckCircle, Clock, PlayCircle, Loader2, RefreshCw, Trash2, ChevronDown } from 'lucide-react';
import { fetchApi } from '@/lib/api';

export default function CampaignsPage() {
  const [candidates, setCandidates] = useState<any[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);
  const [selectedJobs, setSelectedJobs] = useState<string[]>([]);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'pending' | 'completed'>('pending');
  const [selectedForDeletion, setSelectedForDeletion] = useState<string[]>([]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [candidatesData, jobsData] = await Promise.all([
        fetchApi('/candidates'),
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
  }, []);

  const handleCallAll = async () => {
    if (!confirm('Are you sure you want to initiate AI calls to shortlisted candidates for the selected jobs?')) return;
    
    setActionLoading(true);
    try {
      const res = await fetchApi('/bolna/call-shortlisted', { 
        method: 'POST',
        body: JSON.stringify(selectedJobs.length > 0 ? { job_ids: selectedJobs } : {}) 
      });
      
      let reportMessage = `Total calls queued: ${res.called_count}\n`;
      if (res.results && res.results.length > 0) {
        reportMessage += `\nResults by Job:\n`;
        res.results.forEach((r: any) => {
          reportMessage += `- ${r.job_title}: Queued ${r.calls_queued}/${r.shortlisted_found}`;
          if (r.failed > 0) reportMessage += ` (Failed: ${r.failed})`;
          reportMessage += '\n';
        });
      }
      alert(reportMessage);
      loadData();
    } catch (err: any) {
      alert(`Failed to call: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleCallSingle = async (candidateId: string) => {
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

  const handleSyncSingle = async (candidateId: string) => {
    setActionLoading(true);
    try {
      await fetchApi(`/bolna/sync-call/${candidateId}`);
      // No need to alert on every single one, just reload data to see if it changed
      loadData();
    } catch (err: any) {
      alert(`Failed to sync call: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const filteredCandidates = selectedJobs.length === 0 ? candidates : candidates.filter(c => selectedJobs.includes(c.job_id));
  const pendingCalls = filteredCandidates.filter(c => !['calling', 'completed', 'interested', 'not_interested', 'callback_required', 'selected', 'hired'].includes(c.status?.toLowerCase()));
  const completedCalls = filteredCandidates.filter(c => ['completed', 'interested', 'not_interested', 'callback_required', 'selected', 'hired'].includes(c.status?.toLowerCase()) || c.call_status === 'completed');
  const activeCalls = filteredCandidates.filter(c => c.status === 'calling');

  const handleSyncAllActive = async () => {
    if (activeCalls.length === 0) return;
    setActionLoading(true);
    try {
      await Promise.all(activeCalls.map(c => fetchApi(`/bolna/sync-call/${c.candidate_id}`)));
      loadData();
    } catch (err: any) {
      alert(`Failed to sync calls: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteAllCompleted = async () => {
    if (selectedForDeletion.length === 0) return;
    if (!confirm(`Are you sure you want to delete ${selectedForDeletion.length} selected candidates?`)) return;
    setActionLoading(true);
    try {
      await fetchApi(`/candidates/bulk`, { 
        method: 'DELETE',
        body: JSON.stringify({ candidate_ids: selectedForDeletion })
      });
      setSelectedForDeletion([]);
      loadData();
    } catch (err: any) {
      alert(`Failed to delete candidates: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const displayCandidates = activeTab === 'pending' ? [...activeCalls, ...pendingCalls] : completedCalls;

  return (
    <div className="mx-auto max-w-[1240px] space-y-6 px-5 py-9 lg:px-8 lg:py-14">
      <div className="flex flex-col gap-5">
        <div>
          <h1 className="text-3xl font-bold tracking-[-0.06em] mb-2">Calling Campaigns</h1>
          <p className="text-sm text-muted-foreground">Manage and track automated AI screening calls.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              className="flex items-center justify-between h-11 rounded-xl border-2 border-slate-800 bg-card px-4 text-sm font-extrabold text-foreground min-w-[200px]"
            >
              <span>{selectedJobs.length === 0 ? 'All Postings' : `${selectedJobs.length} Job${selectedJobs.length > 1 ? 's' : ''} Selected`}</span>
              <ChevronDown size={16} className="ml-2" />
            </button>
            
            {isDropdownOpen && (
              <div className="absolute top-12 left-0 z-50 w-64 rounded-xl border-2 border-slate-800 bg-card p-2 shadow-xl max-h-[300px] overflow-y-auto">
                <div className="flex gap-2 mb-2 pb-2 border-b border-border px-2">
                  <button onClick={() => setSelectedJobs(jobs.map(j => j.id))} className="text-xs font-semibold text-primary hover:underline">Select All</button>
                  <button onClick={() => setSelectedJobs([])} className="text-xs font-semibold text-muted-foreground hover:underline">Clear All</button>
                </div>
                {jobs.map(job => (
                  <label key={job.id} className="flex items-center gap-2 p-2 hover:bg-muted rounded-md cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={selectedJobs.includes(job.id)}
                      onChange={() => {
                        setSelectedJobs(prev => prev.includes(job.id) ? prev.filter(id => id !== job.id) : [...prev, job.id]);
                      }}
                      className="rounded border-gray-300"
                    />
                    <span className="text-sm font-bold line-clamp-1 text-foreground">{job.title}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
          <button 
            onClick={handleSyncAllActive} 
            disabled={actionLoading || activeCalls.length === 0} 
            className="flex h-11 items-center justify-center rounded-xl border-2 border-slate-800 bg-card px-4 text-sm font-extrabold text-foreground shadow-sm hover:bg-muted disabled:opacity-75 disabled:cursor-not-allowed whitespace-nowrap"
          >
            {actionLoading ? <Loader2 size={16} className="animate-spin mr-2"/> : <RefreshCw size={16} className="mr-2" />} 
            Sync Active ({activeCalls.length})
          </button>
          <button 
            onClick={handleDeleteAllCompleted} 
            disabled={actionLoading || selectedForDeletion.length === 0} 
            className="flex h-11 items-center justify-center rounded-xl border-2 border-red-600 bg-red-50 text-red-700 px-4 text-sm font-extrabold shadow-sm hover:bg-red-100 disabled:opacity-75 disabled:cursor-not-allowed whitespace-nowrap"
          >
            {actionLoading ? <Loader2 size={16} className="animate-spin mr-2"/> : <Trash2 size={16} className="mr-2" />} 
            Delete Selected ({selectedForDeletion.length})
          </button>
          <button 
            onClick={handleCallAll} 
            disabled={actionLoading || pendingCalls.filter(c => c.status === 'shortlisted' || (c.score && c.score >= 70)).length === 0} 
            className="flex h-11 items-center justify-center rounded-xl border-2 border-primary bg-primary px-4 text-sm font-extrabold text-primary-foreground shadow-lg hover:opacity-90 disabled:opacity-75 disabled:cursor-not-allowed whitespace-nowrap"
          >
            {actionLoading ? <Loader2 size={16} className="animate-spin mr-2"/> : <PlayCircle size={16} className="mr-2" />} 
            Call All Shortlisted ({pendingCalls.filter(c => c.status === 'shortlisted' || (c.score && c.score >= 70)).length})
          </button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <article className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-start justify-between">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Uncalled Candidates</p>
            <span className="rounded-xl bg-muted p-2 text-muted-foreground"><Users size={16}/></span>
          </div>
          <div className="mt-4">
            <h2 className="text-3xl font-bold tracking-tight">{pendingCalls.length}</h2>
          </div>
        </article>
        <article className="rounded-2xl border border-border bg-card p-5 shadow-sm border-blue-200">
          <div className="flex items-start justify-between">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-blue-600">Active Calls</p>
            <span className="rounded-xl bg-blue-100 p-2 text-blue-600"><Phone size={16}/></span>
          </div>
          <p className="mt-6 text-3xl font-bold tracking-[-0.06em] text-blue-600">{activeCalls.length}</p>
        </article>
        <article className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-start justify-between">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Completed Calls</p>
            <span className="rounded-xl bg-emerald-100 p-2 text-emerald-600"><CheckCircle size={16}/></span>
          </div>
          <p className="mt-6 text-3xl font-bold tracking-[-0.06em] text-foreground">{completedCalls.length}</p>
        </article>
      </div>

      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="flex border-b border-border bg-muted/20">
          <button 
            onClick={() => setActiveTab('pending')}
            className={`flex-1 py-4 text-sm font-semibold transition-colors ${activeTab === 'pending' ? 'bg-card text-foreground border-b-2 border-primary' : 'text-muted-foreground hover:bg-muted/50'}`}
          >
            Uncalled & Active ({pendingCalls.length + activeCalls.length})
          </button>
          <button 
            onClick={() => setActiveTab('completed')}
            className={`flex-1 py-4 text-sm font-semibold transition-colors ${activeTab === 'completed' ? 'bg-muted text-foreground border-b-2 border-primary' : 'text-muted-foreground hover:bg-muted/50'}`}
          >
            Completed ({completedCalls.length})
          </button>
        </div>

        {loading ? (
          <div className="p-12 text-center"><div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-muted/50 text-xs font-semibold text-muted-foreground">
                <tr>
                  <th className="px-6 py-4 w-12">
                    <input 
                      type="checkbox" 
                      className="rounded border-border accent-primary w-4 h-4"
                      checked={displayCandidates.length > 0 && selectedForDeletion.length === displayCandidates.length}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedForDeletion(displayCandidates.map(c => c.candidate_id));
                        } else {
                          setSelectedForDeletion([]);
                        }
                      }}
                    />
                  </th>
                  <th className="px-6 py-4">Candidate</th>
                  <th className="px-6 py-4">Role</th>
                  <th className="px-6 py-4">Phone</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {displayCandidates.length > 0 ? displayCandidates.map(candidate => (
                  <tr key={candidate.candidate_id} className={`hover:bg-muted/30 ${selectedForDeletion.includes(candidate.candidate_id) ? 'bg-muted/20' : ''}`}>
                    <td className="px-6 py-4">
                      <input 
                        type="checkbox" 
                        className="rounded border-border accent-primary w-4 h-4"
                        checked={selectedForDeletion.includes(candidate.candidate_id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedForDeletion(prev => [...prev, candidate.candidate_id]);
                          } else {
                            setSelectedForDeletion(prev => prev.filter(id => id !== candidate.candidate_id));
                          }
                        }}
                      />
                    </td>
                    <td className="px-6 py-4 font-medium">{candidate.name}</td>
                    <td className="px-6 py-4 text-muted-foreground">{candidate.role || 'N/A'}</td>
                    <td className="px-6 py-4 text-muted-foreground">{candidate.phone}</td>
                    <td className="px-6 py-4">
                      {candidate.status === 'calling' ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-100 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-blue-800">
                          <span className="h-1.5 w-1.5 rounded-full bg-blue-600 animate-pulse"></span> Calling
                        </span>
                      ) : candidate.call_status === 'completed' ? (
                        <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-800">Completed</span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-orange-100 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-orange-800">Pending</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {activeTab === 'pending' && candidate.status === 'calling' && (
                        <button onClick={() => handleSyncSingle(candidate.candidate_id)} disabled={actionLoading} className="text-blue-600 flex items-center gap-1 hover:underline font-semibold disabled:opacity-50">
                          <RefreshCw size={12} /> Sync Status
                        </button>
                      )}
                      {activeTab === 'pending' && candidate.status !== 'calling' && (
                        <button onClick={() => handleCallSingle(candidate.candidate_id)} disabled={actionLoading} className="text-primary hover:underline font-semibold disabled:opacity-50">
                          Call Now
                        </button>
                      )}
                      {activeTab === 'completed' && (
                        <div className="flex flex-col text-xs gap-1">
                          {candidate.interest && <span><span className="font-semibold text-muted-foreground">Interest:</span> {candidate.interest}</span>}
                          {candidate.communication_score && <span><span className="font-semibold text-muted-foreground">Comm:</span> {candidate.communication_score}/100</span>}
                          {candidate.recording_url && <a href={candidate.recording_url} target="_blank" rel="noreferrer" className="text-primary hover:underline mt-1">Listen Recording</a>}
                        </div>
                      )}
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-muted-foreground">
                      No candidates found in this category.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
