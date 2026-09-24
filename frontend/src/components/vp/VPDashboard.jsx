/**
 * SMART ATTENDANCE MANAGEMENT SYSTEM - VICE PRINCIPAL ACADEMIC OVERSIGHT DASHBOARD
 * 
 * Comprehensive academic monitoring workspace featuring a hierarchical 5-tier drill-down state machine:
 * - Level 1: College Overview - Macro departmental tiles with cohort metrics.
 * - Level 2: Department Roster - Enrolled cohort sections within the chosen department.
 * - Level 3: Section Subjects - Active curriculum subjects assigned to the chosen section.
 * - Level 4: Subject Lecture Sessions - Historical and scheduled class periods for the chosen subject.
 * - Level 5: Granular Session Roster - Individual student presence/absence records for an executed lecture.
 * 
 * Enables immediate administrative deep-dives from institutional macro statistics down to single-student lecture marks.
 */

import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import StatCard from '../common/StatCard';
import StatusBadge from '../common/StatusBadge';
import { 
  Building2, Layers, BookOpen, Clock, AlertTriangle, 
  ChevronRight, Calendar, Users, Eye, ArrowLeft
} from 'lucide-react';

export default function VPDashboard() {
  // Telemetry fetching state flag
  const [loading, setLoading] = useState(true);
  // Academic departments master list
  const [departments, setDepartments] = useState([]);
  // College overview macro metrics
  const [macroData, setMacroData] = useState(null);

  /**
   * Drill-Down State Machine:
   * Level 1: College Overview (Departments list)
   * Level 2: Selected Department (Sections list)
   * Level 3: Selected Section (Subjects list)
   * Level 4: Selected Subject / Section (Classes & Attendance records)
   * Level 5: Granular Class Session Roster (Student-level presence)
   */
  const [drillLevel, setDrillLevel] = useState(1);
  const [selectedDept, setSelectedDept] = useState(null);
  const [selectedSection, setSelectedSection] = useState(null);
  const [selectedSubject, setSelectedSubject] = useState(null);

  // Staged data cache for active drill levels
  const [deptSections, setDeptSections] = useState([]);
  const [sectionSubjects, setSectionSubjects] = useState([]);
  const [classSessions, setClassSessions] = useState([]);
  const [sessionRoster, setSessionRoster] = useState(null);

  /**
   * Mount hook: Loads initial master departments and institutional overview metrics.
   */
  useEffect(() => {
    loadInitialData();
  }, []);

  /**
   * Synchronously loads top-level departments and macro attendance statistics.
   */
  const loadInitialData = async () => {
    setLoading(true);
    try {
      const [dRes, oRes] = await Promise.all([
        api.academic.getDepartments(),
        api.analytics.getCollegeOverview()
      ]);
      setDepartments(dRes.data.results || dRes.data);
      setMacroData(oRes.data);
    } catch (err) {
      console.error('Failed to load initial overview for Vice Principal:', err);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Drill Transition: Level 1 -> Level 2
   * Selects a department and loads its constituent cohort sections.
   */
  const handleSelectDept = async (dept) => {
    setSelectedDept(dept);
    setDrillLevel(2);
    try {
      const res = await api.academic.getSections(dept.id);
      setDeptSections(res.data.results || res.data);
    } catch (err) {
      console.error('Failed to load department sections:', err);
    }
  };

  /**
   * Drill Transition: Level 2 -> Level 3
   * Selects a section and fetches taught curriculum subjects based on department and semester.
   */
  const handleSelectSection = async (sec) => {
    setSelectedSection(sec);
    setDrillLevel(3);
    try {
      const res = await api.academic.getSubjects({ department: selectedDept.id, semester: sec.current_semester });
      setSectionSubjects(res.data.results || res.data);
    } catch (err) {
      console.error('Failed to load section subjects:', err);
    }
  };

  /**
   * Drill Transition: Level 3 -> Level 4
   * Selects a subject and loads recorded and upcoming class sessions.
   */
  const handleSelectSubject = async (subj) => {
    setSelectedSubject(subj);
    setDrillLevel(4);
    try {
      const res = await api.academic.getSessions({ section: selectedSection.id });
      // Filter sessions for this specific subject
      const allSessions = res.data.results || res.data;
      const filtered = allSessions.filter(s => s.subject_code === subj.code);
      setClassSessions(filtered);
    } catch (err) {
      console.error('Failed to load subject class sessions:', err);
    }
  };

  /**
   * Drill Transition: Level 4 -> Level 5
   * Inspects a specific class session to review student-by-student attendance marking.
   */
  const handleInspectSession = async (session) => {
    try {
      const res = await api.attendance.getSessionRoster(session.id);
      setSessionRoster(res.data);
      setDrillLevel(5);
    } catch (err) {
      console.error('Failed to inspect session roster:', err);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-8 space-y-6">
      
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <span className="text-xs uppercase font-bold text-[#376A7B] tracking-wider block">Office of the Vice Principal</span>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Academic Oversight & Multi-Level Drill-Down</h1>
          <p className="text-xs text-slate-500">Drill into any Department → Section → Subject → Attendance Record</p>
        </div>
        <div className="flex items-center gap-2 text-xs font-mono bg-white px-3 py-1.5 rounded-lg border border-slate-200">
          <span className="font-semibold text-slate-700">Drill Depth:</span>
          <span className="text-[#376A7B] font-bold">Level {drillLevel} of 5</span>
        </div>
      </div>

      {/* Interactive Breadcrumb Navigator */}
      <nav className="flex items-center gap-2 text-xs font-semibold text-slate-600 bg-white p-3 rounded-lg border border-slate-200 overflow-x-auto">
        <button
          onClick={() => { 
            setDrillLevel(1); 
            setSelectedDept(null); 
            setSelectedSection(null); 
            setSelectedSubject(null); 
          }}
          className={`hover:text-[#376A7B] flex items-center gap-1 cursor-pointer ${drillLevel === 1 ? 'text-[#376A7B] font-bold' : ''}`}
        >
          <Building2 className="w-3.5 h-3.5" />
          <span>College Overview</span>
        </button>

        {/* Department breadcrumb step */}
        {selectedDept && (
          <>
            <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <button
              onClick={() => { 
                setDrillLevel(2); 
                setSelectedSection(null); 
                setSelectedSubject(null); 
              }}
              className={`hover:text-[#376A7B] cursor-pointer ${drillLevel === 2 ? 'text-[#376A7B] font-bold' : ''}`}
            >
              Dept: {selectedDept.code}
            </button>
          </>
        )}

        {/* Section breadcrumb step */}
        {selectedSection && (
          <>
            <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <button
              onClick={() => { 
                setDrillLevel(3); 
                setSelectedSubject(null); 
              }}
              className={`hover:text-[#376A7B] cursor-pointer ${drillLevel === 3 ? 'text-[#376A7B] font-bold' : ''}`}
            >
              Section: {selectedSection.name}
            </button>
          </>
        )}

        {/* Subject breadcrumb step */}
        {selectedSubject && (
          <>
            <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <button
              onClick={() => setDrillLevel(4)}
              className={`hover:text-[#376A7B] cursor-pointer ${drillLevel === 4 ? 'text-[#376A7B] font-bold' : ''}`}
            >
              Subject: {selectedSubject.code}
            </button>
          </>
        )}

        {/* Session roster breadcrumb step */}
        {drillLevel === 5 && sessionRoster && (
          <>
            <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span className="text-[#376A7B] font-bold">Session Detail ({sessionRoster.session.session_date})</span>
          </>
        )}
      </nav>

      {/* LEVEL 1: COLLEGE DEPARTMENTS OVERVIEW */}
      {drillLevel === 1 && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {/* Map through all college departments */}
            {departments.map(dept => (
              <div 
                key={dept.id}
                onClick={() => handleSelectDept(dept)}
                className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs hover:border-[#376A7B] hover:shadow-md transition-all cursor-pointer group"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <span className="font-bold text-lg text-[#2F4858] group-hover:text-[#376A7B] transition-colors">{dept.code}</span>
                    <p className="text-xs text-slate-600 mt-0.5">{dept.name}</p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-[#376A7B] group-hover:translate-x-1 transition-all" />
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 text-xs text-slate-500 flex justify-between font-medium">
                  <span>Sections: <strong>{dept.total_sections}</strong></span>
                  <span>Students: <strong>{dept.total_students}</strong></span>
                  <span>Faculty: <strong>{dept.total_faculty}</strong></span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* LEVEL 2: SECTIONS IN SELECTED DEPARTMENT */}
      {drillLevel === 2 && selectedDept && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-slate-900">
              Sections in {selectedDept.code} ({selectedDept.name})
            </h3>
            <button 
              onClick={() => setDrillLevel(1)} 
              className="text-xs font-semibold text-[#376A7B] flex items-center gap-1 hover:underline cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back to Departments
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-5">
            {/* Iterate over all sections configured in the department */}
            {deptSections.map(sec => (
              <div 
                key={sec.id}
                onClick={() => handleSelectSection(sec)}
                className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs hover:border-[#376A7B] hover:shadow-md transition-all cursor-pointer group"
              >
                <div className="flex justify-between items-start">
                  <span className="font-bold text-base text-[#2F4858] group-hover:text-[#376A7B]">{sec.name}</span>
                  <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-[#376A7B] group-hover:translate-x-1 transition-all" />
                </div>
                <p className="text-xs text-slate-500 mt-1">Semester {sec.current_semester} • {sec.academic_year_label}</p>
                <p className="text-xs font-semibold text-slate-700 mt-3 pt-2 border-t border-slate-100">
                  {sec.student_count} Enrolled Students
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* LEVEL 3: CURRICULUM SUBJECTS IN SECTION */}
      {drillLevel === 3 && selectedSection && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-slate-900">
              Curriculum Subjects taught in {selectedSection.name}
            </h3>
            <button 
              onClick={() => setDrillLevel(2)} 
              className="text-xs font-semibold text-[#376A7B] flex items-center gap-1 hover:underline cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back to Sections
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-5">
            {/* Render cards for each curriculum subject */}
            {sectionSubjects.map(subj => (
              <div
                key={subj.id}
                onClick={() => handleSelectSubject(subj)}
                className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs hover:border-[#376A7B] hover:shadow-md transition-all cursor-pointer group"
              >
                <div className="flex justify-between items-start">
                  <span className="font-mono font-bold text-sm text-[#376A7B]">{subj.code}</span>
                  <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-[#376A7B] group-hover:translate-x-1 transition-all" />
                </div>
                <h4 className="font-semibold text-sm text-slate-900 mt-1 group-hover:text-[#2F4858]">{subj.name}</h4>
                <div className="mt-3 pt-2 border-t border-slate-100 text-xs text-slate-500 flex justify-between font-medium">
                  <span>Semester {subj.semester}</span>
                  <span>{subj.credits} Credits</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* LEVEL 4: CLASS SESSIONS & ATTENDANCE PERFORMANCE */}
      {drillLevel === 4 && selectedSubject && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-slate-900">
                Class Sessions for {selectedSubject.code} ({selectedSection.name})
              </h3>
              <p className="text-xs text-slate-500">{selectedSubject.name}</p>
            </div>
            <button 
              onClick={() => setDrillLevel(3)} 
              className="text-xs font-semibold text-[#376A7B] flex items-center gap-1 hover:underline cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back to Subjects
            </button>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-[#2F4858] text-white">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">Session Date</th>
                  <th className="px-4 py-3 text-left font-semibold">Time Slot</th>
                  <th className="px-4 py-3 text-left font-semibold">Faculty In Charge</th>
                  <th className="px-4 py-3 text-left font-semibold">Topic Covered</th>
                  <th className="px-4 py-3 text-left font-semibold">Attendance State</th>
                  <th className="px-4 py-3 text-left font-semibold">Present Count</th>
                  <th className="px-4 py-3 text-right font-semibold">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {/* Empty check for sessions */}
                {classSessions.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="px-6 py-8 text-center text-slate-500 text-sm">
                      No scheduled or conducted class sessions logged for this subject yet.
                    </td>
                  </tr>
                ) : (
                  /* Map through scheduled and conducted sessions */
                  classSessions.map(session => (
                    <tr key={session.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-mono font-medium text-slate-800">{session.session_date}</td>
                      <td className="px-4 py-3 text-xs text-slate-600 font-mono">{session.start_time} - {session.end_time}</td>
                      <td className="px-4 py-3 font-medium text-slate-900">{session.faculty_name}</td>
                      <td className="px-4 py-3 text-xs text-slate-700 italic">{session.topic || 'Regular Lecture'}</td>
                      <td className="px-4 py-3">
                        <StatusBadge status={session.is_attendance_taken ? 'COMPLETED' : 'PENDING'} />
                      </td>
                      <td className="px-4 py-3 font-mono font-bold text-xs">
                        {session.is_attendance_taken ? `${session.present_count} / ${session.total_students}` : '—'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {/* Enable roster inspection only if session attendance was taken */}
                        {session.is_attendance_taken && (
                          <button
                            onClick={() => handleInspectSession(session)}
                            className="px-3 py-1 bg-[#376A7B] text-white text-xs font-semibold rounded hover:bg-[#2F4858] cursor-pointer"
                          >
                            Inspect Roster
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* LEVEL 5: CLASS SESSION ATTENDANCE ROSTER */}
      {drillLevel === 5 && sessionRoster && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-slate-900">
                Class Attendance Roster Detail
              </h3>
              <p className="text-xs text-slate-500 font-mono">
                {sessionRoster.session.subject_code} • {sessionRoster.session.section_name} • {sessionRoster.session.session_date}
              </p>
            </div>
            <button 
              onClick={() => setDrillLevel(4)} 
              className="text-xs font-semibold text-[#376A7B] flex items-center gap-1 hover:underline cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back to Class Sessions
            </button>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-[#2F4858] text-white">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">Student ID</th>
                  <th className="px-4 py-3 text-left font-semibold">Full Name</th>
                  <th className="px-4 py-3 text-left font-semibold">Email</th>
                  <th className="px-4 py-3 text-left font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {/* Iterate through individual student presence records */}
                {sessionRoster.roster.map(r => (
                  <tr key={r.student_profile_id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-mono font-bold text-[#376A7B]">{r.student_id}</td>
                    <td className="px-4 py-3 font-medium text-slate-900">{r.student_name}</td>
                    <td className="px-4 py-3 text-xs text-slate-500 font-mono">{r.email}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={r.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </div>
  );
}
