'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { fetchApi } from './api';

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  organization_name?: string;
  organization_id?: string;
}

interface ViewAsOrg {
  id: string;
  name: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (token: string, user: User) => void;
  logout: () => void;
  viewAsOrg: ViewAsOrg | null;
  setViewAsOrg: (org: ViewAsOrg | null) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewAsOrg, setViewAsOrgState] = useState<ViewAsOrg | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('viewAsOrg');
      if (raw) setViewAsOrgState(JSON.parse(raw));
    } catch {}
  }, []);

  const setViewAsOrg = (org: ViewAsOrg | null) => {
    if (org) localStorage.setItem('viewAsOrg', JSON.stringify(org));
    else localStorage.removeItem('viewAsOrg');
    setViewAsOrgState(org);
  };

  useEffect(() => {
    const initAuth = async () => {
      const token = localStorage.getItem('token');
      if (token) {
        try {
          const userData = await fetchApi('/api/auth/me');
          setUser(userData);
        } catch (err) {
          console.error('Failed to restore session:', err);
          localStorage.removeItem('token');
        }
      }
      setLoading(false);
    };

    initAuth();
  }, []);

  const login = (token: string, userData: User) => {
    localStorage.setItem('token', token);
    localStorage.removeItem('viewAsOrg');
    setViewAsOrgState(null);
    setUser(userData);
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('viewAsOrg');
    setUser(null);
    setViewAsOrgState(null);
    window.location.href = '/login';
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, viewAsOrg, setViewAsOrg }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
