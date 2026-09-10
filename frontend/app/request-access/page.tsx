'use client';

import { useState } from 'react';
import Link from 'next/link';
import { fetchApi } from '@/lib/api';
import { BrandLogo } from '@/components/brand-logo';

const ROLES = [
  { value: 'ORGANIZATION_ADMIN', label: 'Admin / owner' },
  { value: 'RECRUITER', label: 'Recruiter' },
  { value: 'HIRING_MANAGER', label: 'Hiring manager' },
];

export default function RequestAccessPage() {
  const [form, setForm] = useState({
    company: '', name: '', email: '', role: 'ORGANIZATION_ADMIN', password: '',
  });
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (form.password.length < 8) {
      setError('Choose a password of at least 8 characters.');
      return;
    }
    setLoading(true);
    try {
      await fetchApi('/api/auth/request-access', {
        method: 'POST',
        body: JSON.stringify(form),
      });
      setDone(true);
    } catch (err: any) {
      setError(err.message || 'Could not submit your request. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-surface flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md space-y-7 rounded-2xl border border-border bg-card p-8 shadow-xl">
        <div className="text-center">
          <BrandLogo className="mx-auto h-12 w-12" />
          <h1 className="mt-6 text-2xl font-bold tracking-tight text-foreground">Request company access</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Tell us about your company. Once approved you can sign in with the email and password below.
          </p>
        </div>

        {done ? (
          <div className="space-y-4 text-center">
            <div className="rounded-xl bg-success/15 p-4 text-sm font-medium text-success">
              Request received. We&rsquo;ll review it and email you when your account is ready.
            </div>
            <Link href="/login" className="inline-block text-sm font-semibold text-primary hover:underline">
              Back to sign in
            </Link>
          </div>
        ) : (
          <form className="space-y-4" onSubmit={submit}>
            {error && (
              <div className="rounded-md bg-destructive/15 p-3 text-sm font-medium text-destructive">{error}</div>
            )}

            <Field label="Company name">
              <input required value={form.company} onChange={set('company')} placeholder="Acme Inc." className={inputCls} />
            </Field>
            <Field label="Your name">
              <input required value={form.name} onChange={set('name')} placeholder="Jane Doe" className={inputCls} />
            </Field>
            <Field label="Work email">
              <input required type="email" value={form.email} onChange={set('email')} placeholder="jane@acme.com" className={inputCls} />
            </Field>
            <Field label="Your role">
              <select value={form.role} onChange={set('role')} className={inputCls}>
                {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </Field>
            <Field label="Choose a password">
              <input required type="password" value={form.password} onChange={set('password')} placeholder="At least 8 characters" className={inputCls} />
            </Field>

            <button
              type="submit"
              disabled={loading}
              className="flex w-full justify-center rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-sm hover:opacity-90 disabled:opacity-50"
            >
              {loading ? 'Submitting…' : 'Submit request'}
            </button>

            <p className="text-center text-sm text-muted-foreground">
              Already have an account?{' '}
              <Link href="/login" className="font-semibold text-primary hover:underline">Sign in</Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}

const inputCls =
  'mt-2 block w-full rounded-xl border border-border bg-background px-4 py-3 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-foreground">{label}</span>
      {children}
    </label>
  );
}
