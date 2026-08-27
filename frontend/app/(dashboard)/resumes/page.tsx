'use client';

import { useState, useRef, useEffect } from 'react';
import { Upload, Plus, FileText, X, Check, Loader2 } from 'lucide-react';
import { fetchApi, API_BASE_URL } from '@/lib/api';

export default function ResumesPage() {
  const [jobs, setJobs] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'upload' | 'manual'>('upload');
  
  // Upload State
  const [files, setFiles] = useState<File[]>([]);
  const [jobDescription, setJobDescription] = useState('We are looking for a software engineer with Python and AI experience.');
  const [skipAi, setSkipAi] = useState(false);
  const [jobId, setJobId] = useState('');
  
  // Manual State
  const [manualData, setManualData] = useState({
    name: '',
    email: '',
    phone: '',
    skills: '',
    role: 'Manual Entry',
    job_id: ''
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchApi('/jobs').then(setJobs).catch(console.error);
  }, []);

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (files.length === 0) {
      setError('Please select at least one resume file to upload.');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');
    
    let successCount = 0;
    let failCount = 0;
    const CONCURRENCY = 200; // Allow uploading up to 200 files simultaneously

    for (let i = 0; i < files.length; i += CONCURRENCY) {
      const chunk = files.slice(i, i + CONCURRENCY);
      
      await Promise.all(chunk.map(async (file) => {
        try {
          const formData = new FormData();
          formData.append('file', file);
          formData.append('job_description', jobDescription);
          formData.append('skip_ai', String(skipAi));
          if (jobId) formData.append('job_id', jobId);

          const token = localStorage.getItem('token');
          const res = await fetch(`${API_BASE_URL}/upload-resume`, {
            method: 'POST',
            headers: {
              ...(token ? { 'Authorization': `Bearer ${token}` } : {})
            },
            body: formData
          });

          if (!res.ok) {
            failCount++;
            return;
          }
          successCount++;
        } catch (err: any) {
          failCount++;
        }
      }));
    }

    setLoading(false);
    if (failCount === 0) {
      setSuccess(`Successfully parsed ${successCount} resumes.`);
    } else {
      setSuccess(`Parsed ${successCount} resumes successfully. ${failCount} failed.`);
    }
    setFiles([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      await fetchApi('/add-manual', {
        method: 'POST',
        body: JSON.stringify({
          ...manualData,
          skills: manualData.skills.split(',').map(s => s.trim()).filter(Boolean),
          job_id: manualData.job_id || null
        })
      });

      setSuccess(`Successfully added ${manualData.name}`);
      setManualData({ name: '', email: '', phone: '', skills: '', role: 'Manual Entry', job_id: '' });
    } catch (err: any) {
      setError(err.message || 'An error occurred while adding candidate.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-5 py-9 lg:px-8 lg:py-14">
      <div>
        <h1 className="text-3xl font-bold tracking-[-0.06em]">Resume Database</h1>
        <p className="mt-2 text-sm text-muted-foreground">Upload and parse resumes or manually add candidates.</p>
      </div>

      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="flex border-b border-border">
          <button 
            onClick={() => { setActiveTab('upload'); setError(''); setSuccess(''); }}
            className={`flex-1 py-4 text-sm font-semibold transition-colors ${activeTab === 'upload' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted/50'}`}
          >
            Upload Resume
          </button>
          <button 
            onClick={() => { setActiveTab('manual'); setError(''); setSuccess(''); }}
            className={`flex-1 py-4 text-sm font-semibold transition-colors ${activeTab === 'manual' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted/50'}`}
          >
            Manual Entry
          </button>
        </div>

        <div className="p-6">
          {error && <div className="mb-6 rounded-lg bg-destructive/15 p-4 text-sm text-destructive flex items-start gap-3"><X size={16} className="mt-0.5 shrink-0"/>{error}</div>}
          {success && <div className="mb-6 rounded-lg bg-emerald-100 p-4 text-sm text-emerald-800 flex items-start gap-3"><Check size={16} className="mt-0.5 shrink-0"/>{success}</div>}

          {activeTab === 'upload' ? (
            <form onSubmit={handleUploadSubmit} className="space-y-6">
              <div>
                <label className="block text-sm font-medium mb-2">Select Job (Optional)</label>
                <select value={jobId} onChange={e => setJobId(e.target.value)} className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm focus:border-primary focus:outline-none">
                  <option value="">No specific job</option>
                  {jobs.map(j => <option key={j.id} value={j.id}>{j.title}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Job Description (For AI Matching)</label>
                <textarea 
                  value={jobDescription} 
                  onChange={e => setJobDescription(e.target.value)} 
                  disabled={skipAi}
                  className="w-full h-32 rounded-xl border border-border bg-background px-4 py-3 text-sm focus:border-primary focus:outline-none disabled:opacity-50" 
                />
              </div>

              <div className="flex items-center gap-3">
                <input 
                  type="checkbox" 
                  id="skipAi" 
                  checked={skipAi} 
                  onChange={e => setSkipAi(e.target.checked)}
                  className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                />
                <label htmlFor="skipAi" className="text-sm font-medium text-foreground">Skip AI Analysis (Faster, no scoring)</label>
              </div>

              <div className="mt-4">
                <label className="block text-sm font-medium mb-2">Resume File (PDF/DOCX)</label>
                <div className="flex justify-center rounded-xl border-2 border-dashed border-border px-6 py-10 hover:bg-muted/50 transition-colors">
                  <div className="text-center">
                    <FileText className="mx-auto h-12 w-12 text-muted-foreground opacity-50" aria-hidden="true" />
                    <div className="mt-4 flex text-sm leading-6 text-muted-foreground justify-center">
                      <label className="relative cursor-pointer rounded-md bg-transparent font-semibold text-primary focus-within:outline-none hover:text-primary/80">
                        <span>Upload files</span>
                        <input ref={fileInputRef} type="file" multiple className="sr-only" onChange={e => setFiles(Array.from(e.target.files || []))} accept=".pdf,.docx,.doc" />
                      </label>
                      <p className="pl-1">or drag and drop</p>
                    </div>
                    <p className="text-xs leading-5 text-muted-foreground">PDF or DOCX up to 10MB each</p>
                    {files.length > 0 && <p className="mt-2 text-sm font-semibold text-foreground bg-muted inline-block px-3 py-1 rounded-full">{files.length} file(s) selected</p>}
                  </div>
                </div>
              </div>

              <button 
                type="submit" 
                disabled={loading || files.length === 0}
                className="w-full flex justify-center items-center rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-sm hover:opacity-90 disabled:opacity-50"
              >
                {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Processing...</> : <><Upload className="mr-2 h-4 w-4" /> Upload & Parse</>}
              </button>
            </form>
          ) : (
            <form onSubmit={handleManualSubmit} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="text-sm font-medium">Full Name</label>
                  <input required value={manualData.name} onChange={e => setManualData({...manualData, name: e.target.value})} className="mt-1 w-full rounded-xl border border-border bg-background px-4 py-3 text-sm" />
                </div>
                <div>
                  <label className="text-sm font-medium">Email</label>
                  <input required type="email" value={manualData.email} onChange={e => setManualData({...manualData, email: e.target.value})} className="mt-1 w-full rounded-xl border border-border bg-background px-4 py-3 text-sm" />
                </div>
                <div>
                  <label className="text-sm font-medium">Phone</label>
                  <input required value={manualData.phone} onChange={e => setManualData({...manualData, phone: e.target.value})} className="mt-1 w-full rounded-xl border border-border bg-background px-4 py-3 text-sm" />
                </div>
                <div>
                  <label className="text-sm font-medium">Job</label>
                  <select value={manualData.job_id} onChange={e => setManualData({...manualData, job_id: e.target.value})} className="mt-1 w-full rounded-xl border border-border bg-background px-4 py-3 text-sm">
                    <option value="">No specific job</option>
                    {jobs.map(j => <option key={j.id} value={j.id}>{j.title}</option>)}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="text-sm font-medium">Skills (comma separated)</label>
                  <input value={manualData.skills} onChange={e => setManualData({...manualData, skills: e.target.value})} className="mt-1 w-full rounded-xl border border-border bg-background px-4 py-3 text-sm" placeholder="Python, React, FastApi" />
                </div>
              </div>
              <button 
                type="submit" 
                disabled={loading}
                className="w-full mt-4 flex justify-center items-center rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-sm hover:opacity-90 disabled:opacity-50"
              >
                {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</> : <><Plus className="mr-2 h-4 w-4" /> Add Candidate</>}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
