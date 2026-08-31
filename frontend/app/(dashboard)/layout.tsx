'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import {
  BarChart3,
  ChevronDown,
  Menu,
  X,
  UsersRound,
  FileText,
  Bot,
  Phone,
  Briefcase,
  Settings
} from 'lucide-react';

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: BarChart3 },
  { name: 'Jobs', href: '/jobs', icon: Briefcase },
  { name: 'Candidates', href: '/candidates', icon: UsersRound },
  { name: 'Resume Database', href: '/resumes', icon: FileText },
  { name: 'AI Recruiter', href: '/ai-recruiter', icon: Bot },
  { name: 'Calling Campaigns', href: '/campaigns', icon: Phone },
  { name: 'Analytics', href: '/analytics', icon: BarChart3 },
  { name: 'Settings', href: '/settings', icon: Settings },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();
  const { user, logout } = useAuth();

  const [dropdownOpen, setDropdownOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar */}
      <aside className={`${menuOpen ? 'flex' : 'hidden'} fixed inset-y-0 left-0 z-40 w-64 flex-col border-r border-border bg-card shadow-xl lg:static lg:flex lg:shadow-none`}>
        <div className="flex h-20 items-center justify-between border-b border-border px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-xl font-bold text-primary">✣</div>
            <span className="text-lg font-bold tracking-tight">Hireonomous</span>
          </div>
          <button onClick={() => setMenuOpen(false)} className="rounded-lg p-2 text-muted-foreground hover:bg-muted lg:hidden" aria-label="Close navigation">
            <X size={18}/>
          </button>
        </div>
        <nav className="flex-1 space-y-1 px-3 py-7 overflow-y-auto" aria-label="Main navigation">
          {navigation.map((item) => {
            const isActive = pathname.startsWith(item.href);
            return (
              <Link key={item.name} href={item.href} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-bold transition-colors ${isActive ? 'bg-accent text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}>
                <item.icon size={17} strokeWidth={2.5} />
                <span>{item.name}</span>
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-border p-5">
          <div className="flex items-center gap-3 relative">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 font-bold text-blue-600">
              {user?.name?.charAt(0).toUpperCase() || 'U'}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{user?.name || 'User'}</p>
              <p className="truncate text-xs text-muted-foreground">{user?.email || 'user@example.com'}</p>
            </div>
            <button onClick={() => setDropdownOpen(!dropdownOpen)}>
               <ChevronDown className="ml-auto text-muted-foreground hover:text-foreground cursor-pointer" size={16}/>
            </button>
            
            {dropdownOpen && (
              <div className="absolute bottom-12 right-0 w-48 rounded-md border border-border bg-card p-1 shadow-lg">
                <button onClick={logout} className="w-full rounded-md px-3 py-2 text-left text-sm text-destructive hover:bg-muted">
                  Log out
                </button>
              </div>
            )}
          </div>
        </div>
      </aside>
      
      {menuOpen && <button onClick={() => setMenuOpen(false)} className="fixed inset-0 z-30 bg-foreground/20 lg:hidden" aria-label="Close navigation overlay"/>}

      <div className="min-w-0 flex-1 flex flex-col">
        {/* Header */}
        <header className="sticky top-0 z-20 flex h-20 items-center justify-between border-b border-border bg-card/95 px-5 backdrop-blur lg:px-10">
          <button onClick={() => setMenuOpen(true)} className="rounded-lg border border-border p-2 text-muted-foreground hover:bg-muted lg:hidden" aria-label="Open navigation">
            <Menu size={20}/>
          </button>
          <div className="hidden lg:block"/>
          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-semibold">{user?.name || 'User'}</p>
              <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">{user?.organization_name || 'Admin'}</p>
            </div>
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted font-bold text-muted-foreground">
               {user?.name?.charAt(0).toUpperCase() || 'U'}
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
