/**
 * Main Application Root Component
 * ================================
 * Routes between unauthenticated Landing / Login view and role-specific operational dashboards:
 * - ADMIN: Central Institutional Administration & Bulk Onboarding
 * - PRINCIPAL: Executive College-wide Macro KPI Analytics
 * - VICE_PRINCIPAL: Institutional Academic Oversight
 * - HOD: Departmental Attendance, Faculty Biometrics, Section Deep-Dives
 * - FACULTY: Session Attendance Taking, Timetable Rosters, Counsellor Reports
 * - STUDENT: Self-service Attendance Breakdown, Subject Breakdown, Monthly Calendars
 */

import React from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import LandingPage from './components/landing/LandingPage';
import Navbar from './components/common/Navbar';
import AdminDashboard from './components/admin/AdminDashboard';
import PrincipalDashboard from './components/principal/PrincipalDashboard';
import VPDashboard from './components/vp/VPDashboard';
import HODDashboard from './components/hod/HODDashboard';
import FacultyDashboard from './components/faculty/FacultyDashboard';
import StudentDashboard from './components/student/StudentDashboard';

/**
 * Internal router that renders based on current authentication and role state.
 */
function AppContent() {
  const { user, loading, isAuthenticated } = useAuth();

  // Display initial loading spinner while validating cached JWT credentials
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-3 border-[#376A7B] border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm font-semibold text-slate-600">Initializing Institutional System...</p>
        </div>
      </div>
    );
  }

  // If user is unauthenticated, present the institutional landing and login portal
  if (!isAuthenticated || !user) {
    return <LandingPage />;
  }

  // Render navigation bar and route to the appropriate dashboard according to user role
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      {/* Persistent institutional navigation bar */}
      <Navbar />
      
      {/* Dynamic role dashboard container */}
      <div className="flex-1">
        {user.role === 'ADMIN' && <AdminDashboard />}
        {user.role === 'PRINCIPAL' && <PrincipalDashboard />}
        {user.role === 'VICE_PRINCIPAL' && <VPDashboard />}
        {user.role === 'HOD' && <HODDashboard />}
        {user.role === 'FACULTY' && <FacultyDashboard />}
        {user.role === 'STUDENT' && <StudentDashboard />}
      </div>
    </div>
  );
}

/**
 * Top-level application wrapper binding the global AuthProvider context.
 */
export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
