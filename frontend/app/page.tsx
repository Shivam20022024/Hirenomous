'use client';

import React from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  Play,
  CheckCircle2,
  XCircle,
  Briefcase,
  Upload,
  Search,
  PhoneCall,
  Calendar,
  Zap,
  Shield,
  BarChart3,
  Activity,
  Brain,
  MessageSquare,
  FileSearch,
  Sparkles,
  Users,
  MoreHorizontal,
  ChevronRight
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';

export default function RootPage() {
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-white selection:bg-blue-50 selection:text-blue-900">
      {/* 1. Hero Section */}
      <section className="relative pt-16 pb-8 lg:pt-20 lg:pb-12 overflow-hidden flex flex-col items-center">
        {/* Subtle Background Elements */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full -z-10 pointer-events-none">
          <div className="absolute top-[-10%] left-[25%] w-[600px] h-[600px] bg-blue-50/40 rounded-full blur-[100px]" />
          <div className="absolute top-[10%] right-[15%] w-[500px] h-[500px] bg-indigo-50/30 rounded-full blur-[80px]" />
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative z-10 flex flex-col items-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-50 border border-slate-200 text-slate-500 text-[10px] font-bold uppercase tracking-[0.15em] mb-6 animate-in fade-in duration-700">
            <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
            AI-Powered Recruitment Intelligence
          </div>

          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-slate-900 tracking-tight mb-6 leading-[1.15] animate-in fade-in slide-in-from-bottom-4 duration-1000">
            Hire Smarter with <br className="hidden md:block" />
            <span className="text-blue-600">Autonomous Screening</span>
          </h1>

          <p className="text-base md:text-lg text-slate-500 max-w-xl mx-auto mb-8 leading-relaxed animate-in fade-in slide-in-from-bottom-4 duration-1000 delay-200">
            Automate your entire hiring pipeline—from posting jobs and screening candidates by skills to interview scheduling—reducing manual effort by 99%+.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 animate-in fade-in slide-in-from-bottom-4 duration-1000 delay-400">
            <Link
              href={user ? "/dashboard" : "/login"}
              className="inline-flex items-center justify-center w-full sm:w-auto px-8 py-4 rounded-xl font-semibold shadow-lg transition-all duration-300 hover:-translate-y-0.5 bg-blue-600 hover:bg-blue-700 text-white"
            >
              Get Started
              <ArrowRight size={18} className="ml-2" />
            </Link>
            <a
              href="https://novalantis.com/products/oneclick-hire/"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center w-full sm:w-auto px-8 py-4 rounded-xl border border-slate-200 text-slate-600 font-semibold hover:bg-slate-50 transition-all duration-300"
            >
              <Play size={18} className="mr-2" />
              Watch Demo
            </a>
          </div>
        </div>
      </section>

      {/* 3. Redesigned Workflow Section: Hiring Runs on Autopilot */}
      <section className="py-12 lg:py-16 bg-white overflow-hidden flex flex-col items-center">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col items-center w-full">
          <div className="max-w-3xl mb-16 text-center">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-600 text-[11px] font-bold uppercase tracking-[0.2em] mb-4 animate-in fade-in duration-700">
              <Sparkles size={14} className="animate-pulse" />
              Fully Automated • No Manual Screening
            </div>
            <h2 className="text-4xl md:text-5xl font-bold text-slate-900 mb-6 tracking-tight">
              Your Hiring Runs on <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-purple-600">Autopilot</span>
            </h2>
            <p className="text-slate-500 text-lg md:text-xl leading-relaxed max-w-2xl mx-auto">
              From job creation to interview scheduling, our AI automatically screens, evaluates, and engages candidates—so you don’t have to.
            </p>
          </div>

          <div className="relative w-full">
            {/* Connecting line (Desktop) */}
            <div className="hidden lg:block absolute top-10 left-[10%] right-[10%] h-0.5 bg-slate-100 -translate-y-1/2 z-0" />

            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-8 relative z-10">
              {[
                {
                  icon: <Briefcase />,
                  title: "1. Define Requirements",
                  desc: "Tell us what you're looking for in a candidate",
                  color: "from-blue-500 to-blue-600"
                },
                {
                  icon: <FileSearch />,
                  title: "2. AI Processes Resumes",
                  desc: "Automatically parses and analyzes all incoming resumes",
                  color: "from-blue-600 to-indigo-600",
                  badge: "Processing..."
                },
                {
                  icon: <Brain />,
                  title: "3. AI Evaluates Candidates",
                  desc: "Ranks candidates based on skills, experience, and fit",
                  color: "from-indigo-600 to-purple-600"
                },
                {
                  icon: <MessageSquare />,
                  title: "4. AI Engages Candidates",
                  desc: "AI interacts with candidates and assesses interest",
                  color: "from-purple-600 to-fuchsia-600"
                },
                {
                  icon: <Calendar />,
                  title: "5. AI Schedules Interviews",
                  desc: "Automatically schedules interviews with top candidates",
                  color: "from-fuchsia-600 to-pink-600",
                  success: true
                }
              ].map((step, i) => (
                <div key={i} className="flex flex-col items-center text-center group">
                  <div className={`relative w-20 h-20 rounded-[2rem] bg-white border border-slate-200 shadow-xl shadow-slate-200/50 flex items-center justify-center mb-6 transition-all duration-500 group-hover:-translate-y-2 group-hover:border-transparent group-hover:shadow-2xl group-hover:shadow-indigo-200/50`}>
                    <div className={`absolute inset-0 rounded-[2rem] bg-gradient-to-br ${step.color} opacity-0 group-hover:opacity-10 transition-opacity duration-500`} />
                    <div className={`text-slate-600 transition-colors duration-500 group-hover:text-transparent group-hover:bg-clip-text group-hover:bg-gradient-to-br ${step.color}`}>
                      {React.cloneElement(step.icon as React.ReactElement, { size: 32, strokeWidth: 1.5 })}
                    </div>

                    {step.badge && (
                      <div className="absolute -top-2 -right-2 px-2 py-0.5 rounded-full bg-blue-600 text-white text-[8px] font-black uppercase tracking-tighter animate-pulse shadow-lg">
                        {step.badge}
                      </div>
                    )}

                    {step.success && (
                      <div className="absolute -bottom-2 -right-2 w-8 h-8 rounded-full bg-green-500 text-white flex items-center justify-center shadow-lg border-4 border-white">
                        <CheckCircle2 size={16} />
                      </div>
                    )}
                  </div>

                  <div className="px-4">
                    <h4 className="font-bold text-slate-900 mb-2 text-base leading-tight group-hover:text-blue-600 transition-colors duration-300">
                      {step.title}
                    </h4>
                    <p className="text-slate-500 text-sm leading-relaxed mb-3">
                      {step.desc}
                    </p>
                    {step.success && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-green-600 uppercase tracking-widest bg-green-50 px-2 py-0.5 rounded">
                        Interview Scheduled ✔
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 5. Problem Section */}
      <section className="py-8 lg:py-12 bg-white flex flex-col items-center">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col items-center">
          <div className="text-center mb-10">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">The Challenge</h2>
            <h3 className="text-2xl md:text-3xl font-bold text-slate-900 mb-4 leading-tight">Eliminate Hiring Bottlenecks</h3>
          </div>

          <div className="grid lg:grid-cols-2 gap-10 items-center max-w-5xl">
            <div className="flex flex-col items-center lg:items-start">
              <ul className="space-y-4">
                {[
                  { t: "Manual Screening", d: "Recruiters spend up to 23 hours per job on resume review." },
                  { t: "Slow Turnaround", d: "Top talent often leaves the market in less than 2 weeks." },
                  { t: "Unconscious Bias", d: "Manual reviews are susceptible to inconsistent evaluation." }
                ].map((item, i) => (
                  <li key={i} className="flex flex-col items-center text-center lg:items-start lg:text-left gap-1 lg:gap-4 lg:flex-row">
                    <XCircle size={16} className="text-slate-300 mt-0 flex-shrink-0 lg:mt-1" />
                    <div>
                      <h4 className="font-bold text-slate-900 text-sm mb-0.5">{item.t}</h4>
                      <p className="text-slate-500 text-xs leading-relaxed">{item.d}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            <div className="bg-slate-900 rounded-3xl p-8 text-white shadow-2xl relative overflow-hidden text-center flex flex-col items-center">
              <div className="absolute top-0 right-0 p-6 opacity-10">
                <Shield size={100} />
              </div>
              <h4 className="text-lg font-bold mb-3">Enterprise-Ready</h4>
              <p className="text-slate-400 text-xs leading-relaxed mb-6 max-w-sm">Hireonomous provides the security, compliance, and unbiased evaluation standards required by world-class recruitment teams.</p>

              <div className="grid grid-cols-2 gap-6 pt-5 border-t border-white/10 w-full">
                <div>
                  <div className="text-xl font-bold text-blue-400">85%</div>
                  <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Bias Reduction</div>
                </div>
                <div>
                  <div className="text-xl font-bold text-blue-400">10x</div>
                  <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Speed Increase</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 6. Final CTA Section */}
      <section className="py-12 px-4 bg-slate-50 flex flex-col items-center">
        <div className="max-w-4xl mx-auto text-center flex flex-col items-center">
          <h2 className="text-2xl md:text-3xl font-bold text-slate-900 mb-4">
            Ready to optimize your hiring?
          </h2>
          <p className="text-slate-500 text-sm md:text-base mb-8 max-w-xl mx-auto leading-relaxed">
            Start screening candidates in minutes. Professional automation for the modern recruiter.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href={user ? "/dashboard" : "/login"}
              className="inline-flex items-center justify-center w-full sm:w-auto px-10 py-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-lg shadow-blue-200 transition-all duration-300"
            >
              Get Started
            </Link>
            <a
              href="https://novalantis.com/contact-us/"
              className="inline-flex items-center justify-center w-full sm:w-auto px-10 py-4 rounded-xl border border-slate-200 bg-white text-slate-600 font-bold hover:bg-slate-50 transition-all duration-300"
            >
              Contact Sales
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 border-t border-slate-100 text-center bg-white flex flex-col items-center">
        <div className="flex items-center justify-center gap-2 mb-3">
          <span className="font-bold text-slate-900 text-sm">Hireonomous</span>
        </div>
        <p className="text-slate-400 text-[10px] tracking-widest uppercase font-bold">
          © {new Date().getFullYear()} Hireonomous. AI-Powered Hiring Operations Platform.
        </p>
      </footer>
    </div>
  );
}
