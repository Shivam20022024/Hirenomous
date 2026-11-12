'use client';

import { useEffect, useState } from 'react';
import { fetchApi } from '@/lib/api';
import { 
  Wallet, 
  CreditCard, 
  PhoneCall, 
  Clock, 
  TrendingUp, 
  Plus, 
  RefreshCw, 
  CheckCircle2, 
  X, 
  Loader2, 
  Zap, 
  ArrowDownLeft,
  ArrowUpRight
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/page-header';

interface DashboardData {
  balance: number;
  currency: string;
  plan_name: string;
  is_trial: boolean;
  is_unlimited?: boolean;
  minutes_used: number;
  minutes_included: number;
  minutes_remaining: number;
  total_spending: number;
  total_calls: number;
  completed_calls: number;
  rate_per_minute: number;
  company_name: string;
}

interface UsageRecord {
  id?: string;
  call_id?: string;
  candidate_name?: string;
  phone?: string;
  duration_seconds?: number;
  billed_minutes?: number;
  customer_cost?: number;
  service_type?: string;
  status?: string;
  created_at?: string;
}

interface Transaction {
  id: string;
  type: 'CREDIT' | 'DEBIT';
  amount: number;
  currency: string;
  payment_provider: string;
  provider_transaction_id?: string;
  description?: string;
  status: string;
  created_at: string;
}

export default function BillingPage() {
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [usage, setUsage] = useState<UsageRecord[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'usage' | 'transactions'>('usage');
  
  // Top-Up Modal State
  const [showTopupModal, setShowTopupModal] = useState(false);
  const [topupAmount, setTopupAmount] = useState<number>(500);
  const [customAmount, setCustomAmount] = useState<string>('');
  const [toppingUp, setToppingUp] = useState(false);

  useEffect(() => {
    if (document.getElementById('razorpay-checkout-js')) return;
    const script = document.createElement('script');
    script.id = 'razorpay-checkout-js';
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    document.body.appendChild(script);
  }, []);

  const loadData = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const [walletData, usageData, txData] = await Promise.all([
        fetchApi('/api/billing/wallet').catch(() => null),
        fetchApi('/api/billing/usage').catch(() => []),
        fetchApi('/api/billing/transactions').catch(() => []),
      ]);

      if (walletData) setDashboard(walletData);
      if (Array.isArray(usageData)) setUsage(usageData);
      if (Array.isArray(txData)) setTransactions(txData);
    } catch (err) {
      console.error('Failed to load billing data:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleRazorpayTopup = async () => {
    const finalAmount = customAmount ? parseFloat(customAmount) : topupAmount;
    if (!finalAmount || isNaN(finalAmount) || finalAmount <= 0) {
      alert('Please enter a valid top-up amount');
      return;
    }

    setToppingUp(true);
    try {
      const order = await fetchApi('/api/billing/wallet/razorpay/create-order', {
        method: 'POST',
        body: JSON.stringify({ amount: finalAmount, currency: 'INR' }),
      });

      if (!order || !order.order_id) {
        throw new Error('Failed to create Razorpay order');
      }

      if (!(window as any).Razorpay) {
        throw new Error('Razorpay SDK is still loading. Please try again in a moment.');
      }

      const options = {
        key: order.key_id,
        amount: order.amount,
        currency: order.currency || 'INR',
        name: 'HirePilot AI',
        description: `Wallet Top-Up (₹${finalAmount})`,
        order_id: order.order_id,
        handler: async (response: any) => {
          try {
            setToppingUp(true);
            const verifiedWallet = await fetchApi('/api/billing/wallet/razorpay/verify', {
              method: 'POST',
              body: JSON.stringify({
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
              }),
            });
            setDashboard(verifiedWallet);
            setShowTopupModal(false);
            setCustomAmount('');
            alert(`Payment successful! ₹${finalAmount} has been credited to your wallet.`);
            loadData(true);
          } catch (verifyErr: any) {
            alert(verifyErr.message || 'Payment verification failed');
          } finally {
            setToppingUp(false);
          }
        },
        theme: { color: '#2563eb' },
      };

      const rzp = new (window as any).Razorpay(options);
      rzp.on('payment.failed', (failResp: any) => {
        alert(`Payment failed: ${failResp.error.description || 'Unknown error'}`);
        setToppingUp(false);
      });
      rzp.open();
    } catch (err: any) {
      alert(err.message || 'Failed to initiate recharge');
      setToppingUp(false);
    }
  };

  return (
    <div className="space-y-8 p-6 lg:p-10 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <PageHeader
          eyebrow="Finance & Telephony"
          title="Billing & Usage"
          description="Manage your calling wallet credits, review per-call interview usage, and view transaction history."
        />
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => loadData(true)}
            disabled={refreshing || loading}
            className="flex items-center gap-1.5"
          >
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
            Refresh
          </Button>
          <Button
            size="sm"
            onClick={() => setShowTopupModal(true)}
            className="bg-primary text-primary-foreground font-semibold flex items-center gap-1.5 shadow-sm hover:opacity-90"
          >
            <Plus size={15} />
            Add Balance
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-24"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : (
        <>
          {/* Metric Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Wallet Balance Card */}
            <div className="rounded-2xl border border-border bg-card p-5 shadow-sm relative overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Wallet Balance</span>
                <div className="h-8 w-8 rounded-lg bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
                  <Wallet size={18} />
                </div>
              </div>
              <p className="mt-3 text-3xl font-bold tracking-tight text-foreground">
                ₹{(dashboard?.balance ?? 0).toFixed(2)}
              </p>
              <div className="mt-2 flex items-center gap-2">
                <Badge variant={dashboard?.is_unlimited || dashboard?.plan_name?.includes('Unlimited') ? 'success' : (dashboard?.is_trial && (dashboard?.minutes_remaining ?? 0) > 0 ? 'success' : (dashboard?.balance && dashboard.balance > 50 ? 'success' : 'warning'))}>
                  {dashboard?.is_unlimited || dashboard?.plan_name?.includes('Unlimited')
                    ? 'Unlimited Calling Active'
                    : dashboard?.is_trial && (dashboard?.minutes_remaining ?? 0) > 0
                    ? `${dashboard.minutes_remaining}m Trial Active`
                    : (dashboard?.balance && dashboard.balance > 0 ? 'Active Credits' : 'Low Balance')}
                </Badge>
                <span className="text-xs text-muted-foreground">{dashboard?.plan_name || 'Pay-As-You-Go'}</span>
              </div>
            </div>

            {/* Minutes Used */}
            <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Minutes Used</span>
                <div className="h-8 w-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                  <Clock size={18} />
                </div>
              </div>
              <p className="mt-3 text-3xl font-bold tracking-tight text-foreground">
                {dashboard?.minutes_used ?? 0} <span className="text-sm font-normal text-muted-foreground">min</span>
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                {dashboard?.is_unlimited || dashboard?.plan_name?.includes('Unlimited')
                  ? 'Unlimited demo & internal calls'
                  : dashboard?.is_trial
                  ? `${dashboard?.minutes_remaining ?? 10}m trial calling left`
                  : `${dashboard?.total_calls ?? 0} total interview calls made`}
              </p>
            </div>

            {/* Total Spend */}
            <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Total Spend</span>
                <div className="h-8 w-8 rounded-lg bg-amber-500/10 text-amber-600 flex items-center justify-center">
                  <TrendingUp size={18} />
                </div>
              </div>
              <p className="mt-3 text-3xl font-bold tracking-tight text-foreground">
                ₹{(dashboard?.total_spending ?? 0).toFixed(2)}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                {dashboard?.completed_calls ?? 0} calls completed
              </p>
            </div>

            {/* Rate & Engine */}
            <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Calling Rate</span>
                <div className="h-8 w-8 rounded-lg bg-purple-500/10 text-purple-600 flex items-center justify-center">
                  <Zap size={18} />
                </div>
              </div>
              <p className="mt-3 text-3xl font-bold tracking-tight text-foreground">
                {dashboard?.is_unlimited || dashboard?.plan_name?.includes('Unlimited') ? '₹0.00' : '₹12.00'} <span className="text-sm font-normal text-muted-foreground">/ min</span>
              </p>
              <p className="mt-2 text-xs text-muted-foreground flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                {dashboard?.is_unlimited || dashboard?.plan_name?.includes('Unlimited') ? 'Unlimited Demo Engine' : 'AI Voice Screening Engine'}
              </p>
            </div>
          </div>

          {/* Tabs Section */}
          <div className="space-y-4">
            <div className="flex border-b border-border">
              <button
                onClick={() => setActiveTab('usage')}
                className={`flex items-center gap-2 border-b-2 px-5 py-3 text-sm font-semibold transition-colors ${
                  activeTab === 'usage'
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                <PhoneCall size={16} />
                Call Usage ({usage.length})
              </button>
              <button
                onClick={() => setActiveTab('transactions')}
                className={`flex items-center gap-2 border-b-2 px-5 py-3 text-sm font-semibold transition-colors ${
                  activeTab === 'transactions'
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                <CreditCard size={16} />
                Transactions ({transactions.length})
              </button>
            </div>

            {activeTab === 'usage' ? (
              <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
                {usage.length === 0 ? (
                  <div className="py-16 text-center text-sm text-muted-foreground">
                    <PhoneCall className="mx-auto h-8 w-8 mb-2 opacity-40" />
                    No call usage records found yet. Calls placed to candidates will appear here with live duration and charges.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-muted/40 border-b border-border text-xs uppercase font-semibold text-muted-foreground">
                        <tr>
                          <th className="px-5 py-3.5">Candidate / Call</th>
                          <th className="px-5 py-3.5">Phone Number</th>
                          <th className="px-5 py-3.5 text-center">Duration</th>
                          <th className="px-5 py-3.5 text-center">Billed Minutes</th>
                          <th className="px-5 py-3.5 text-right">Cost (₹)</th>
                          <th className="px-5 py-3.5">Status</th>
                          <th className="px-5 py-3.5 text-right">Timestamp</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/60">
                        {usage.map((u, i) => (
                          <tr key={u.id || i} className="hover:bg-muted/20">
                            <td className="px-5 py-3.5 font-semibold text-foreground">
                              {u.candidate_name || 'Candidate'}
                              {u.service_type && (
                                <span className="ml-2 text-[10px] font-normal uppercase bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                                  {u.service_type.replace('_', ' ')}
                                </span>
                              )}
                            </td>
                            <td className="px-5 py-3.5 font-mono text-xs text-muted-foreground">
                              {u.phone || '—'}
                            </td>
                            <td className="px-5 py-3.5 text-center font-mono font-medium">
                              {Math.round(u.duration_seconds || 0)}s
                            </td>
                            <td className="px-5 py-3.5 text-center font-mono">
                              {u.billed_minutes ?? 0}m
                            </td>
                            <td className="px-5 py-3.5 text-right font-mono font-bold text-foreground">
                              ₹{(u.customer_cost ?? 0).toFixed(2)}
                            </td>
                            <td className="px-5 py-3.5">
                              <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium bg-emerald-500/10 text-emerald-600">
                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                {u.status || 'Completed'}
                              </span>
                            </td>
                            <td className="px-5 py-3.5 text-right text-xs text-muted-foreground">
                              {u.created_at ? new Date(u.created_at).toLocaleString() : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
                {transactions.length === 0 ? (
                  <div className="py-16 text-center text-sm text-muted-foreground">
                    <CreditCard className="mx-auto h-8 w-8 mb-2 opacity-40" />
                    No transaction records found. Wallet recharges and debits will appear here.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-muted/40 border-b border-border text-xs uppercase font-semibold text-muted-foreground">
                        <tr>
                          <th className="px-5 py-3.5">Type</th>
                          <th className="px-5 py-3.5">Description</th>
                          <th className="px-5 py-3.5 text-right">Amount (₹)</th>
                          <th className="px-5 py-3.5">Provider</th>
                          <th className="px-5 py-3.5">Status</th>
                          <th className="px-5 py-3.5 text-right">Date</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/60">
                        {transactions.map((tx, i) => (
                          <tr key={tx.id || i} className="hover:bg-muted/20">
                            <td className="px-5 py-3.5">
                              <span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-semibold ${
                                tx.type === 'CREDIT' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-red-500/10 text-red-600'
                              }`}>
                                {tx.type === 'CREDIT' ? <ArrowDownLeft size={12} /> : <ArrowUpRight size={12} />}
                                {tx.type}
                              </span>
                            </td>
                            <td className="px-5 py-3.5 text-foreground font-medium">
                              {tx.description || (tx.type === 'CREDIT' ? 'Recharge' : 'Call Usage')}
                            </td>
                            <td className={`px-5 py-3.5 text-right font-mono font-bold ${
                              tx.type === 'CREDIT' ? 'text-emerald-600' : 'text-foreground'
                            }`}>
                              {tx.type === 'CREDIT' ? '+' : '-'}₹{(tx.amount || 0).toFixed(2)}
                            </td>
                            <td className="px-5 py-3.5 text-xs font-mono text-muted-foreground uppercase">
                              {tx.payment_provider || 'wallet'}
                            </td>
                            <td className="px-5 py-3.5">
                              <Badge variant={tx.status === 'COMPLETED' ? 'success' : 'neutral'}>
                                {tx.status}
                              </Badge>
                            </td>
                            <td className="px-5 py-3.5 text-right text-xs text-muted-foreground">
                              {tx.created_at ? new Date(tx.created_at).toLocaleString() : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {/* Razorpay Top-Up Modal */}
      {showTopupModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                <Wallet className="text-primary" size={20} />
                Recharge Calling Wallet
              </h3>
              <button
                onClick={() => setShowTopupModal(false)}
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4">
              <p className="text-xs text-muted-foreground">
                Select an amount to recharge your calling credits. Instant credit via Razorpay UPI, Cards, or NetBanking.
              </p>

              {/* Preset buttons */}
              <div className="grid grid-cols-3 gap-2.5">
                {[500, 1000, 2500].map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => {
                      setTopupAmount(amt);
                      setCustomAmount('');
                    }}
                    className={`rounded-xl border p-3 text-center font-bold text-sm transition-all ${
                      topupAmount === amt && !customAmount
                        ? 'border-primary bg-primary/10 text-primary shadow-sm ring-1 ring-primary'
                        : 'border-border bg-background text-foreground hover:border-primary/50'
                    }`}
                  >
                    ₹{amt}
                  </button>
                ))}
              </div>

              {/* Custom amount */}
              <div>
                <label className="text-xs font-medium text-foreground block mb-1.5">Or enter custom amount (₹)</label>
                <input
                  type="number"
                  placeholder="e.g. 5000"
                  value={customAmount}
                  onChange={(e) => setCustomAmount(e.target.value)}
                  className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div className="rounded-xl bg-muted/40 p-3.5 text-xs text-muted-foreground space-y-1">
                <div className="flex justify-between">
                  <span>Calling Rate:</span>
                  <span className="font-semibold text-foreground">₹12.00 / minute</span>
                </div>
                <div className="flex justify-between">
                  <span>Approx. Minutes:</span>
                  <span className="font-semibold text-foreground">
                    ~{Math.round(((customAmount ? parseFloat(customAmount) : topupAmount) || 0) / 12)} mins
                  </span>
                </div>
              </div>

              <Button
                onClick={handleRazorpayTopup}
                disabled={toppingUp}
                className="w-full bg-primary text-primary-foreground font-bold py-3 text-sm shadow-md hover:opacity-90 flex items-center justify-center gap-2"
              >
                {toppingUp ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} />}
                Pay ₹{customAmount || topupAmount} via Razorpay
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

