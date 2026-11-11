'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth-context';
import { fetchApi } from '@/lib/api';
import {
  User,
  Building,
  Mail,
  Shield,
  Bell,
  Key,
  LogOut,
  PhoneCall,
  Server,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  Save,
  Radio,
  Sliders,
  Sparkles,
  Send,
} from 'lucide-react';
import { PageHeader } from '@/components/page-header';

type TabKey = 'profile' | 'organization' | 'telephony' | 'email' | 'security';

export default function SettingsPage() {
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<TabKey>('profile');

  // Telephony state
  const [telephonyLoading, setTelephonyLoading] = useState(false);
  const [telephonySaving, setTelephonySaving] = useState(false);
  const [telephonyMessage, setTelephonyMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showAuthToken, setShowAuthToken] = useState(false);
  const [telephonyForm, setTelephonyForm] = useState({
    mode: 'shared', // 'shared' or 'custom'
    provider: 'plivo', // 'plivo' or 'twilio'
    phone_number: '',
    account_sid: '',
    auth_token: '',
    has_auth_token: false,
    shared_phone_number: '+91 80 6553 5758',
  });

  // Email state
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailSaving, setEmailSaving] = useState(false);
  const [emailTesting, setEmailTesting] = useState(false);
  const [emailMessage, setEmailMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showSmtpPassword, setShowSmtpPassword] = useState(false);
  const [emailForm, setEmailForm] = useState({
    sender_name: '',
    sender_email: '',
    reply_to: '',
    custom_smtp: false,
    smtp_host: '',
    smtp_port: 587,
    smtp_user: '',
    smtp_password: '',
    has_smtp_password: false,
    smtp_use_tls: true,
  });

  // Load telephony settings
  useEffect(() => {
    if (activeTab === 'telephony') {
      setTelephonyLoading(true);
      setTelephonyMessage(null);
      fetchApi('/api/auth/organization/telephony')
        .then((res) => {
          if (res) {
            setTelephonyForm({
              mode: res.mode || 'shared',
              provider: res.provider || 'plivo',
              phone_number: res.phone_number || '',
              account_sid: res.account_sid || '',
              auth_token: '',
              has_auth_token: Boolean(res.has_auth_token),
              shared_phone_number: res.shared_phone_number || '+91 80 6553 5758',
            });
          }
        })
        .catch((err) => {
          setTelephonyMessage({ type: 'error', text: err.message || 'Failed to load telephony configuration.' });
        })
        .finally(() => setTelephonyLoading(false));
    }
  }, [activeTab]);

  // Load email settings
  useEffect(() => {
    if (activeTab === 'email') {
      setEmailLoading(true);
      setEmailMessage(null);
      fetchApi('/api/auth/organization/email-settings')
        .then((res) => {
          if (res) {
            setEmailForm({
              sender_name: res.sender_name || '',
              sender_email: res.sender_email || '',
              reply_to: res.reply_to || '',
              custom_smtp: Boolean(res.custom_smtp),
              smtp_host: res.smtp_host || '',
              smtp_port: res.smtp_port || 587,
              smtp_user: res.smtp_user || '',
              smtp_password: '',
              has_smtp_password: Boolean(res.has_smtp_password),
              smtp_use_tls: res.smtp_use_tls ?? true,
            });
          }
        })
        .catch((err) => {
          setEmailMessage({ type: 'error', text: err.message || 'Failed to load email configuration.' });
        })
        .finally(() => setEmailLoading(false));
    }
  }, [activeTab]);

  // Save Telephony
  const handleSaveTelephony = async (e: React.FormEvent) => {
    e.preventDefault();
    setTelephonySaving(true);
    setTelephonyMessage(null);

    try {
      const payload: any = {
        mode: telephonyForm.mode,
        provider: telephonyForm.provider,
        phone_number: telephonyForm.phone_number.trim(),
        account_sid: telephonyForm.account_sid.trim(),
      };
      if (telephonyForm.auth_token) {
        payload.auth_token = telephonyForm.auth_token.trim();
      }

      await fetchApi('/api/auth/organization/telephony', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      setTelephonyMessage({ type: 'success', text: 'Telephony settings saved successfully.' });
      if (telephonyForm.auth_token) {
        setTelephonyForm((prev) => ({ ...prev, has_auth_token: true, auth_token: '' }));
      }
    } catch (err: any) {
      setTelephonyMessage({ type: 'error', text: err.message || 'Failed to save telephony settings.' });
    } finally {
      setTelephonySaving(false);
    }
  };

  // Save Email
  const handleSaveEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailSaving(true);
    setEmailMessage(null);

    try {
      const payload: any = {
        sender_name: emailForm.sender_name.trim(),
        sender_email: emailForm.sender_email.trim(),
        reply_to: (emailForm.reply_to || emailForm.sender_email).trim(),
        custom_smtp: emailForm.custom_smtp,
        smtp_host: emailForm.smtp_host.trim(),
        smtp_port: Number(emailForm.smtp_port) || 587,
        smtp_user: emailForm.smtp_user.trim(),
        smtp_use_tls: emailForm.smtp_use_tls,
      };
      if (emailForm.smtp_password) {
        payload.smtp_password = emailForm.smtp_password.trim();
      }

      await fetchApi('/api/auth/organization/email-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      setEmailMessage({ type: 'success', text: 'Email & sender settings saved successfully.' });
      if (emailForm.smtp_password) {
        setEmailForm((prev) => ({ ...prev, has_smtp_password: true, smtp_password: '' }));
      }
    } catch (err: any) {
      setEmailMessage({ type: 'error', text: err.message || 'Failed to save email settings.' });
    } finally {
      setEmailSaving(false);
    }
  };

  // Test Custom SMTP Connection
  const handleTestEmail = async () => {
    setEmailTesting(true);
    setEmailMessage(null);
    try {
      const res = await fetchApi('/api/auth/organization/email-settings/test', {
        method: 'POST',
      });
      setEmailMessage({ type: 'success', text: res.message || 'Test email sent successfully!' });
    } catch (err: any) {
      setEmailMessage({ type: 'error', text: err.message || 'Failed to send test email.' });
    } finally {
      setEmailTesting(false);
    }
  };

  return (
    <div className="mx-auto max-w-[1240px] space-y-6 px-5 py-9 lg:px-8 lg:py-14">
      <PageHeader
        eyebrow="Account"
        title="Settings"
        description="Manage your profile, company details, calling service provider, and email channels."
      />

      <div className="flex flex-col md:flex-row gap-8">
        {/* Navigation Sidebar */}
        <aside className="w-full md:w-64 shrink-0 space-y-1">
          <button
            onClick={() => setActiveTab('profile')}
            className={`w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${activeTab === 'profile'
              ? 'bg-primary/10 text-primary'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
          >
            <User size={18} /> Profile
          </button>
          <button
            onClick={() => setActiveTab('organization')}
            className={`w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${activeTab === 'organization'
              ? 'bg-primary/10 text-primary'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
          >
            <Building size={18} /> Organization
          </button>
          <button
            onClick={() => setActiveTab('telephony')}
            className={`w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${activeTab === 'telephony'
              ? 'bg-primary/10 text-primary'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
          >
            <PhoneCall size={18} /> Calling Provider
          </button>
          <button
            onClick={() => setActiveTab('email')}
            className={`w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${activeTab === 'email'
              ? 'bg-primary/10 text-primary'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
          >
            <Mail size={18} /> Email & Sender
          </button>
          <button
            onClick={() => setActiveTab('security')}
            className={`w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${activeTab === 'security'
              ? 'bg-primary/10 text-primary'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
          >
            <Shield size={18} /> Security
          </button>
          <hr className="my-4 border-border" />
          <button
            onClick={logout}
            className="w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
          >
            <LogOut size={18} /> Log out
          </button>
        </aside>

        {/* Tab Content Area */}
        <div className="flex-1 space-y-6">
          {/* PROFILE TAB */}
          {activeTab === 'profile' && (
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="border-b border-border px-6 py-5 bg-muted/30">
                <h2 className="text-lg font-bold">Profile Details</h2>
                <p className="text-sm text-muted-foreground">Your personal account information.</p>
              </div>
              <div className="p-6 space-y-6">
                <div className="flex items-center gap-6">
                  <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/10 text-3xl font-bold text-primary">
                    {user?.name?.charAt(0).toUpperCase() || 'U'}
                  </div>
                  <div>
                    <h3 className="font-bold text-foreground">{user?.name}</h3>
                    <p className="text-sm text-muted-foreground">{user?.email}</p>
                  </div>
                </div>

                <div className="grid gap-6 sm:grid-cols-2">
                  <div>
                    <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Full Name
                    </label>
                    <input
                      disabled
                      value={user?.name || ''}
                      className="mt-1.5 w-full rounded-xl border border-border bg-muted px-4 py-2.5 text-sm opacity-80"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Email Address
                    </label>
                    <div className="relative mt-1.5">
                      <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
                      <input
                        disabled
                        value={user?.email || ''}
                        className="w-full rounded-xl border border-border bg-muted pl-10 pr-4 py-2.5 text-sm opacity-80"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Role</label>
                    <input
                      disabled
                      value={user?.role || 'ORGANIZATION_ADMIN'}
                      className="mt-1.5 w-full rounded-xl border border-border bg-muted px-4 py-2.5 text-sm opacity-80 capitalize"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Workspace
                    </label>
                    <input
                      disabled
                      value={user?.organization_name || 'My Organization'}
                      className="mt-1.5 w-full rounded-xl border border-border bg-muted px-4 py-2.5 text-sm opacity-80"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ORGANIZATION TAB */}
          {activeTab === 'organization' && (
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="border-b border-border px-6 py-5 bg-muted/30">
                <h2 className="text-lg font-bold">Organization Details</h2>
                <p className="text-sm text-muted-foreground">Information about your company workspace.</p>
              </div>
              <div className="p-6 space-y-6">
                <div className="grid gap-6 sm:grid-cols-2">
                  <div>
                    <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Company Name
                    </label>
                    <div className="relative mt-1.5">
                      <Building className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
                      <input
                        disabled
                        value={user?.organization_name || 'My Organization'}
                        className="w-full rounded-xl border border-border bg-muted pl-10 pr-4 py-2.5 text-sm opacity-80"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Organization ID
                    </label>
                    <input
                      disabled
                      value={user?.org_id || user?.organization_id || ''}
                      className="mt-1.5 w-full rounded-xl border border-border bg-muted px-4 py-2.5 text-xs font-mono opacity-80"
                    />
                  </div>
                </div>

                <div className="rounded-xl border border-border bg-muted/30 p-4">
                  <h4 className="text-sm font-semibold text-foreground">Multi-Tenant Isolation</h4>
                  <p className="mt-1 text-xs text-muted-foreground">
                    All jobs, candidate applications, interview audio recordings, AI transcripts, and scoring metrics
                    are strictly isolated to your company organization ID.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* TELEPHONY / CALLING PROVIDER TAB */}
          {activeTab === 'telephony' && (
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="border-b border-border px-6 py-5 bg-muted/30 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold">Telephony & Calling Provider</h2>
                  <p className="text-sm text-muted-foreground">
                    Configure your outbound AI voice calling infrastructure and caller ID phone number.
                  </p>
                </div>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
                  <Sparkles size={13} /> AI Voice Engine
                </span>
              </div>

              {telephonyLoading ? (
                <div className="p-12 text-center text-sm text-muted-foreground">
                  Loading telephony configuration...
                </div>
              ) : (
                <form onSubmit={handleSaveTelephony} className="p-6 space-y-6">
                  {telephonyMessage && (
                    <div
                      className={`flex items-center gap-2 rounded-xl p-3.5 text-sm ${telephonyMessage.type === 'success'
                        ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                        : 'bg-destructive/15 text-destructive'
                        }`}
                    >
                      {telephonyMessage.type === 'success' ? (
                        <CheckCircle2 size={16} />
                      ) : (
                        <AlertCircle size={16} />
                      )}
                      <span>{telephonyMessage.text}</span>
                    </div>
                  )}

                  {/* Mode Selector */}
                  <div className="space-y-3">
                    <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Calling Line Mode
                    </label>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div
                        onClick={() => setTelephonyForm({ ...telephonyForm, mode: 'shared' })}
                        className={`cursor-pointer rounded-xl border p-4 transition-all ${telephonyForm.mode === 'shared'
                          ? 'border-primary bg-primary/5 ring-1 ring-primary'
                          : 'border-border bg-card hover:bg-muted/50'
                          }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-bold text-foreground">Shared Platform Line</span>
                          <span
                            className={`h-4 w-4 rounded-full border flex items-center justify-center ${telephonyForm.mode === 'shared'
                              ? 'border-primary bg-primary'
                              : 'border-muted-foreground'
                              }`}
                          >
                            {telephonyForm.mode === 'shared' && (
                              <span className="h-1.5 w-1.5 rounded-full bg-white" />
                            )}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Zero setup. Outbound AI calls use the verified Hirenomous line (
                          <span className="font-mono font-medium">{telephonyForm.shared_phone_number}</span>).
                        </p>
                      </div>

                      <div
                        onClick={() => setTelephonyForm({ ...telephonyForm, mode: 'custom' })}
                        className={`cursor-pointer rounded-xl border p-4 transition-all ${telephonyForm.mode === 'custom'
                          ? 'border-primary bg-primary/5 ring-1 ring-primary'
                          : 'border-border bg-card hover:bg-muted/50'
                          }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-bold text-foreground">Personal Service Provider</span>
                          <span
                            className={`h-4 w-4 rounded-full border flex items-center justify-center ${telephonyForm.mode === 'custom'
                              ? 'border-primary bg-primary'
                              : 'border-muted-foreground'
                              }`}
                          >
                            {telephonyForm.mode === 'custom' && (
                              <span className="h-1.5 w-1.5 rounded-full bg-white" />
                            )}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Use your company&apos;s own Plivo or Twilio account with your own custom caller ID phone number.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Custom Provider Configuration Details */}
                  {telephonyForm.mode === 'custom' && (
                    <div className="space-y-4 rounded-xl border border-border bg-muted/20 p-5">
                      <div className="flex items-center gap-2 text-sm font-bold text-foreground">
                        <Sliders size={16} className="text-primary" />
                        <span>Custom Provider Credentials</span>
                      </div>

                      <div className="grid gap-4 sm:grid-cols-2">
                        <div>
                          <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            Provider
                          </label>
                          <select
                            value={telephonyForm.provider}
                            onChange={(e) => setTelephonyForm({ ...telephonyForm, provider: e.target.value })}
                            className="mt-1.5 w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm focus:border-primary focus:outline-none"
                          >
                            <option value="plivo">Plivo (Recommended - High-Speed Realtime Audio)</option>
                            <option value="twilio">Twilio Voice</option>
                          </select>
                        </div>

                        <div>
                          <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            Caller ID Phone Number
                          </label>
                          <input
                            type="text"
                            placeholder="+91 80 1234 5678 or +1 415 555 0199"
                            value={telephonyForm.phone_number}
                            onChange={(e) => setTelephonyForm({ ...telephonyForm, phone_number: e.target.value })}
                            className="mt-1.5 w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm focus:border-primary focus:outline-none"
                          />
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            Must be an active number purchased or verified in your provider account with E.164 format.
                          </p>
                        </div>
                      </div>

                      <div className="grid gap-4 sm:grid-cols-2">
                        <div>
                          <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            {telephonyForm.provider === 'plivo' ? 'Plivo Auth ID' : 'Twilio Account SID'}
                          </label>
                          <input
                            type="text"
                            placeholder={telephonyForm.provider === 'plivo' ? 'e.g. MAMZ...' : 'e.g. AC...'}
                            value={telephonyForm.account_sid}
                            onChange={(e) => setTelephonyForm({ ...telephonyForm, account_sid: e.target.value })}
                            className="mt-1.5 w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-mono focus:border-primary focus:outline-none"
                          />
                        </div>

                        <div>
                          <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            {telephonyForm.provider === 'plivo' ? 'Plivo Auth Token' : 'Twilio Auth Token'}
                            {telephonyForm.has_auth_token && (
                              <span className="ml-2 font-normal text-emerald-500 lowercase">(configured)</span>
                            )}
                          </label>
                          <div className="relative mt-1.5">
                            <input
                              type={showAuthToken ? 'text' : 'password'}
                              placeholder={
                                telephonyForm.has_auth_token ? '•••••••••••••••• (leave blank to keep unchanged)' : 'Enter token'
                              }
                              value={telephonyForm.auth_token}
                              onChange={(e) => setTelephonyForm({ ...telephonyForm, auth_token: e.target.value })}
                              className="w-full rounded-xl border border-border bg-background pl-4 pr-10 py-2.5 text-sm font-mono focus:border-primary focus:outline-none"
                            />
                            <button
                              type="button"
                              onClick={() => setShowAuthToken(!showAuthToken)}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                            >
                              {showAuthToken ? <EyeOff size={16} /> : <Eye size={16} />}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Save Button */}
                  <div className="flex justify-end pt-2">
                    <button
                      type="submit"
                      disabled={telephonySaving}
                      className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm hover:opacity-90 disabled:opacity-50"
                    >
                      <Save size={16} />
                      {telephonySaving ? 'Saving...' : 'Save Telephony Settings'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}

          {/* EMAIL & SENDER TAB */}
          {activeTab === 'email' && (
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="border-b border-border px-6 py-5 bg-muted/30 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold">Email & Sender Options</h2>
                  <p className="text-sm text-muted-foreground">
                    Customize the email sender name, reply-to address, and personal SMTP server for your candidate emails.
                  </p>
                </div>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
                  <Mail size={13} /> Company Branding
                </span>
              </div>

              {emailLoading ? (
                <div className="p-12 text-center text-sm text-muted-foreground">
                  Loading email configuration...
                </div>
              ) : (
                <form onSubmit={handleSaveEmail} className="p-6 space-y-6">
                  {emailMessage && (
                    <div
                      className={`flex items-center gap-2 rounded-xl p-3.5 text-sm ${emailMessage.type === 'success'
                        ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                        : 'bg-destructive/15 text-destructive'
                        }`}
                    >
                      {emailMessage.type === 'success' ? (
                        <CheckCircle2 size={16} />
                      ) : (
                        <AlertCircle size={16} />
                      )}
                      <span>{emailMessage.text}</span>
                    </div>
                  )}

                  {/* Sender Identity */}
                  <div className="space-y-4">
                    <h3 className="text-sm font-bold text-foreground">Sender Identity</h3>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          Sender Display Name
                        </label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. Acme Hiring Team"
                          value={emailForm.sender_name}
                          onChange={(e) => setEmailForm({ ...emailForm, sender_name: e.target.value })}
                          className="mt-1.5 w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm focus:border-primary focus:outline-none"
                        />
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          Displayed as the friendly &quot;From&quot; name when candidates receive shortlist &amp; interview notifications.
                        </p>
                      </div>

                      <div>
                        <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          Reply-To Email Address
                        </label>
                        <input
                          type="email"
                          required
                          placeholder="careers@acme.com"
                          value={emailForm.reply_to}
                          onChange={(e) => setEmailForm({ ...emailForm, reply_to: e.target.value })}
                          className="mt-1.5 w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm focus:border-primary focus:outline-none"
                        />
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          Where candidate replies will be delivered when they reply to automated notification emails.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* SMTP Server Option */}
                  <div className="space-y-4 border-t border-border pt-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-sm font-bold text-foreground">Custom SMTP Mail Server</h3>
                        <p className="text-xs text-muted-foreground">
                          Send outbound candidate emails directly through your company&apos;s own Google Workspace, Office 365, or SendGrid mail server.
                        </p>
                      </div>
                      <label className="relative inline-flex cursor-pointer items-center">
                        <input
                          type="checkbox"
                          checked={emailForm.custom_smtp}
                          onChange={(e) => setEmailForm({ ...emailForm, custom_smtp: e.target.checked })}
                          className="peer sr-only"
                        />
                        <div className="h-6 w-11 rounded-full bg-muted peer-checked:bg-primary peer-focus:outline-none after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all after:content-[''] peer-checked:after:translate-x-full"></div>
                      </label>
                    </div>

                    {emailForm.custom_smtp && (
                      <div className="space-y-4 rounded-xl border border-border bg-muted/20 p-5">
                        <div className="grid gap-4 sm:grid-cols-3">
                          <div className="sm:col-span-2">
                            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                              SMTP Host
                            </label>
                            <input
                              type="text"
                              placeholder="smtp.gmail.com or smtp.sendgrid.net"
                              value={emailForm.smtp_host}
                              onChange={(e) => setEmailForm({ ...emailForm, smtp_host: e.target.value })}
                              className="mt-1.5 w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-mono focus:border-primary focus:outline-none"
                            />
                          </div>

                          <div>
                            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                              SMTP Port
                            </label>
                            <input
                              type="number"
                              placeholder="587"
                              value={emailForm.smtp_port}
                              onChange={(e) => setEmailForm({ ...emailForm, smtp_port: Number(e.target.value) || 587 })}
                              className="mt-1.5 w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-mono focus:border-primary focus:outline-none"
                            />
                          </div>
                        </div>

                        <div className="grid gap-4 sm:grid-cols-2">
                          <div>
                            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                              SMTP Username / Sender Email
                            </label>
                            <input
                              type="text"
                              placeholder="recruiting@yourdomain.com"
                              value={emailForm.smtp_user}
                              onChange={(e) => setEmailForm({ ...emailForm, smtp_user: e.target.value })}
                              className="mt-1.5 w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm focus:border-primary focus:outline-none"
                            />
                          </div>

                          <div>
                            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                              SMTP Password / App Password
                              {emailForm.has_smtp_password && (
                                <span className="ml-2 font-normal text-emerald-500 lowercase">(configured)</span>
                              )}
                            </label>
                            <div className="relative mt-1.5">
                              <input
                                type={showSmtpPassword ? 'text' : 'password'}
                                placeholder={
                                  emailForm.has_smtp_password
                                    ? '•••••••••••••••• (leave blank to keep unchanged)'
                                    : 'Enter password'
                                }
                                value={emailForm.smtp_password}
                                onChange={(e) => setEmailForm({ ...emailForm, smtp_password: e.target.value })}
                                className="w-full rounded-xl border border-border bg-background pl-4 pr-10 py-2.5 text-sm font-mono focus:border-primary focus:outline-none"
                              />
                              <button
                                type="button"
                                onClick={() => setShowSmtpPassword(!showSmtpPassword)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                              >
                                {showSmtpPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                              </button>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 pt-1">
                          <input
                            type="checkbox"
                            id="smtp_tls"
                            checked={emailForm.smtp_use_tls}
                            onChange={(e) => setEmailForm({ ...emailForm, smtp_use_tls: e.target.checked })}
                            className="rounded border-border text-primary focus:ring-primary"
                          />
                          <label htmlFor="smtp_tls" className="text-xs font-medium text-foreground cursor-pointer">
                            Enable TLS encryption (recommended for port 587)
                          </label>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Save & Test Buttons */}
                  <div className="flex items-center justify-between pt-2">
                    {emailForm.custom_smtp ? (
                      <button
                        type="button"
                        disabled={emailTesting || emailSaving || (!emailForm.has_smtp_password && !emailForm.smtp_password)}
                        onClick={handleTestEmail}
                        className="inline-flex items-center gap-2 rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-semibold hover:bg-muted disabled:opacity-40"
                      >
                        <Send size={15} />
                        {emailTesting ? 'Sending test email...' : 'Test SMTP Connection'}
                      </button>
                    ) : <div />}

                    <button
                      type="submit"
                      disabled={emailSaving}
                      className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm hover:opacity-90 disabled:opacity-50"
                    >
                      <Save size={16} />
                      {emailSaving ? 'Saving...' : 'Save Email Settings'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}

          {/* SECURITY TAB */}
          {activeTab === 'security' && (
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="border-b border-border px-6 py-5 bg-muted/30">
                <h2 className="text-lg font-bold">Security</h2>
                <p className="text-sm text-muted-foreground">Manage your password and security preferences.</p>
              </div>
              <div className="p-6 space-y-6">
                <div className="flex items-center justify-between border-b border-border pb-6">
                  <div>
                    <h3 className="font-semibold flex items-center gap-2">
                      <Key size={16} /> Password
                    </h3>
                    <p className="text-xs text-muted-foreground mt-1">
                      Keep your account safe by using a strong password.
                    </p>
                  </div>
                  <button
                    disabled
                    className="rounded-xl border border-border bg-background px-4 py-2 text-sm font-semibold opacity-60 cursor-not-allowed"
                  >
                    Reset via Email
                  </button>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold flex items-center gap-2">
                      <Bell size={16} /> Session &amp; Multi-Factor
                    </h3>
                    <p className="text-xs text-muted-foreground mt-1">
                      JWT-based token authentication with company-level scoping.
                    </p>
                  </div>
                  <span className="rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                    Active
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
