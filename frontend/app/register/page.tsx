'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { fetchApi } from '@/lib/api';
import { BrandLogo } from '@/components/brand-logo';
import { Sparkles, CheckCircle2, Building2, User, Mail, Lock, PhoneCall, ArrowRight, Clock } from 'lucide-react';

const INDUSTRIES = [
  { value: 'tech', label: 'Technology & Software' },
  { value: 'finance', label: 'Banking & Financial Services' },
  { value: 'healthcare', label: 'Healthcare & Life Sciences' },
  { value: 'ecommerce', label: 'Retail & E-commerce' },
  { value: 'consulting', label: 'Consulting & Professional Services' },
  { value: 'manufacturing', label: 'Manufacturing & Logistics' },
  { value: 'education', label: 'Education & EdTech' },
  { value: 'other', label: 'Other Industry' },
];

export default function RegisterPage() {
  const [formData, setFormData] = useState({
    name: '',
    company_name: '',
    email: '',
    password: '',
    confirm_password: '',
    industry: 'tech',
  });
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();
  const router = useRouter();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (formData.password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }

    if (formData.password !== formData.confirm_password) {
      setError('Passwords do not match.');
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetchApi('/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: formData.name.trim(),
          company_name: formData.company_name.trim(),
          email: formData.email.trim(),
          password: formData.password,
          industry: formData.industry,
        }),
      });

      if (response.access_token) {
        login(response.access_token, response.user);
        router.push('/dashboard');
      } else {
        setError('Account created, but received unexpected response. Please log in.');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to create company account.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="app-surface flex min-h-screen items-center justify-center p-4 py-10">
      <div className="w-full max-w-xl space-y-6 rounded-2xl border border-border bg-card p-8 shadow-xl">
        {/* Header */}
        <div className="text-center">
          <BrandLogo className="mx-auto h-12 w-12" />
          <h2 className="mt-4 text-3xl font-extrabold tracking-tight text-foreground">
            Start Your Free Trial
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Get instant access to AI voice screening with 10 free minutes. No credit card required.
          </p>
        </div>

        {/* Free trial highlight pill */}
        <div className="flex items-center justify-between rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Clock size={20} />
            </div>
            <div>
              <p className="font-semibold text-foreground">10 Minutes Free AI Calling</p>
              <p className="text-xs text-muted-foreground">Preloaded on registration. Recharge anytime after your trial.</p>
            </div>
          </div>
          <span className="rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-bold text-emerald-600 dark:text-emerald-400">
            Free
          </span>
        </div>

        {/* Error message */}
        {error && (
          <div className="rounded-xl bg-destructive/15 p-3 text-sm font-medium text-destructive">
            {error}
          </div>
        )}

        {/* Form */}
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="company_name" className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Company Name
              </label>
              <div className="relative mt-1.5">
                <Building2 className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
                <input
                  id="company_name"
                  name="company_name"
                  type="text"
                  required
                  value={formData.company_name}
                  onChange={handleChange}
                  className="w-full rounded-xl border border-border bg-background pl-10 pr-4 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  placeholder="Acme Inc."
                />
              </div>
            </div>

            <div>
              <label htmlFor="industry" className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Industry
              </label>
              <select
                id="industry"
                name="industry"
                value={formData.industry}
                onChange={handleChange}
                className="mt-1.5 w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              >
                {INDUSTRIES.map((ind) => (
                  <option key={ind.value} value={ind.value}>
                    {ind.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="name" className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Your Full Name
              </label>
              <div className="relative mt-1.5">
                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
                <input
                  id="name"
                  name="name"
                  type="text"
                  required
                  value={formData.name}
                  onChange={handleChange}
                  className="w-full rounded-xl border border-border bg-background pl-10 pr-4 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  placeholder="Sarah Connor"
                />
              </div>
            </div>

            <div>
              <label htmlFor="email" className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Work Email Address
              </label>
              <div className="relative mt-1.5">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  value={formData.email}
                  onChange={handleChange}
                  className="w-full rounded-xl border border-border bg-background pl-10 pr-4 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  placeholder="sarah@acme.com"
                />
              </div>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="password" className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Password
              </label>
              <div className="relative mt-1.5">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
                <input
                  id="password"
                  name="password"
                  type="password"
                  required
                  value={formData.password}
                  onChange={handleChange}
                  className="w-full rounded-xl border border-border bg-background pl-10 pr-4 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  placeholder="••••••••"
                />
              </div>
            </div>

            <div>
              <label htmlFor="confirm_password" className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Confirm Password
              </label>
              <div className="relative mt-1.5">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
                <input
                  id="confirm_password"
                  name="confirm_password"
                  type="password"
                  required
                  value={formData.confirm_password}
                  onChange={handleChange}
                  className="w-full rounded-xl border border-border bg-background pl-10 pr-4 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  placeholder="••••••••"
                />
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-sm hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {isLoading ? 'Creating Your Workspace...' : 'Start Free Trial'}
            {!isLoading && <ArrowRight size={16} />}
          </button>
        </form>

        {/* Feature checklist */}
        <div className="grid grid-cols-2 gap-2 border-t border-border pt-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <CheckCircle2 size={14} className="text-emerald-500" />
            <span>10 min calling included</span>
          </div>
          <div className="flex items-center gap-1.5">
            <CheckCircle2 size={14} className="text-emerald-500" />
            <span>AI Voice Screening & Interviews</span>
          </div>
          <div className="flex items-center gap-1.5">
            <CheckCircle2 size={14} className="text-emerald-500" />
            <span>Custom Telephony & Email</span>
          </div>
          <div className="flex items-center gap-1.5">
            <CheckCircle2 size={14} className="text-emerald-500" />
            <span>No credit card needed</span>
          </div>
        </div>

        {/* Links */}
        <p className="text-center text-sm text-muted-foreground">
          Already registered?{' '}
          <Link href="/login" className="font-semibold text-primary hover:underline">
            Sign in
          </Link>
        </p>

        <div className="space-y-2 border-t border-border pt-4 text-center">
          <nav className="flex flex-wrap justify-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <Link href="/pricing" className="hover:text-foreground hover:underline">Pricing</Link>
            <span>·</span>
            <Link href="/terms" className="hover:text-foreground hover:underline">Terms</Link>
            <span>·</span>
            <Link href="/privacy" className="hover:text-foreground hover:underline">Privacy</Link>
            <span>·</span>
            <Link href="/contact" className="hover:text-foreground hover:underline">Contact</Link>
          </nav>
          <p className="text-xs text-muted-foreground">
            A product by <span className="font-semibold text-foreground tracking-wide">NOVALANTIS</span>
          </p>
        </div>
      </div>
    </div>
  );
}
