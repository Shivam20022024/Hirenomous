'use client';

import { useEffect, useState } from 'react';
import { fetchApi } from '@/lib/api';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Check, X, Building2 } from 'lucide-react';

const STATUS_VARIANT: Record<string, any> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'destructive',
};

export default function SuperAdminRequests() {
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    try {
      setRequests(await fetchApi('/api/superadmin/requests'));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const act = async (id: string, action: 'approve' | 'reject') => {
    if (action === 'reject' && !confirm('Reject this access request?')) return;
    setBusyId(id);
    try {
      const res = await fetchApi(`/api/superadmin/requests/${id}/${action}`, { method: 'POST' });
      alert(res?.message || (action === 'approve' ? 'Approved.' : 'Rejected.'));
      await load();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setBusyId(null);
    }
  };

  const pending = requests.filter((r) => r.status === 'pending');
  const processed = requests.filter((r) => r.status !== 'pending');

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Platform"
        title="Access Requests"
        description="Companies asking to join. Approving one creates their organisation and admin login."
      />

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : (
        <>
          <section className="space-y-3">
            <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
              Pending ({pending.length})
            </h2>
            {pending.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                Nothing waiting for review.
              </p>
            ) : (
              <div className="space-y-3">
                {pending.map((r) => (
                  <div key={r._id} className="rounded-xl border border-border bg-card p-5">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <p className="flex items-center gap-2 text-base font-bold text-foreground">
                          <Building2 size={16} /> {r.company}
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {r.name} · {r.email} · <span className="uppercase">{r.role?.replace('_', ' ')}</span>
                        </p>
                        {r.created_at && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            Requested {new Date(r.created_at).toLocaleString()}
                          </p>
                        )}
                        {r.has_password === false && (
                          <p className="mt-2 text-xs font-medium text-warning-text">
                            No password on file (submitted before the current form) — can&rsquo;t be approved. Reject and ask them to re-submit.
                          </p>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="success"
                          disabled={busyId === r._id || r.has_password === false}
                          onClick={() => act(r._id, 'approve')}
                        >
                          {busyId === r._id ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Approve
                        </Button>
                        <Button size="sm" variant="destructive" disabled={busyId === r._id} onClick={() => act(r._id, 'reject')}>
                          <X size={13} /> Reject
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {processed.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
                Processed ({processed.length})
              </h2>
              <div className="divide-y divide-border rounded-xl border border-border">
                {processed.map((r) => (
                  <div key={r._id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
                    <span className="font-semibold text-foreground">{r.company}</span>
                    <span className="text-muted-foreground">{r.email}</span>
                    <Badge variant={STATUS_VARIANT[r.status] || 'neutral'}>{r.status}</Badge>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
