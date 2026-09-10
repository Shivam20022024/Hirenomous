'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { fetchApi } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Loader2, LogIn } from 'lucide-react';

export default function SuperAdminCompanies() {
  const [companies, setCompanies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { setViewAsOrg } = useAuth();
  const router = useRouter();

  useEffect(() => {
    (async () => {
      try {
        setCompanies(await fetchApi('/api/superadmin/companies'));
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const viewAs = (c: any) => {
    setViewAsOrg({ id: c.id, name: c.name });
    router.push('/dashboard');
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
                  <Button size="sm" variant="outline" onClick={() => viewAs(c)}>
                    <LogIn size={13} /> View as
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
