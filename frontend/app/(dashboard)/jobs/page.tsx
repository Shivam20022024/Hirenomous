'use client';

import { useState, useEffect } from 'react';
import { Plus, Search, Edit2, Trash2, MapPin, Clock, Briefcase } from 'lucide-react';
import { fetchApi } from '@/lib/api';

export default function JobsPage() {
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  const [formData, setFormData] = useState({
    id: '',
    title: '',
    description: '',
    skills: '',
    experience: '',
    location: '',
    jobType: ''
  });

  const loadJobs = async () => {
    try {
      const data = await fetchApi('/jobs');
      setJobs(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadJobs();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        title: formData.title,
        description: formData.description,
        skills: formData.skills.split(',').map(s => s.trim()).filter(Boolean),
        experience: formData.experience,
        location: formData.location,
        jobType: formData.jobType
      };

      if (formData.id) {
        await fetchApi(`/job/${formData.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload)
        });
      } else {
        await fetchApi('/job', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
      }
      setIsModalOpen(false);
      loadJobs();
    } catch (err) {
      console.error(err);
      alert('Failed to save job');
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this job?')) {
      try {
        await fetchApi(`/job/${id}`, { method: 'DELETE' });
        loadJobs();
      } catch (err) {
        console.error(err);
        alert('Failed to delete job');
      }
    }
  };

  const openModal = (job?: any) => {
    if (job) {
      setFormData({
        id: job.id,
        title: job.title,
        description: job.description,
        skills: job.skills?.join(', ') || '',
        experience: job.experience || '',
        location: job.location || '',
        jobType: job.jobType || ''
      });
    } else {
      setFormData({ id: '', title: '', description: '', skills: '', experience: '', location: '', jobType: '' });
    }
    setIsModalOpen(true);
  };

  const filteredJobs = jobs.filter(j => j.title.toLowerCase().includes(query.toLowerCase()));

  if (loading) return <div className="p-12 text-center"><div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div></div>;

  return (
    <div className="mx-auto max-w-[1240px] space-y-6 px-5 py-9 lg:px-8 lg:py-14">
      <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-3xl font-bold tracking-[-0.06em]">Jobs</h1>
          <p className="mt-2 text-sm text-muted-foreground">Manage your active job postings and requirements.</p>
        </div>
        <div className="flex gap-2">
          <label className="flex h-11 items-center gap-2 rounded-xl border border-border bg-card px-3 text-sm text-muted-foreground">
            <Search size={16}/>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search jobs" className="bg-transparent outline-none placeholder:text-muted-foreground"/>
          </label>
          <button onClick={() => openModal()} className="flex h-11 items-center justify-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 hover:opacity-90">
            <Plus size={16} className="mr-2" /> Create Job
          </button>
        </div>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {filteredJobs.length > 0 ? filteredJobs.map(job => (
          <article key={job.id} className="flex flex-col justify-between rounded-2xl border border-border bg-card p-6 shadow-sm transition-shadow hover:shadow-md">
            <div>
              <div className="flex items-start justify-between">
                <h2 className="text-lg font-bold">{job.title}</h2>
                <div className="flex gap-1">
                  <button onClick={() => openModal(job)} className="p-1.5 text-muted-foreground hover:bg-muted rounded-md"><Edit2 size={14}/></button>
                  <button onClick={() => handleDelete(job.id)} className="p-1.5 text-destructive hover:bg-destructive/10 rounded-md"><Trash2 size={14}/></button>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2 text-xs text-muted-foreground">
                {job.location && <span className="flex items-center gap-1"><MapPin size={12}/>{job.location}</span>}
                {job.jobType && <span className="flex items-center gap-1"><Briefcase size={12}/>{job.jobType}</span>}
                {job.experience && <span className="flex items-center gap-1"><Clock size={12}/>{job.experience}</span>}
              </div>
              <p className="mt-4 line-clamp-3 text-sm text-muted-foreground">{job.description}</p>
              
              <div className="mt-4 flex flex-wrap gap-1">
                {job.skills?.slice(0, 4).map((skill: string) => (
                  <span key={skill} className="rounded-md bg-muted px-2 py-1 text-[10px] font-medium uppercase tracking-wider">{skill}</span>
                ))}
                {job.skills?.length > 4 && <span className="rounded-md bg-muted px-2 py-1 text-[10px] font-medium uppercase tracking-wider">+{job.skills.length - 4}</span>}
              </div>
            </div>
            <div className="mt-6 border-t border-border pt-4">
              <div className="text-xs text-muted-foreground mb-3">
                Posted on {new Date(job.createdAt).toLocaleDateString()}
              </div>
              <div className="flex gap-2">
                <button onClick={() => alert("LinkedIn integration coming soon!")} className="flex-1 rounded-md border border-border py-1.5 text-xs font-medium hover:bg-muted text-muted-foreground hover:text-foreground">
                  + LinkedIn
                </button>
                <button onClick={() => alert("Naukri integration coming soon!")} className="flex-1 rounded-md border border-border py-1.5 text-xs font-medium hover:bg-muted text-muted-foreground hover:text-foreground">
                  + Naukri
                </button>
                <button onClick={() => alert("SharePoint integration coming soon!")} className="flex-1 rounded-md border border-border py-1.5 text-xs font-medium hover:bg-muted text-muted-foreground hover:text-foreground">
                  + SharePoint
                </button>
              </div>
            </div>
          </article>
        )) : (
          <div className="col-span-full rounded-2xl border border-dashed border-border p-12 text-center text-muted-foreground">
            No jobs found. Create one to get started.
          </div>
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold mb-4">{formData.id ? 'Edit Job' : 'Create Job'}</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-sm font-medium">Title</label>
                <input required value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} className="mt-1 w-full rounded-lg border border-border bg-background p-2 text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Location</label>
                  <input value={formData.location} onChange={e => setFormData({...formData, location: e.target.value})} className="mt-1 w-full rounded-lg border border-border bg-background p-2 text-sm" />
                </div>
                <div>
                  <label className="text-sm font-medium">Job Type</label>
                  <input value={formData.jobType} onChange={e => setFormData({...formData, jobType: e.target.value})} placeholder="e.g. Full-time" className="mt-1 w-full rounded-lg border border-border bg-background p-2 text-sm" />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium">Experience</label>
                <input value={formData.experience} onChange={e => setFormData({...formData, experience: e.target.value})} placeholder="e.g. 2-4 years" className="mt-1 w-full rounded-lg border border-border bg-background p-2 text-sm" />
              </div>
              <div>
                <label className="text-sm font-medium">Skills (comma separated)</label>
                <input value={formData.skills} onChange={e => setFormData({...formData, skills: e.target.value})} className="mt-1 w-full rounded-lg border border-border bg-background p-2 text-sm" />
              </div>
              <div>
                <label className="text-sm font-medium">Description</label>
                <textarea required value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} className="mt-1 w-full h-32 rounded-lg border border-border bg-background p-2 text-sm" />
              </div>
              <div className="flex justify-end gap-2 pt-4">
                <button type="button" onClick={() => setIsModalOpen(false)} className="rounded-lg px-4 py-2 text-sm font-medium hover:bg-muted">Cancel</button>
                <button type="submit" className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">Save Job</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
