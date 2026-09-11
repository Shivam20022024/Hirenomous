'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { fetchApi } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Loader2, LogIn, Gift } from 'lucide-react';

function billingBadge(billing: any) {
  if (!billing) return null;
  if (billing.status === 'active') return <Badge variant="success">Paid</Badge>;
  if (billing.status === 'trial') return <Badge variant="warning">Trial · {billing.days_left}d left</Badge>;
  return <Badge variant="destructive">Expired</Badge>;
}

export default function SuperAdminCompanies() {
  const [companies, setCompanies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [grantingId, setGrantingId] = useState<string | null>(null);
  const { setViewAsOrg } = useAuth();
  const router = useRouter();

  const load = async () => {
    try {
      setCompanies(await fetchApi('/api/superadmin/companies'));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const viewAs = (c: any) => {
    setViewAsOrg({ id: c.id, name: c.name });
    router.push('/dashboard');
  };

  const grantAccess = async (c: any) => {
    setGrantingId(c.id);
    try {
      await fetchApi(`/api/superadmin/companies/${c.id}/grant-access`, {
        method: 'POST',
        body: JSON.stringify({ days: 30 }),
      });
      await load();
    } catch (err: any) {
      alert(err?.message || 'Could not grant access.');
    } finally {
      setGrantingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Platform"
        title="Companies"
        description="Every company on Hireonomous. Open one to see its jobs, candidates and interviews."
      />

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : companies.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          No companies yet. Approve an access request to onboard the first one.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Company</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Billing</TableHead>
              <TableHead>Admin</TableHead>
              <TableHead className="text-right">Users</TableHead>
              <TableHead className="text-right">Jobs</TableHead>
              <TableHead className="text-right">Candidates</TableHead>
              <TableHead className="text-right">Interviews</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {companies.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-semibold">{c.name}</TableCell>
                <TableCell>
                  <Badge variant={c.status === 'active' ? 'success' : 'destructive'}>{c.status || 'active'}</Badge>
                </TableCell>
                <TableCell>{billingBadge(c.billing)}</TableCell>
                <TableCell className="text-muted-foreground">
                  {c.admin ? <span title={c.admin.email}>{c.admin.name}</span> : '—'}
                </TableCell>
                <TableCell className="text-right font-mono">{c.stats?.users ?? 0}</TableCell>
                <TableCell className="text-right font-mono">{c.stats?.jobs ?? 0}</TableCell>
                <TableCell className="text-right font-mono">{c.stats?.candidates ?? 0}</TableCell>
                <TableCell className="text-right font-mono">{c.stats?.interviews ?? 0}</TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {c.created_at ? new Date(c.created_at).toLocaleDateString() : '—'}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => grantAccess(c)}
                      disabled={grantingId === c.id}
                      title="Extend this company's access by 30 days without a payment"
                    >
                      {grantingId === c.id ? <Loader2 className="animate-spin" size={13} /> : <Gift size={13} />}
                      Grant 30d
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => viewAs(c)}>
                      <LogIn size={13} /> View as
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
