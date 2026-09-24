/**
 * Status and Role Badge Component
 * ===============================
 * Renders color-coded pill indicators for user roles (ADMIN, HOD, FACULTY, STUDENT, etc.)
 * and operational attendance states (PRESENT, ABSENT, LATE, EXCUSED, PENDING, COMPLETED).
 */

import React from 'react';

export default function StatusBadge({ status, type = 'status' }) {
  // Normalize status string for case-insensitive matching
  const normalizedValue = String(status || '').toUpperCase();

  // Handle user organizational roles
  if (type === 'role') {
    const roleThemeClasses = {
      ADMIN: 'bg-slate-100 text-slate-800 border-slate-300',
      PRINCIPAL: 'bg-purple-50 text-purple-800 border-purple-200',
      VICE_PRINCIPAL: 'bg-indigo-50 text-indigo-800 border-indigo-200',
      HOD: 'bg-blue-50 text-blue-800 border-blue-200',
      FACULTY: 'bg-teal-50 text-teal-800 border-teal-200',
      STUDENT: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    };

    const assignedStyle = roleThemeClasses[normalizedValue] || 'bg-gray-100 text-gray-800';

    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${assignedStyle}`}>
        {status}
      </span>
    );
  }

  // Handle attendance state: PRESENT
  if (normalizedValue === 'PRESENT') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#AAFFC7]/60 text-[#2F4858] border border-[#78DABE]">
        <span className="w-1.5 h-1.5 rounded-full bg-[#3F8F99]"></span>
        Present
      </span>
    );
  }

  // Handle attendance state: ABSENT
  if (normalizedValue === 'ABSENT') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-50 text-red-700 border border-red-200">
        <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>
        Absent
      </span>
    );
  }

  // Handle attendance state: LATE
  if (normalizedValue === 'LATE') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
        Late
      </span>
    );
  }

  // Handle attendance state: EXCUSED
  if (normalizedValue === 'EXCUSED') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
        <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
        Excused
      </span>
    );
  }

  // Handle batch import state: PENDING or PREVIEW_READY
  if (normalizedValue === 'PENDING' || normalizedValue === 'PREVIEW_READY') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
        {status}
      </span>
    );
  }

  // Handle batch import state: COMPLETED
  if (normalizedValue === 'COMPLETED') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#AAFFC7]/60 text-[#2F4858] border border-[#78DABE]">
        <span className="w-1.5 h-1.5 rounded-full bg-[#3F8F99]"></span>
        Completed
      </span>
    );
  }

  // Generic fallback badge
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-800">
      {status}
    </span>
  );
}
