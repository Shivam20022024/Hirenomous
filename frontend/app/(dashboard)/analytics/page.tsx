'use client';

import { useState, useEffect } from 'react';
import { Download, TrendingUp, Users, PhoneCall, Heart, CheckCircle } from 'lucide-react';
import { fetchApi } from '@/lib/api';

export default function AnalyticsPage() {
  const [reportData, setReportData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('daily');
  const [dateRange, setDateRange] = useState('this_month');

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await fetchApi(`/analytics/report?period=${period}&date_range=${dateRange}`);
      setReportData(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [period, dateRange]);

  const handleExport = async (format: 'csv' | 'excel') => {
    try {
      const blob = await fetchApi(`/analytics/export?report_type=${period}&format=${format}&date_range=${dateRange}`);
      if (blob) {
        const url = window.URL.createObjectURL(blob as Blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `analytics_report_${period}.${format === 'excel' ? 'xlsx' : 'csv'}`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
      }
    } catch (err) {
      console.error('Export failed', err);
    }
  };

  if (loading && reportData.length === 0) {
    return <div className="p-12 text-center"><div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div></div>;
  }

  return (
    <div className="mx-auto max-w-[1240px] space-y-6 px-5 py-9 lg:px-8 lg:py-14">
      <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-3xl font-bold tracking-[-0.06em]">Deep Analytics</h1>
          <p className="mt-2 text-sm text-muted-foreground">Detailed breakdown of hiring performance over time.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => handleExport('csv')} className="rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm font-semibold text-muted-foreground hover:bg-muted">
            Export CSV
          </button>
          <button onClick={() => handleExport('excel')} className="rounded-xl bg-primary px-3.5 py-2.5 text-sm font-semibold text-primary-foreground shadow-lg hover:opacity-90">
            Export Excel
          </button>
        </div>
      </div>

      <div className="flex items-center gap-4 border-b border-border pb-4">
        <label className="text-sm font-medium">Resolution:</label>
        <div className="flex bg-muted rounded-lg p-1">
          {['daily', 'weekly', 'monthly'].map(p => (
            <button 
              key={p} 
              onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md capitalize ${period === p ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'}`}
            >
              {p}
            </button>
          ))}
        </div>
        
        <label className="text-sm font-medium ml-4">Timeframe:</label>
        <select value={dateRange} onChange={e => setDateRange(e.target.value)} className="h-9 rounded-lg border border-border bg-card px-3 text-sm">
          <option value="last_7_days">Last 7 Days</option>
          <option value="this_month">This Month</option>
          <option value="last_month">Last Month</option>
          <option value="this_quarter">This Quarter</option>
          <option value="this_year">This Year</option>
        </select>
      </div>

      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-muted/50 text-xs font-semibold text-muted-foreground">
              <tr>
                <th className="px-6 py-4">Period</th>
                <th className="px-6 py-4"><div className="flex items-center gap-1"><Users size={14}/> Candidates</div></th>
                <th className="px-6 py-4"><div className="flex items-center gap-1"><TrendingUp size={14}/> Screened</div></th>
                <th className="px-6 py-4"><div className="flex items-center gap-1"><PhoneCall size={14}/> Calls</div></th>
                <th className="px-6 py-4"><div className="flex items-center gap-1"><Heart size={14}/> Interested</div></th>
                <th className="px-6 py-4"><div className="flex items-center gap-1"><CheckCircle size={14}/> Hired</div></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {reportData.length > 0 ? reportData.map((row, i) => (
                <tr key={i} className="hover:bg-muted/30">
                  <td className="px-6 py-4 font-medium">{row.date}</td>
                  <td className="px-6 py-4">{row.candidates}</td>
                  <td className="px-6 py-4">{row.screened}</td>
                  <td className="px-6 py-4">{row.calls}</td>
                  <td className="px-6 py-4 text-primary font-medium">{row.interested}</td>
                  <td className="px-6 py-4 text-emerald-600 font-medium">{row.hired}</td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-muted-foreground">
                    No data available for the selected period.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
