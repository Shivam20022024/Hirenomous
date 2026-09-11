import Link from 'next/link';
import { BrandLogo } from '@/components/brand-logo';

const FOOTER_LINKS = [
  { href: '/pricing', label: 'Pricing' },
  { href: '/terms', label: 'Terms' },
  { href: '/privacy', label: 'Privacy' },
  { href: '/refund-policy', label: 'Refund Policy' },
  { href: '/contact', label: 'Contact' },
];

export function LegalPageLayout({ title, updated, children }: { title: string; updated?: string; children: React.ReactNode }) {
  return (
    <div className="app-surface min-h-screen">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-5">
          <Link href="/login" className="flex items-center gap-2.5">
            <BrandLogo className="h-8 w-8" />
            <span className="text-base font-bold tracking-tight text-foreground">Hireonomous</span>
          </Link>
          <Link href="/login" className="text-sm font-semibold text-primary hover:underline">
            Sign in
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-12">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">{title}</h1>
        {updated && <p className="mt-2 text-sm text-muted-foreground">Last updated: {updated}</p>}
        <div className="prose-legal mt-8 space-y-6 text-sm leading-relaxed text-foreground">
          {children}
        </div>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-4 px-4 py-8 text-xs text-muted-foreground">
          <p>© {new Date().getFullYear()} Novalantis. All rights reserved.</p>
          <nav className="flex flex-wrap gap-4">
            {FOOTER_LINKS.map((l) => (
              <Link key={l.href} href={l.href} className="hover:text-foreground hover:underline">
                {l.label}
              </Link>
            ))}
          </nav>
        </div>
      </footer>
    </div>
  );
}

export function Section({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-lg font-semibold text-foreground">{heading}</h2>
      <div className="mt-2 space-y-3 text-muted-foreground">{children}</div>
    </section>
  );
}
