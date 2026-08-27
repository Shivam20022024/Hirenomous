'use client';

import { useEffect, useState, useMemo } from 'react';
import {
  ArrowDownToLine,
  Check,
  CircleAlert,
  Heart,
  PhoneCall,
  Search,
  Sparkles,
  Star,
  UsersRound,
  CalendarDays,
  ChevronDown
} from 'lucide-react';
import { fetchApi } from '@/lib/api';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';

const METRIC_ICONS: Record<string, any> = {
  total_candidates: UsersRound,
  screened: Sparkles,
  calls_completed: PhoneCall,
  interested: Heart,
  interviews: CalendarDays,
  selected: Check,
  hired: Star,
  callback_required: CircleAlert
};

const METRIC_COLORS: Record<string, string> = {
  total_candidates: 'text-foreground',
  screened: 'text-foreground',
  calls_completed: 'text-foreground',
  interested: 'text-primary',
  interviews: 'text-foreground',
  selected: 'text-foreground',
  hired: 'text-emerald-600',
  callback_required: 'text-orange-500'
};

const METRIC_LABELS: Record<string, string> = {
  total_candidates: 'Total candidates',
  screened: 'AI screened',
  calls_completed: 'Calls completed',
  interested: 'Interested',
  interviews: 'Interviews',
  selected: 'Selected',
  hired: 'Hired',
  callback_required: 'Callbacks needed'
};

