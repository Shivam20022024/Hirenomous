import Link from 'next/link';
import { LegalPageLayout } from '@/components/legal-page-layout';
import { Check } from 'lucide-react';

const FEATURES = [
  'Unlimited job postings',
  'AI resume screening & candidate scoring',
  'AI phone screening calls',
  'AI video interviews with proctoring & integrity checks',
  'Bulk candidate invites & Google Drive resume import',
  'Hiring analytics & reporting',
  'Email & call communication branded with your company name',
];

export default function PricingPage() {
  return (
    <LegalPageLayout title="Pricing">
      <p className="text-muted-foreground">
        One plan, everything included. Start with a free trial — no card required to begin.
      </p>

      <div className="mt-8 rounded-2xl border border-border bg-card p-8 shadow-sm">
        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-primary">Monthly plan</p>
            <p className="mt-2 text-4xl font-bold text-foreground">
              ₹2,999<span className="text-base font-medium text-muted-foreground"> / 30 days</span>
            </p>
          </div>
          <span className="rounded-full bg-success/15 px-3 py-1 text-xs font-bold text-success">
            7 days free to start
          </span>
        </div>

        <ul className="mt-8 space-y-3">
          {FEATURES.map((f) => (
            <li key={f} className="flex items-start gap-2.5 text-sm text-foreground">
              <Check size={16} className="mt-0.5 shrink-0 text-success" />
              {f}
            </li>
          ))}
        </ul>

        <Link
          href="/request-access"
          className="mt-8 flex w-full items-center justify-center rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-sm hover:opacity-90"
        >
          Start your free trial
        </Link>
      </div>

      <p className="mt-6 text-xs text-muted-foreground">
        After your 7-day free trial, continued use requires recharging your account. See our{' '}
        <Link href="/refund-policy" className="text-primary hover:underline">Refund &amp; Cancellation Policy</Link>{' '}
        for details on billing and cancellation.
      </p>
    </LegalPageLayout>
  );
}
