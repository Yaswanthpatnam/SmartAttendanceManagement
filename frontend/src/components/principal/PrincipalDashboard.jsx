/**
 * SMART ATTENDANCE MANAGEMENT SYSTEM - PRINCIPAL EXECUTIVE DASHBOARD
 * 
 * Top-level institutional executive cockpit providing:
 * 1. College-Wide Macro KPIs: Total student enrollment, faculty count, daily lecture execution rates, and attendance percentages.
 * 2. Cross-Departmental Benchmarking: Side-by-side comparative ranking of all 6 academic departments.
 * 3. Faculty Biometric Presence: Real-time telemetry monitoring campus arrival (present, late, absent, pending).
 * 4. Institutional Low Attendance Register: Real-time exception tracker flagging any student below institutional threshold.
 * 5. Immutable Attendance Corrections Audit Ledger: Transparent chronological feed of all status alterations made by faculty.
 */

import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import StatCard from '../common/StatCard';
import StatusBadge from '../common/StatusBadge';
import { 
  Building2, Users, GraduationCap, Clock, AlertTriangle, 
  FileSpreadsheet, CheckCircle2, TrendingUp, Search, Calendar,
  BarChart3, ShieldAlert, ArrowUpRight, Activity
} from 'lucide-react';

export default function PrincipalDashboard() {
  // Navigation tab state tracker
  const [activeTab, setActiveTab] = useState('overview');
  // Telemetry fetching state flag
  const [loading, setLoading] = useState(true);
  
  // Executive macro metric analytics payload
  const [macroData, setMacroData] = useState(null);
  // Comprehensive list of students falling below attendance threshold
  const [lowAttendanceList, setLowAttendanceList] = useState([]);
  // Chronological log of faculty-initiated attendance modifications
  const [correctionsList, setCorrectionsList] = useState([]);
  
  // Real-time search filter query for low attendance register
  const [searchQuery, setSearchQuery] = useState('');

  /**
   * Mount hook: dispatches initial data synchronization.
   */
  useEffect(() => {
    loadData();
  }, []);

  /**
   * Fetches institutional telemetry in parallel to maximize responsiveness.
   */
  const loadData = async () => {
    setLoading(true);
    try {
      const [overviewRes, lowRes, corrRes] = await Promise.all([
        api.analytics.getCollegeOverview(),
        api.analytics.getLowAttendance(),
        api.attendance.getCorrectionsLog()
      ]);
      setMacroData(overviewRes.data);
      setLowAttendanceList(lowRes.data);
      // Normalize DRF paginated vs unpaginated response
      setCorrectionsList(corrRes.data.results || corrRes.data);
    } catch (err) {
      console.error('Failed to load principal executive analytics:', err);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Fallback loading spinner view while remote analytics compile.
   */
  if (loading || !macroData) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-8">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 border-3 border-[#376A7B] border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm font-semibold text-slate-600">Loading College Analytics...</p>
        </div>
      </div>
    );
  }

  /**
   * Filtered student exception records based on active search keyword.
   * Matches across institutional ID, student name, and department code.
   */
  const filteredLowStudents = lowAttendanceList.filter(s => {
    const query = searchQuery.toLowerCase();
    return (
      s.student_id.toLowerCase().includes(query) ||
      s.student_name.toLowerCase().includes(query) ||
      s.department_code.toLowerCase().includes(query)
    );
  });

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Principal Sidebar Navigation */}
      <aside className="w-64 bg-[#2F4858] text-white flex flex-col shrink-0 min-h-screen border-r border-[#376A7B]">
        <div className="p-5 border-b border-[#376A7B]">
          <span className="text-xs uppercase font-bold text-[#AAFFC7] tracking-wider block">Principal's Office</span>
          <span className="text-sm font-semibold text-white">Institutional Oversight</span>
        </div>

        <nav className="flex-1 p-3 space-y-1 text-sm font-medium">
          {/* Iterate over principal dashboard navigation items */}
          {[
            { id: 'overview', label: 'College-Wide KPIs', icon: BarChart3 },
            { id: 'departments', label: 'Department Rankings', icon: Building2 },
            { id: 'faculty', label: 'Faculty Biometrics', icon: Users },
            { id: 'low-attendance', label: 'Low Attendance Register', icon: AlertTriangle },
            { id: 'corrections', label: 'Audit & Corrections Feed', icon: Activity },
          ].map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-left transition-colors cursor-pointer ${
                  active
                    ? 'bg-[#376A7B] text-white font-semibold shadow-xs'
                    : 'text-slate-300 hover:bg-[#376A7B]/40 hover:text-white'
                }`}
              >
                <Icon className={`w-4 h-4 ${active ? 'text-[#AAFFC7]' : 'text-[#78DABE]'}`} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </aside>

      {/* Main Content Workspace */}
      <main className="flex-1 p-8 overflow-y-auto">
        
        {/* TAB 1: COLLEGE-WIDE KPIS */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Executive Institutional Dashboard</h2>
                <p className="text-sm text-slate-500">Apex Institute of Technology & Engineering • Real-time Monitoring</p>
              </div>
              <button 
                onClick={loadData}
                className="inline-flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 text-xs font-semibold text-slate-700 rounded-lg shadow-xs hover:bg-slate-50 cursor-pointer"
              >
                <span>Refresh Live Telemetry</span>
              </button>
            </div>

            {/* Macro KPI Scorecards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              <StatCard
                title="Total Enrolled Students"
                value={macroData.total_students.toLocaleString()}
                subtitle="Across 6 Academic Departments"
                icon={GraduationCap}
                color="brand"
              />
              <StatCard
                title="Total Teaching Faculty"
                value={macroData.total_faculty}
                subtitle={`${macroData.faculty_attendance_today.present} punched present today`}
                icon={Users}
                color="teal"
              />
              <StatCard
                title="Today's Student Attendance"
                value={`${macroData.today_attendance_percentage}%`}
                subtitle={`${macroData.taken_today_sessions} of ${macroData.total_today_sessions} sessions taken`}
                icon={Clock}
                color={macroData.today_attendance_percentage >= 75 ? 'green' : 'amber'}
              />
              <StatCard
                title="Low Attendance Warnings"
                value={lowAttendanceList.length}
                subtitle={`Students below ${macroData.threshold}% threshold`}
                icon={AlertTriangle}
                color="red"
              />
            </div>

            {/* Department Summary Comparison Table */}
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs">
              <h3 className="text-base font-bold text-slate-900 mb-4 flex items-center gap-2">
                <Building2 className="w-5 h-5 text-[#3F8F99]" />
                <span>Department Attendance Comparison</span>
              </h3>

              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-[#2F4858] text-white">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold">Department Code</th>
                      <th className="px-4 py-3 text-left font-semibold">Department Name</th>
                      <th className="px-4 py-3 text-left font-semibold">Students</th>
                      <th className="px-4 py-3 text-left font-semibold">Faculty</th>
                      <th className="px-4 py-3 text-left font-semibold">Attendance Performance</th>
                      <th className="px-4 py-3 text-left font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {/* Iterate over all departmental aggregates */}
                    {macroData.departments.map(d => (
                      <tr key={d.department_id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-mono font-bold text-[#376A7B]">{d.department_code}</td>
                        <td className="px-4 py-3 font-medium text-slate-900">{d.department_name}</td>
                        <td className="px-4 py-3 text-slate-700 font-semibold">{d.student_count}</td>
                        <td className="px-4 py-3 text-slate-700 font-semibold">{d.faculty_count}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-28 bg-slate-200 rounded-full h-2">
                              <div
                                className={`h-2 rounded-full ${d.attendance_percentage >= 75 ? 'bg-[#53B4AF]' : 'bg-amber-500'}`}
                                style={{ width: `${Math.min(100, d.attendance_percentage)}%` }}
                              />
                            </div>
                            <span className="font-bold font-mono text-xs">{d.attendance_percentage}%</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {/* Compliance status badge: healthy vs requiring intervention */}
                          {d.attendance_percentage >= 75 ? (
                            <span className="px-2 py-0.5 rounded text-xs font-semibold bg-[#AAFFC7]/50 text-[#2F4858] border border-[#78DABE]">
                              Healthy
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                              Requires Oversight
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: DEPARTMENT RANKINGS */}
        {activeTab === 'departments' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Department Rankings & Compliance</h2>
              <p className="text-sm text-slate-500">Benchmark attendance adherence across all faculties</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {/* Sort departments descending by attendance percentage to calculate institutional rankings */}
              {macroData.departments
                .slice()
                .sort((a, b) => b.attendance_percentage - a.attendance_percentage)
                .map((dept, index) => (
                  <div key={dept.department_id} className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-[#2F4858] text-white flex items-center justify-center font-bold text-xs">
                          #{index + 1}
                        </span>
                        <h3 className="font-bold text-base text-[#2F4858]">{dept.department_code}</h3>
                      </div>
                      <span className="text-lg font-bold font-mono text-[#376A7B]">{dept.attendance_percentage}%</span>
                    </div>

                    <p className="text-xs text-slate-500 mt-1 mb-4">{dept.department_name}</p>

                    <div className="w-full bg-slate-100 rounded-full h-2 mb-3">
                      <div 
                        className="bg-gradient-to-r from-[#78DABE] to-[#376A7B] h-2 rounded-full"
                        style={{ width: `${Math.min(100, dept.attendance_percentage)}%` }}
                      />
                    </div>

                    <div className="text-xs text-slate-600 flex justify-between border-t border-slate-100 pt-3">
                      <span>Total Cohort: <strong>{dept.student_count}</strong></span>
                      <span>Faculty: <strong>{dept.faculty_count}</strong></span>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* TAB 3: FACULTY BIOMETRICS MONITORING */}
        {activeTab === 'faculty' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Faculty Biometric Presence Today</h2>
              <p className="text-sm text-slate-500">Campus entry events and arrival telemetry</p>
            </div>

            {/* Presence breakdown grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-xs">
                <p className="text-xs font-semibold text-slate-500 uppercase">Present on Campus</p>
                <p className="text-2xl font-bold text-[#2F4858] mt-1">{macroData.faculty_attendance_today.present}</p>
              </div>
              <div className="p-4 bg-amber-50 rounded-xl border border-amber-200 shadow-xs">
                <p className="text-xs font-semibold text-amber-800 uppercase">Late Arrivals</p>
                <p className="text-2xl font-bold text-amber-700 mt-1">{macroData.faculty_attendance_today.late}</p>
              </div>
              <div className="p-4 bg-red-50 rounded-xl border border-red-200 shadow-xs">
                <p className="text-xs font-semibold text-red-800 uppercase">Absent from Campus</p>
                <p className="text-2xl font-bold text-red-700 mt-1">{macroData.faculty_attendance_today.absent}</p>
              </div>
              <div className="p-4 bg-slate-100 rounded-xl border border-slate-300 shadow-xs">
                <p className="text-xs font-semibold text-slate-600 uppercase">Pending / Not Logged</p>
                <p className="text-2xl font-bold text-slate-700 mt-1">{macroData.faculty_attendance_today.not_logged}</p>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: LOW ATTENDANCE REGISTER */}
        {activeTab === 'low-attendance' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Low Attendance Exceptions</h2>
                <p className="text-sm text-slate-500">
                  College-wide register of students falling below the {macroData.threshold}% institutional minimum
                </p>
              </div>

              {/* Keyword search input */}
              <div className="w-full sm:w-72 relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="text"
                  placeholder="Filter by ID, name, department..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                />
              </div>
            </div>

            {/* Exception Table */}
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-[#2F4858] text-white">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold">Student ID</th>
                    <th className="px-4 py-3 text-left font-semibold">Student Name</th>
                    <th className="px-4 py-3 text-left font-semibold">Department</th>
                    <th className="px-4 py-3 text-left font-semibold">Section</th>
                    <th className="px-4 py-3 text-left font-semibold">Attended / Total</th>
                    <th className="px-4 py-3 text-left font-semibold">Percentage</th>
                    <th className="px-4 py-3 text-left font-semibold">Contact Email</th>
                    <th className="px-4 py-3 text-left font-semibold">Guardian Phone</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {/* Empty state when no students are deficient */}
                  {filteredLowStudents.length === 0 ? (
                    <tr>
                      <td colSpan="8" className="px-6 py-8 text-center text-slate-500 text-sm">
                        No students currently fall below the {macroData.threshold}% threshold.
                      </td>
                    </tr>
                  ) : (
                    /* Render deficient student rows */
                    filteredLowStudents.map(s => (
                      <tr key={s.student_profile_id} className="hover:bg-red-50/40">
                        <td className="px-4 py-3 font-mono font-bold text-red-700">{s.student_id}</td>
                        <td className="px-4 py-3 font-medium text-slate-900">{s.student_name}</td>
                        <td className="px-4 py-3 font-semibold text-slate-700">{s.department_code}</td>
                        <td className="px-4 py-3 text-slate-600">{s.section_name}</td>
                        <td className="px-4 py-3 font-mono text-xs">{s.present_classes} / {s.total_classes}</td>
                        <td className="px-4 py-3">
                          <span className="px-2 py-0.5 rounded text-xs font-bold bg-red-100 text-red-800 border border-red-200">
                            {s.attendance_percentage}%
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500 font-mono">{s.email}</td>
                        <td className="px-4 py-3 text-xs text-slate-600 font-mono">{s.phone}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 5: AUDIT & CORRECTIONS FEED */}
        {activeTab === 'corrections' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Institutional Attendance Corrections Audit</h2>
              <p className="text-sm text-slate-500">Immutable ledger of all attendance modifications made by faculty</p>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-[#2F4858] text-white">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold">Timestamp</th>
                    <th className="px-4 py-3 text-left font-semibold">Student ID</th>
                    <th className="px-4 py-3 text-left font-semibold">Student Name</th>
                    <th className="px-4 py-3 text-left font-semibold">Subject</th>
                    <th className="px-4 py-3 text-left font-semibold">Modification</th>
                    <th className="px-4 py-3 text-left font-semibold">Justification Reason</th>
                    <th className="px-4 py-3 text-left font-semibold">Corrected By</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {/* Empty state if no modifications recorded */}
                  {correctionsList.length === 0 ? (
                    <tr>
                      <td colSpan="7" className="px-6 py-8 text-center text-slate-500 text-sm">
                        No attendance corrections recorded.
                      </td>
                    </tr>
                  ) : (
                    /* Render audited modification event rows */
                    correctionsList.map(c => (
                      <tr key={c.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 text-xs text-slate-500 font-mono">
                          {new Date(c.timestamp).toLocaleString()}
                        </td>
                        <td className="px-4 py-3 font-mono font-semibold text-[#376A7B]">{c.student_id}</td>
                        <td className="px-4 py-3 font-medium text-slate-900">{c.student_name}</td>
                        <td className="px-4 py-3 font-mono text-xs">{c.subject_code} ({c.section_name})</td>
                        <td className="px-4 py-3 text-xs font-semibold">
                          <span className="text-red-600 line-through">{c.original_status}</span> →{' '}
                          <span className="text-emerald-700 font-bold">{c.new_status}</span>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-700 italic max-w-xs">{c.reason}</td>
                        <td className="px-4 py-3 text-xs text-slate-600 font-medium">{c.corrected_by_name}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}
