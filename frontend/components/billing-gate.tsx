'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CreditCard, Loader2 } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { BillingStatus, createOrder, getBillingStatus, loadRazorpayCheckout, verifyPayment } from '@/lib/billing';
import { Button } from '@/components/ui/button';

/**
 * Frontend half of the billing gate. The server (BillingGateMiddleware)
 * enforces this for real — this component only makes the block visible and
 * gives the company a way to pay. Renders nothing for a super admin (they
 * have no org to bill) or before the first status check resolves.
 */
export function BillingGate() {
  const { user, logout } = useAuth();
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const skip = !user || user.role === 'SUPER_ADMIN';

  const refresh = useCallback(async () => {
    if (skip) return;
    try {
      setStatus(await getBillingStatus());
    } catch (err) {
      console.error('Billing status check failed:', err);
    }
  }, [skip]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [refresh]);

  const handleRecharge = async () => {
    setError(null);
    setPaying(true);
    try {
      const order = await createOrder('monthly');
      await loadRazorpayCheckout();
      const Razorpay = (window as any).Razorpay;
      const rzp = new Razorpay({
        key: order.key_id,
        amount: order.amount,
        currency: order.currency,
        name: status?.organization_name || 'Hireonomous',
        description: `${order.plan_label} plan`,
        order_id: order.order_id,
        theme: { color: '#4f46e5' },
        modal: { ondismiss: () => setPaying(false) },
        handler: async (response: any) => {
          try {
            const updated = await verifyPayment({
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            });
            setStatus(updated);
          } catch (err: any) {
            setError(err?.message || 'Payment verification failed. If money was deducted, it will be reconciled automatically — contact support if access is not restored shortly.');
          } finally {
            setPaying(false);
          }
        },
      });
      rzp.on('payment.failed', (resp: any) => {
        setError(resp?.error?.description || 'Payment failed. Please try again.');
        setPaying(false);
      });
      rzp.open();
    } catch (err: any) {
      setError(err?.message || 'Could not start checkout.');
      setPaying(false);
    }
  };

  if (skip || !status) return null;

  return (
    <>
      {status.access && status.status === 'trial' && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-warning/40 bg-warning/10 px-5 py-2 text-sm lg:px-10">
          <span className="font-semibold text-warning-text">
            {status.days_left} day{status.days_left === 1 ? '' : 's'} left in your free trial.
          </span>
          {status.billing_enabled && (
            <Button size="sm" variant="warning" onClick={handleRecharge} disabled={paying}>
              {paying ? <Loader2 className="animate-spin" size={13} /> : <CreditCard size={13} />}
              Recharge now
            </Button>
          )}
        </div>
      )}

      {!status.access && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-foreground/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-2xl">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <AlertTriangle size={22} />
            </div>
            <h2 className="text-lg font-bold text-foreground">Your free trial has ended</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {status.organization_name ? `${status.organization_name}'s` : 'Your'} access to Hireonomous is paused.
              Recharge to keep using AI interviews, calls and analytics.
            </p>

            {error && (
              <p className="mt-3 rounded-lg bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">{error}</p>
            )}

            {!status.billing_enabled ? (
              <p className="mt-4 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
                Payments aren&rsquo;t configured yet. Please contact your Hireonomous account manager to recharge.
              </p>
            ) : (
              <Button className="mt-5 w-full" size="lg" onClick={handleRecharge} disabled={paying}>
                {paying ? <Loader2 className="animate-spin" size={14} /> : <CreditCard size={14} />}
                {paying
                  ? 'Opening secure checkout…'
                  : `Recharge ₹${status.plans?.monthly?.amount_inr ?? ''} / ${status.plans?.monthly?.days ?? 30} days`}
              </Button>
            )}

            <button
              onClick={logout}
              className="mt-4 block w-full text-xs font-semibold text-muted-foreground hover:text-foreground"
            >
              Log out
            </button>
          </div>
        </div>
      )}
    </>
  );
}
