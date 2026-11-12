'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { fetchApi } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Loader2, LogIn, Gift, Wallet, ArrowRight, X, PhoneCall } from 'lucide-react';

function billingBadge(billing: any) {
  if (!billing) return null;
  if (billing.status === 'legacy') return <Badge variant="neutral">No trial (pre-billing)</Badge>;
  if (billing.status === 'active') return <Badge variant="success">Paid</Badge>;
  if (billing.status === 'trial') return <Badge variant="warning">Trial · {billing.days_left}d left</Badge>;
  return <Badge variant="destructive">Expired</Badge>;
}

export default function SuperAdminCompanies() {
  const [companies, setCompanies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [grantingId, setGrantingId] = useState<string | null>(null);
  const [signingInId, setSigningInId] = useState<string | null>(null);
  const [billingModalCompany, setBillingModalCompany] = useState<any | null>(null);
  const [billingData, setBillingData] = useState<any | null>(null);
  const [loadingBilling, setLoadingBilling] = useState(false);

  const { login, setViewAsOrg } = useAuth();
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

  const singleSignIn = async (c: any) => {
    setSigningInId(c.id);
    try {
      const res = await fetchApi(`/api/superadmin/companies/${c.id}/impersonate`, {
        method: 'POST',
      });
      if (res.access_token) {
        const currentToken = localStorage.getItem('token');
        if (currentToken) {
          localStorage.setItem('superadmin_parent_token', currentToken);
        }
        login(res.access_token, res.user);
        router.push('/dashboard');
      }
    } catch (err: any) {
      alert(err?.message || 'Single sign-in failed');
    } finally {
      setSigningInId(null);
    }
  };

  const openBilling = async (c: any) => {
    setBillingModalCompany(c);
    setLoadingBilling(true);
    try {
      const data = await fetchApi(`/api/superadmin/companies/${c.id}/billing`);
      setBillingData(data);
    } catch (err: any) {
      alert(err?.message || 'Could not fetch company billing');
    } finally {
      setLoadingBilling(false);
    }
  };

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
        description="Every company on HirePilot. Access accounts with 1-click Single Sign-In, monitor call usage, and manage billing."
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
              <TableHead>Wallet (₹)</TableHead>
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
                <TableCell className="font-semibold text-foreground">{c.name}</TableCell>
                <TableCell>
                  <Badge variant={c.status === 'active' ? 'success' : 'destructive'}>{c.status || 'active'}</Badge>
                </TableCell>
                <TableCell>
                  <button
                    onClick={() => openBilling(c)}
                    className="font-mono font-medium text-emerald-600 hover:underline flex items-center gap-1"
                    title="View Wallet & Usage Details"
                  >
                    <Wallet size={13} />
                    ₹{(c.wallet_balance ?? 0).toFixed(2)}
                  </button>
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
                  <div className="flex justify-end gap-1.5 flex-wrap">
                    {/* Single Sign-In Button */}
                    <Button
                      size="sm"
                      className="bg-primary text-primary-foreground hover:opacity-90 font-medium"
                      onClick={() => singleSignIn(c)}
                      disabled={signingInId === c.id}
                      title="Single Sign-In: 1-click direct login as this company's admin"
                    >
                      {signingInId === c.id ? <Loader2 className="animate-spin" size={13} /> : <LogIn size={13} />}
                      Sign In
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openBilling(c)}
                      title="View company wallet and call usage"
                    >
                      <Wallet size={13} />
                      Usage
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => grantAccess(c)}
                      disabled={grantingId === c.id}
                      title="Extend this company's access by 30 days without a payment"
                    >
                      {grantingId === c.id ? <Loader2 className="animate-spin" size={13} /> : <Gift size={13} />}
                      Grant 30d
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {/* Company Billing & Usage Modal for Super Admin */}
      {billingModalCompany && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-2xl border border-border bg-card p-6 shadow-2xl space-y-5 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div>
                <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                  <Wallet className="text-primary" size={20} />
                  {billingModalCompany.name} · Billing & Usage
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">Org ID: {billingModalCompany.id}</p>
              </div>
              <button
                onClick={() => setBillingModalCompany(null)}
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted"
              >
                <X size={18} />
              </button>
            </div>

            {loadingBilling ? (
              <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
            ) : billingData?.wallet ? (
              <div className="space-y-5">
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-xl border border-border bg-background p-3.5">
                    <p className="text-xs text-muted-foreground font-medium">Wallet Balance</p>
                    <p className="text-2xl font-bold text-emerald-600 mt-1">₹{billingData.wallet.balance?.toFixed(2)}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{billingData.wallet.plan_name}</p>
                  </div>
                  <div className="rounded-xl border border-border bg-background p-3.5">
                    <p className="text-xs text-muted-foreground font-medium">Minutes Used</p>
                    <p className="text-2xl font-bold text-foreground mt-1">{billingData.wallet.minutes_used ?? 0}m</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{billingData.wallet.total_calls ?? 0} calls</p>
                  </div>
                  <div className="rounded-xl border border-border bg-background p-3.5">
                    <p className="text-xs text-muted-foreground font-medium">Total Spend</p>
                    <p className="text-2xl font-bold text-foreground mt-1">₹{billingData.wallet.total_spending?.toFixed(2) ?? '0.00'}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">Rate: ₹12.00/min</p>
                  </div>
                </div>

                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Recent Call Usage Records</h4>
                  {(!billingData.usage || billingData.usage.length === 0) ? (
                    <p className="text-xs text-muted-foreground py-4 text-center border border-dashed rounded-lg">No call usage records yet.</p>
                  ) : (
                    <div className="max-h-60 overflow-y-auto border border-border rounded-xl">
                      <table className="w-full text-xs text-left">
                        <thead className="bg-muted/50 border-b border-border">
                          <tr>
                            <th className="p-2.5">Call / Candidate</th>
                            <th className="p-2.5 text-center">Duration</th>
                            <th className="p-2.5 text-center">Minutes</th>
                            <th className="p-2.5 text-right">Cost</th>
                            <th className="p-2.5 text-right">Date</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/50">
                          {billingData.usage.map((u: any, idx: number) => (
                            <tr key={idx} className="hover:bg-muted/20">
                              <td className="p-2.5 font-medium">{u.candidate_name || u.customer_name || u.call_id?.slice(0, 14)}</td>
                              <td className="p-2.5 text-center font-mono">{Math.round(u.duration_seconds || 0)}s</td>
                              <td className="p-2.5 text-center font-mono">{u.billed_minutes ?? 0}m</td>
                              <td className="p-2.5 text-right font-mono text-emerald-600">₹{(u.customer_cost ?? 0).toFixed(2)}</td>
                              <td className="p-2.5 text-right text-muted-foreground">
                                {u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                <div className="flex justify-between items-center pt-2">
                  <Button
                    size="sm"
                    className="bg-primary text-primary-foreground font-semibold flex items-center gap-1.5"
                    onClick={() => singleSignIn(billingModalCompany)}
                  >
                    <LogIn size={14} />
                    Sign In as {billingModalCompany.name}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setBillingModalCompany(null)}>
                    Close
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
