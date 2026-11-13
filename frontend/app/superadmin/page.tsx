'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { fetchApi } from '@/lib/api';
import { PageHeader } from '@/components/page-header';
import { Loader2, Inbox, ArrowRight } from 'lucide-react';

export default function SuperAdminOverview() {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        setStats(await fetchApi('/api/superadmin/stats'));
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  const s = stats || {};
  const tiles: [string, number | string][] = [
    ['Companies', s.total_companies ?? 0],
    ['Active', s.active_companies ?? 0],
    ['Suspended', s.suspended_companies ?? 0],
    ['Users', s.total_users ?? 0],
    ['Jobs', s.total_jobs ?? 0],
    ['Candidates', s.total_candidates ?? 0],
    ['AI Interviews', s.total_interviews ?? 0],
    ['Call minutes', s.total_call_minutes ?? 0],
  ];

  return (
    <div className="space-y-8">
      <PageHeader eyebrow="Platform" title="Overview" description="Everything across every company on Hireonomous." />

      {s.pending_requests > 0 && (
        <Link
          href="/superadmin/requests"
          className="flex items-center justify-between rounded-xl border border-warning/40 bg-warning/10 p-4 transition-colors hover:bg-warning/15"
        >
          <span className="flex items-center gap-3 text-sm font-semibold text-warning-text">
            <Inbox size={18} />
            {s.pending_requests} access request{s.pending_requests > 1 ? 's' : ''} waiting for review
          </span>
          <ArrowRight size={16} className="text-warning-text" />
        </Link>
      )}

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {tiles.map(([label, value]) => (
          <div key={label} className="rounded-xl border border-border bg-card p-5">
            <p className="font-mono text-3xl font-bold tracking-tight text-foreground">{value}</p>
            <p className="mt-1 text-xs font-medium text-muted-foreground">{label}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-3">
        <Link href="/superadmin/companies" className="rounded-lg border border-border bg-card px-4 py-2 text-sm font-semibold hover:bg-muted">
          View all companies
        </Link>
        <Link href="/superadmin/requests" className="rounded-lg border border-border bg-card px-4 py-2 text-sm font-semibold hover:bg-muted">
          Access requests
        </Link>
      </div>
    </div>
  );
}
