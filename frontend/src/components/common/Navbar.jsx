/**
 * Institutional Top Navigation Header
 * ===================================
 * Displays institutional branding, active user identity, department code,
 * role badge, and session termination trigger.
 */

import React from 'react';
import { useAuth } from '../../context/AuthContext';
import StatusBadge from './StatusBadge';
import { LogOut, Building2 } from 'lucide-react';

export default function Navbar() {
  const { user, logout } = useAuth();

  return (
    <header className="bg-[#2F4858] text-white border-b border-[#376A7B] shadow-md sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          
          {/* Institutional Brand and Title */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#78DABE] to-[#3F8F99] flex items-center justify-center shadow-inner">
              <Building2 className="w-6 h-6 text-[#2F4858]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-base sm:text-lg tracking-tight text-white">
                  Smart Attendance Management System
                </span>
                <span className="hidden md:inline-block px-2 py-0.5 rounded text-[10px] uppercase tracking-wider font-semibold bg-[#376A7B] text-[#AAFFC7] border border-[#3F8F99]">
                  Institutional ERP
                </span>
              </div>
              <p className="text-xs text-[#78DABE] hidden sm:block">
                Apex Institute of Technology & Engineering
              </p>
            </div>
          </div>

          {/* User Profile Badge & Logout Action */}
          <div className="flex items-center gap-4">
            {user && (
              <div className="flex items-center gap-3">
                <div className="text-right hidden sm:block">
                  <div className="text-sm font-semibold text-white flex items-center justify-end gap-1.5">
                    <span>{user.first_name} {user.last_name}</span>
                  </div>
                  <div className="text-xs text-[#78DABE] flex items-center justify-end gap-1 font-mono">
                    <span>{user.institutional_id}</span>
                    {/* Render department tag if available in profile metadata */}
                    {user.profile_details?.department_code && (
                      <span className="text-slate-300">({user.profile_details.department_code})</span>
                    )}
                  </div>
                </div>

                {/* Role indicator badge */}
                <StatusBadge status={user.role} type="role" />

                {/* Sign Out Button */}
                <button
                  onClick={logout}
                  title="Sign Out"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-200 bg-[#376A7B] hover:bg-[#3F8F99] hover:text-white transition-colors border border-[#3F8F99]"
                >
                  <LogOut className="w-4 h-4" />
                  <span className="hidden md:inline">Sign Out</span>
                </button>
              </div>
            )}
          </div>

        </div>
      </div>
    </header>
  );
}