export default function DashboardPage() {
  const [dateRange, setDateRange] = useState('this_month');
  const [jobId, setJobId] = useState('');
  const [jobs, setJobs] = useState<any[]>([]);
  
  const [dashboardData, setDashboardData] = useState<any>(null);
  const [funnelData, setFunnelData] = useState<any>(null);
  const [rolesData, setRolesData] = useState<any[]>([]);
  const [trendData, setTrendData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  
  const filteredRoles = useMemo(() => 
    rolesData.filter((role) => role.role.toLowerCase().includes(query.toLowerCase())), 
  [rolesData, query]);

  useEffect(() => {
    async function loadInitialData() {
      try {
        const jobsList = await fetchApi('/jobs');
        setJobs(jobsList);
      } catch (err) {
        console.error('Failed to load jobs', err);
      }
    }
    loadInitialData();
  }, []);

  const loadDashboardData = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('date_range', dateRange);
      if (jobId) params.append('job_id', jobId);

      const [dashRes, funnelRes, rolesRes, trendCandidates, trendInterviews, trendSelected] = await Promise.all([
        fetchApi(`/analytics/dashboard?${params}`),
        fetchApi(`/analytics/funnel?${params}`),
        fetchApi(`/analytics/roles?${params}`),
        fetchApi(`/analytics/trend?${params}&metric=candidates`),
        fetchApi(`/analytics/trend?${params}&metric=interviews`),
        fetchApi(`/analytics/trend?${params}&metric=selected`)
      ]);

      // Merge trend data
      const mergedTrend = (trendCandidates || []).map((cDay: any) => {
        const iDay = (trendInterviews || []).find((d: any) => d.date === cDay.date) || { count: 0 };
        const sDay = (trendSelected || []).find((d: any) => d.date === cDay.date) || { count: 0 };
        return {
          date: cDay.date,
          Invited: cDay.count,
          Interviewed: iDay.count,
          Shortlisted: sDay.count
        };
      });

      setDashboardData(dashRes);
      setFunnelData(funnelRes);
      setRolesData(rolesRes);
      setTrendData(mergedTrend);
    } catch (err) {
      console.error('Failed to load analytics', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboardData();
  }, [dateRange, jobId]);

  const handleExport = async (format: 'csv' | 'excel') => {
    try {
      const params = new URLSearchParams();
      params.append('report_type', 'daily');
      params.append('format', format);
      params.append('date_range', dateRange);
      if (jobId) params.append('job_id', jobId);
      
      const blob = await fetchApi(`/analytics/export?${params}`);
      if (blob) {
        const url = window.URL.createObjectURL(blob as Blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `analytics_export.${format === 'excel' ? 'xlsx' : 'csv'}`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
      }
    } catch (err) {
      console.error('Export failed', err);
    }
  };

  if (loading && !dashboardData) {
    return <div className="flex h-full items-center justify-center p-12"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div></div>;
  }

  const stages = [
    [funnelData?.candidates || '0', 'Applied'],
    [funnelData?.screened || '0', 'AI screened'],
    [funnelData?.interested || '0', 'Interested'],
    [funnelData?.interview || '0', 'Interviews'],
    [funnelData?.selected || '0', 'Selected'],
    [funnelData?.hired || '0', 'Hired']
  ];

  return (
    <div className="mx-auto max-w-[1240px] space-y-6 px-5 py-9 lg:px-8 lg:py-14">
      <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <p className="eyebrow">Overview · Performance workspace</p>
          <h1 className="mt-3 text-3xl font-bold tracking-[-0.06em]">Hiring analytics</h1>
          <p className="mt-2 text-sm text-muted-foreground">Track recruitment performance, conversion, and hiring outcomes across roles.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => handleExport('csv')} className="rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm font-semibold text-muted-foreground hover:bg-muted">
            <ArrowDownToLine className="mr-2 inline" size={15}/>Export CSV
          </button>
          <button onClick={() => handleExport('excel')} className="rounded-xl bg-primary px-3.5 py-2.5 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 hover:opacity-90">
            <ArrowDownToLine className="mr-2 inline" size={15}/>Export Excel
          </button>
        </div>
      </div>

      <section className="grid gap-3 rounded-2xl border border-border bg-card p-4 md:grid-cols-[1fr_1fr_auto_auto] md:items-end">
        <label className="eyebrow">Date range
          <select value={dateRange} onChange={e => setDateRange(e.target.value)} className="mt-2 block h-11 w-full rounded-xl border border-border bg-muted px-3 text-sm font-medium">
            <option value="this_month">This Month</option>
            <option value="last_month">Last Month</option>
            <option value="this_quarter">This Quarter</option>
            <option value="this_year">This Year</option>
          </select>
        </label>
        <label className="eyebrow">Job role
          <select value={jobId} onChange={e => setJobId(e.target.value)} className="mt-2 block h-11 w-full rounded-xl border border-border bg-muted px-3 text-sm font-medium">
            <option value="">All jobs</option>
            {jobs.map(j => <option key={j.id} value={j.id}>{j.title}</option>)}
          </select>
        </label>
        <button onClick={loadDashboardData} className="h-11 rounded-xl bg-foreground px-5 text-sm font-semibold text-background hover:opacity-90">
          Apply filters
        </button>
        <button onClick={() => { setDateRange('this_month'); setJobId(''); }} className="h-11 rounded-xl border border-border px-5 text-sm font-semibold text-muted-foreground hover:bg-muted">
          Reset
        </button>
      </section>

      {dashboardData && (
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Object.entries(dashboardData.current).map(([key, value]) => {
            const Icon = METRIC_ICONS[key];
            if (!Icon) return null;
            const change = dashboardData.trends[key] || 0;
            const color = METRIC_COLORS[key];
            const changeText = change > 0 ? `+${change}% vs previous` : change < 0 ? `${change}% vs previous` : '— 0% vs previous';
            
            return (
              <article key={key} className="rounded-2xl border border-border bg-card p-5 shadow-[0_2px_8px_rgba(20,35,60,0.03)] transition-shadow hover:shadow-md">
                <div className="flex items-start justify-between">
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-foreground opacity-80">{METRIC_LABELS[key]}</p>
                  <span className="rounded-xl bg-muted p-2 text-muted-foreground"><Icon size={16}/></span>
                </div>
                <p className={`mt-6 text-3xl font-bold tracking-[-0.06em] ${color}`}>{String(value)}</p>
                <p className={`mt-1 text-xs ${change > 0 ? 'text-emerald-600' : 'text-muted-foreground'}`}>{changeText}</p>
              </article>
            );
          })}
        </section>
      )}

      {funnelData && (
        <section className="rounded-2xl border border-border bg-card p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="eyebrow">Pipeline overview</p>
              <h2 className="mt-2 text-lg font-bold">Hiring funnel</h2>
            </div>
          </div>
          <div className="mt-8 flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-0">
            {stages.map(([value, label], index) => (
              <div key={label} className="flex flex-1 items-center lg:block">
                <div className="flex items-center lg:block">
                  <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border-2 text-lg font-bold ${index < 2 ? 'border-blue-300 bg-blue-50 text-primary' : index < 5 ? 'border-indigo-200 bg-indigo-50 text-indigo-600' : 'border-emerald-200 bg-emerald-50 text-emerald-600'}`}>
                    {value}
                  </div>
                  {index < stages.length - 1 && <div className="hidden h-px w-full bg-border lg:block"/>}
                </div>
                <p className="ml-4 text-xs font-semibold text-muted-foreground lg:ml-0 lg:mt-3">{label}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="grid gap-6 xl:grid-cols-[1.1fr_.9fr]">
        <section className="rounded-2xl border border-border bg-card p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="eyebrow">Activity trend</p>
              <h2 className="mt-2 text-lg font-bold">Hiring Overview</h2>
            </div>
          </div>
          <div className="mt-8 h-[350px] w-full">
            {trendData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trendData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorInvited" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#818cf8" stopOpacity={0.8}/>
                      <stop offset="95%" stopColor="#818cf8" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorInterviewed" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#fb923c" stopOpacity={0.8}/>
                      <stop offset="95%" stopColor="#fb923c" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorShortlisted" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#34d399" stopOpacity={0.8}/>
                      <stop offset="95%" stopColor="#34d399" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} dx={-10} />
                  <RechartsTooltip 
                    contentStyle={{ borderRadius: '8px', border: '1px solid hsl(var(--border))', backgroundColor: 'hsl(var(--card))', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  />
                  <Area type="monotone" dataKey="Invited" stroke="#818cf8" strokeWidth={2} fillOpacity={1} fill="url(#colorInvited)" />
                  <Area type="monotone" dataKey="Interviewed" stroke="#fb923c" strokeWidth={2} fillOpacity={1} fill="url(#colorInterviewed)" />
                  <Area type="monotone" dataKey="Shortlisted" stroke="#34d399" strokeWidth={2} fillOpacity={1} fill="url(#colorShortlisted)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="w-full h-full flex items-center justify-center text-sm text-muted-foreground">No trend data available for selected period</div>
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-card p-6 h-full flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="eyebrow">Distribution</p>
              <h2 className="mt-2 text-lg font-bold">Performance by role</h2>
            </div>
          </div>
          <div className="space-y-3 flex-1 overflow-y-auto max-h-[250px]">
            {rolesData.length > 0 ? rolesData.map((role: any) => (
              <div key={role.job_id || 'unassigned'} className="rounded-xl bg-muted/70 p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold truncate max-w-[200px]">{role.role}</p>
                  <span className="rounded-md border border-border bg-card px-2 py-1 text-[11px] text-muted-foreground whitespace-nowrap">{role.candidates} candidates</span>
                </div>
                <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="h-2 w-2 rounded-full bg-primary" />
                  {role.screened} screened <span className="ml-2 text-orange-500">{role.callbacks} callbacks</span>
                </div>
              </div>
            )) : (
              <div className="h-full flex items-center justify-center text-sm text-muted-foreground">No roles data available</div>
            )}
          </div>
        </section>
      </div>

      <section className="rounded-2xl border border-border bg-card p-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <p className="eyebrow">Role-wise detail</p>
            <h2 className="mt-2 text-lg font-bold">Recruitment performance</h2>
          </div>
          <label className="flex h-10 items-center gap-2 rounded-lg border border-border bg-muted px-3 text-sm text-muted-foreground">
            <Search size={16}/>
            <span className="sr-only">Search roles</span>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search roles" className="w-28 bg-transparent outline-none placeholder:text-muted-foreground"/>
          </label>
        </div>
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-border text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              <tr>
                <th className="pb-3">Role</th>
                <th className="pb-3">Candidates</th>
                <th className="pb-3">Screened</th>
                <th className="pb-3">Calls</th>
                <th className="pb-3">Callbacks</th>
              </tr>
            </thead>
            <tbody>
              {filteredRoles.length > 0 ? filteredRoles.map((role: any) => {
                return (
                  <tr key={role.job_id || 'unassigned'} className="border-b border-border/70 last:border-0 hover:bg-muted/30">
                    <td className="py-4 font-semibold text-primary">{role.role}</td>
                    <td className="py-4">{role.candidates}</td>
                    <td className="py-4">{role.screened}</td>
                    <td className="py-4">{role.calls_completed}</td>
                    <td className="py-4 text-orange-500">{role.callbacks}</td>
                  </tr>
                );
              }) : (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-muted-foreground text-sm">No roles found</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
