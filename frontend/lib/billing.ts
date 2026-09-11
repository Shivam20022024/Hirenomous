import { fetchApi } from './api';

export interface BillingStatus {
  access: boolean;
  status: 'active' | 'trial' | 'expired';
  trial_ends_at?: string | null;
  paid_until?: string | null;
  days_left: number | null;
  organization_name?: string;
  billing_enabled: boolean;
  plans?: Record<string, { label: string; amount_inr: number; days: number }>;
}

export interface CreateOrderResponse {
  order_id: string;
  amount: number;
  currency: string;
  key_id: string;
  plan: string;
  plan_label: string;
}

export function getBillingStatus(): Promise<BillingStatus> {
  return fetchApi('/api/billing/status');
}

export function createOrder(plan: string = 'monthly'): Promise<CreateOrderResponse> {
  return fetchApi('/api/billing/create-order', {
    method: 'POST',
    body: JSON.stringify({ plan }),
  });
}

export function verifyPayment(payload: {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}): Promise<BillingStatus> {
  return fetchApi('/api/billing/verify', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

let checkoutScriptPromise: Promise<void> | null = null;

export function loadRazorpayCheckout(): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('No window'));
  if ((window as any).Razorpay) return Promise.resolve();
  if (checkoutScriptPromise) return checkoutScriptPromise;

  checkoutScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve();
    script.onerror = () => {
      checkoutScriptPromise = null;
      reject(new Error('Could not load the payment widget. Check your connection and try again.'));
    };
    document.body.appendChild(script);
  });

  return checkoutScriptPromise;
}
