'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { ThemeToggle } from '@/components/theme-toggle';
import { Loader2, LayoutGrid, Building2, Inbox, LogOut } from 'lucide-react';

const NAV = [
  { name: 'Overview', href: '/superadmin', icon: LayoutGrid },
  { name: 'Companies', href: '/superadmin/companies', icon: Building2 },
  { name: 'Access Requests', href: '/superadmin/requests', icon: Inbox },
];

export default function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace('/login');
    else if (user.role !== 'SUPER_ADMIN') router.replace('/dashboard');
  }, [user, loading, router]);

  if (loading || !user || user.role !== 'SUPER_ADMIN') {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 flex overflow-hidden bg-background">
      <aside className="app-surface hidden w-64 shrink-0 flex-col border-r border-sidebar-border lg:flex">
        <div className="flex h-20 items-center gap-3 border-b border-sidebar-border px-6">
          <div className="brand-mark !h-9 !w-9 shrink-0 text-lg">H</div>
          <div>
            <p className="text-sm font-bold tracking-tight text-sidebar-foreground">Hireonomous</p>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-primary">Super Admin</p>
          </div>
        </div>
        <nav className="flex-1 space-y-1 px-3 py-6">
          {NAV.map((item) => {
            const active = item.href === '/superadmin'
              ? pathname === '/superadmin'
              : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  active
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                <item.icon size={17} /> {item.name}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-sidebar-border p-4">
          <p className="truncate text-sm font-semibold text-sidebar-foreground">{user.name}</p>
          <p className="truncate text-xs text-muted-foreground">{user.email}</p>
          <button
            onClick={logout}
            className="mt-3 flex w-full items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <LogOut size={15} /> Sign out
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 items-center justify-between border-b border-border px-6">
          <nav className="flex gap-1 lg:hidden">
            {NAV.map((item) => (
              <Link key={item.href} href={item.href} className="rounded-lg px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted">
                {item.name}
              </Link>
            ))}
          </nav>
          <span className="hidden text-sm font-semibold text-muted-foreground lg:block">Platform administration</span>
          <ThemeToggle />
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[1200px] px-6 py-8 lg:py-12">{children}</div>
        </main>
      </div>
    </div>
  );
}
