/**
 * Institutional Landing Page & Authentication Gateway
 * ====================================================
 * Serves as the primary public entry point for the Smart Attendance Management System:
 * - Institutional branding and operational scope overview.
 * - JWT authentication form with real-time error feedback.
 * - Quick-fill demonstration profiles for all six institutional roles.
 * - Reference guide for standardized institutional credential policies.
 */

import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { 
  Building2, Shield, Users, Award, BookOpen, Clock, 
  CheckCircle2, ArrowRight, Lock, KeyRound, AlertCircle, Check
} from 'lucide-react';

export default function LandingPage() {
  const { login } = useAuth();

  // Form input state
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Pre-configured test accounts across all institutional hierarchy tiers
  const demoAccounts = [
    { label: 'Administration', id: 'ADM-001', pass: 'Admin@123', role: 'ADMIN', badge: 'System Admin' },
    { label: 'Principal', id: 'PR001', pass: 'Principal@123', role: 'PRINCIPAL', badge: 'College Exec' },
    { label: 'Vice Principal', id: 'VP001', pass: 'VP@123', role: 'VICE_PRINCIPAL', badge: 'Academic VP' },
    { label: 'CSE HOD', id: 'HOD-CSE-001', pass: 'Hod@123', role: 'HOD', badge: 'Dept Head' },
    { label: 'Faculty (Counsellor)', id: 'FAC-CSE-001', pass: 'Faculty@123', role: 'FACULTY', badge: 'CSE-1 Proctor' },
    { label: 'Faculty (Teaching)', id: 'FAC-CSE-005', pass: 'Faculty@123', role: 'FACULTY', badge: 'Lectures Only' },
    { label: 'Student (CSE-1)', id: 'STU-CSE1-0001', pass: 'Student@123', role: 'STUDENT', badge: 'Attendance Roster' },
    { label: 'Student (CSE-3)', id: 'STU-CSE3-0001', pass: 'Student@123', role: 'STUDENT', badge: 'Attendance Roster' },
  ];

  /**
   * Handles credential submission and JWT session establishment.
   */
  const handleLogin = async (event) => {
    // Prevent default browser form submission refresh
    if (event) {
      event.preventDefault();
    }

    // Reset error state and begin loading indicator
    setError('');
    setLoading(true);

    try {
      // Dispatch login through AuthContext
      await login(username, password);
    } catch (apiError) {
      // Capture detailed error response or provide clear fallback message
      const errorMessage = apiError.response?.data?.detail || 'Invalid institutional ID or password. Please verify credentials.';
      setError(errorMessage);
    } finally {
      // Deactivate spinner
      setLoading(false);
    }
  };

  /**
   * Pre-populates login inputs with selected demo account credentials.
   */
  const handleDemoSelect = (account) => {
    setUsername(account.id);
    setPassword(account.pass);
    setError('');
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-between">
      
      {/* Institutional Top Header */}
      <nav className="bg-[#2F4858] text-white border-b border-[#376A7B] px-6 py-4 shadow-sm">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#78DABE] to-[#3F8F99] flex items-center justify-center">
              <Building2 className="w-6 h-6 text-[#2F4858]" />
            </div>
            <div>
              <span className="font-bold text-lg tracking-tight block">Apex Institute of Technology & Engineering</span>
              <span className="text-xs text-[#78DABE] font-medium">Smart Attendance Management Platform</span>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-2 text-xs text-slate-300">
            <Shield className="w-4 h-4 text-[#AAFFC7]" />
            <span>Role-Based Institutional Access Control</span>
          </div>
        </div>
      </nav>

      {/* Main Split Hero & Authentication Portal */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-10 flex flex-col lg:flex-row gap-12 items-center justify-center">
        
        {/* Left Column: Platform Overview & Functional Highlights */}
        <div className="flex-1 space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-[#AAFFC7]/40 text-[#2F4858] border border-[#78DABE]">
            <CheckCircle2 className="w-4 h-4 text-[#3F8F99]" />
            <span>Official Institutional Portal • Academic Year 2026-2027</span>
          </div>

          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-[#2F4858] tracking-tight leading-tight">
            Institutional Attendance & Academic Governance
          </h1>

          <p className="text-base text-slate-600 leading-relaxed max-w-xl">
            A comprehensive institutional platform designed for 5,000+ students and 200+ faculty across departments.
            Automates daily class attendance, detects low-attendance exceptions, tracks biometric punch logs, and provides role-specific dashboards.
          </p>

          {/* Quick Capability Matrix */}
          <div className="grid grid-cols-2 gap-4 pt-2 max-w-lg">
            <div className="p-3 bg-white rounded-lg border border-slate-200/80 shadow-xs">
              <div className="flex items-center gap-2 font-semibold text-xs text-[#2F4858]">
                <Users className="w-4 h-4 text-[#3F8F99]" />
                <span>Role Scoped Security</span>
              </div>
              <p className="text-[11px] text-slate-500 mt-1">Strict departmental and operational data boundaries</p>
            </div>

            <div className="p-3 bg-white rounded-lg border border-slate-200/80 shadow-xs">
              <div className="flex items-center gap-2 font-semibold text-xs text-[#2F4858]">
                <Clock className="w-4 h-4 text-[#53B4AF]" />
                <span>Smart Exception Alerts</span>
              </div>
              <p className="text-[11px] text-slate-500 mt-1">Automated low-attendance & missing class alerts</p>
            </div>

            <div className="p-3 bg-white rounded-lg border border-slate-200/80 shadow-xs">
              <div className="flex items-center gap-2 font-semibold text-xs text-[#2F4858]">
                <BookOpen className="w-4 h-4 text-[#376A7B]" />
                <span>Bulk Onboarding</span>
              </div>
              <p className="text-[11px] text-slate-500 mt-1">2-phase CSV validation with row error diagnostics</p>
            </div>

            <div className="p-3 bg-white rounded-lg border border-slate-200/80 shadow-xs">
              <div className="flex items-center gap-2 font-semibold text-xs text-[#2F4858]">
                <Award className="w-4 h-4 text-[#78DABE]" />
                <span>Auditable Corrections</span>
              </div>
              <p className="text-[11px] text-slate-500 mt-1">Immutable change logs with mandatory justification</p>
            </div>
          </div>
        </div>

        {/* Right Column: Interactive Login Card */}
        <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-200 p-8">
          <div className="mb-6 text-center">
            <div className="w-12 h-12 bg-[#2F4858] text-white rounded-xl flex items-center justify-center mx-auto mb-3 shadow-sm">
              <Lock className="w-6 h-6 text-[#AAFFC7]" />
            </div>
            <h2 className="text-xl font-bold text-slate-900">Institutional Sign In</h2>
            <p className="text-xs text-slate-500 mt-1">Enter your Institutional ID or Username to access your portal</p>
          </div>

          {/* Conditional Error Notification */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2.5 text-xs text-red-700">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-500 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Login Form */}
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Institutional ID / Username
              </label>
              <div className="relative">
                <input
                  type="text"
                  required
                  placeholder="e.g. ADM-001, HOD-CSE-001, PR001"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#376A7B] focus:border-transparent font-mono placeholder:font-sans"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Account Password
              </label>
              <div className="relative">
                <input
                  type="password"
                  required
                  placeholder="••••••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#376A7B] focus:border-transparent"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 py-2.5 px-4 bg-[#376A7B] hover:bg-[#2F4858] text-white font-semibold text-sm rounded-lg shadow-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <span>Sign In to Dashboard</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Quick Demo Credentials Autofill Picker */}
          <div className="mt-6 pt-5 border-t border-slate-100">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                Quick Test Accounts:
              </span>
              <span className="text-[10px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                Uniform Passwords Active
              </span>
            </div>

            <div className="p-2 mb-3 rounded-lg bg-slate-50 border border-slate-200 text-[11px] text-slate-600 space-y-1">
              <div className="font-semibold text-slate-700 flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5 text-[#376A7B]" />
                <span>Uniform Password Standards</span>
              </div>
              <div className="grid grid-cols-2 gap-x-2 text-[10px] text-slate-500 font-mono">
                <span>Faculty: <strong>Faculty@123</strong></span>
                <span>Students: <strong>Student@123</strong></span>
                <span>HODs: <strong>Hod@123</strong></span>
                <span>Admin: <strong>Admin@123</strong></span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {demoAccounts.map((account) => {
                const isSelected = username === account.id;
                return (
                  <button
                    key={account.id}
                    type="button"
                    onClick={() => handleDemoSelect(account)}
                    className={`text-left p-2 rounded-lg border text-xs transition-all cursor-pointer ${
                      isSelected
                        ? 'border-[#376A7B] bg-[#F0FDF8] ring-1 ring-[#376A7B]'
                        : 'border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50'
                    }`}
                  >
                    <div className="font-semibold text-slate-900 flex items-center justify-between">
                      <span className="truncate">{account.label}</span>
                      {isSelected && <Check className="w-3.5 h-3.5 text-[#376A7B] shrink-0" />}
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-slate-500 mt-0.5">
                      <span className="font-mono">{account.id}</span>
                      <span className="text-[9px] px-1 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">{account.badge}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

        </div>

      </main>

      {/* Institutional Footer */}
      <footer className="bg-white border-t border-slate-200 py-4 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>© 2026 Apex Institute of Technology & Engineering. All rights reserved.</span>
          <span className="text-slate-400">PostgreSQL Backend • React REST Client • Role Scoped Architecture</span>
        </div>
      </footer>
    </div>
  );
}
