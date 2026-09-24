/**
 * Student Self-Service Attendance Dashboard
 * =========================================
 * Provides an individual student with comprehensive academic transparency:
 * 1. Attendance Standing & Thresholds: Real-time calculated attendance percentage with warnings.
 * 2. Section Counsellor Card: Direct proctor identification and guardian contact references.
 * 3. Total Classes Held: High-level metrics with interactive calendar date query selector.
 * 4. Monthly Attendance Progression: Month-by-month historical breakdown.
 * 5. Subject-Wise Breakdown: Course-level attendance gauges, eligible vs defaulter status.
 * 6. Chronological Daily Activity: Complete period-by-period class history with date/course filters.
 */

import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import StatCard from '../common/StatCard';
import StatusBadge from '../common/StatusBadge';
import { 
  BookOpen, Clock, AlertTriangle, 
  CheckCircle2, Calendar, XCircle
} from 'lucide-react';

export default function StudentDashboard() {
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState(null);
  const [history, setHistory] = useState([]);
  const [selectedSubjectFilter, setSelectedSubjectFilter] = useState('');
  const [selectedDateFilter, setSelectedDateFilter] = useState('');

  // Re-fetch attendance records whenever subject or date filters change
  useEffect(() => {
    loadStudentData();
  }, [selectedSubjectFilter, selectedDateFilter]);

  /**
   * Fetches dynamic attendance metrics and historical class sessions.
   */
  const loadStudentData = async () => {
    setLoading(true);
    try {
      const queryParams = {};
      // Apply subject filter if chosen by student
      if (selectedSubjectFilter) {
        queryParams.subject = selectedSubjectFilter;
      }
      // Apply calendar date filter if picked by student
      if (selectedDateFilter) {
        queryParams.date = selectedDateFilter;
      }

      // Execute queries in parallel
      const [summaryResponse, historyResponse] = await Promise.all([
        api.attendance.getStudentSummary(),
        api.attendance.getStudentHistory(null, queryParams)
      ]);

      setSummary(summaryResponse.data);
      setHistory(historyResponse.data);
    } catch (err) {
      console.error('Failed to load student attendance profile:', err);
    } finally {
      setLoading(false);
    }
  };

  // Render loading placeholder while fetching profile
  if (loading || !summary) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-8">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 border-3 border-[#376A7B] border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm font-semibold text-slate-600">Loading Student Attendance Profile...</p>
        </div>
      </div>
    );
  }

  // Determine low-attendance threshold status
  const isLowAttendance = summary.is_low_attendance;
  const formattedToday = summary.today_date 
    ? new Date(summary.today_date).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
    : new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <div className="min-h-screen bg-slate-50 p-6 sm:p-8 space-y-6 max-w-7xl mx-auto">
      
      {/* Student Profile Header Card */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs flex flex-col md:flex-row md:items-center md:justify-between gap-6">
        <div className="flex items-start sm:items-center gap-4">
          <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-[#78DABE] to-[#2F4858] flex items-center justify-center text-white shadow-inner font-bold text-2xl font-mono shrink-0">
            {summary.student_name?.charAt(0) || 'S'}
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-bold text-slate-900">{summary.student_name}</h1>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-[#AAFFC7]/60 text-[#2F4858] border border-[#78DABE]">
                <Calendar className="w-3.5 h-3.5 text-[#376A7B]" />
                <span>Today: {formattedToday}</span>
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2 mt-1.5 text-xs text-slate-600 font-medium">
              <span className="font-mono text-[#376A7B] font-bold">{summary.student_id}</span>
              <span>•</span>
              <span>Department: <strong>{summary.department_code}</strong></span>
              <span>•</span>
              <span>Section: <strong>{summary.section_name}</strong></span>
              <span>•</span>
              <span>Semester {summary.semester}</span>
            </div>

            {/* Counsellor Contact Details */}
            <div className="mt-2.5 pt-2 border-t border-slate-100 flex flex-wrap items-center gap-2 text-xs">
              <span className="font-semibold text-slate-500">Section Counsellor:</span>
              {summary.counsellor ? (
                <span className="text-[#2F4858] font-medium bg-slate-100 px-2.5 py-0.5 rounded-full border border-slate-200">
                  <strong>{summary.counsellor.name}</strong> ({summary.counsellor.faculty_id}) • {summary.counsellor.email} {summary.counsellor.phone !== 'N/A' && `• 📞 ${summary.counsellor.phone}`}
                </span>
              ) : (
                <span className="text-slate-400 italic">Not assigned yet</span>
              )}
            </div>
          </div>
        </div>

        {/* Attendance Percentage Indicator */}
        <div className="flex items-center gap-4 border-t md:border-t-0 md:border-l border-slate-200 pt-4 md:pt-0 md:pl-6 shrink-0">
          <div className="text-right">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Overall Attendance</p>
            <p className={`text-4xl font-extrabold font-mono tracking-tight ${isLowAttendance ? 'text-red-600' : 'text-[#376A7B]'}`}>
              {summary.overall_percentage}%
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">Threshold: {summary.threshold}%</p>
          </div>
          <div className={`p-3 rounded-full ${isLowAttendance ? 'bg-red-50 text-red-600 border border-red-200' : 'bg-[#AAFFC7]/40 text-[#2F4858] border border-[#78DABE]'}`}>
            {isLowAttendance ? <AlertTriangle className="w-7 h-7" /> : <CheckCircle2 className="w-7 h-7 text-[#3F8F99]" />}
          </div>
        </div>
      </div>

      {/* Low Attendance Alert Notification */}
      {isLowAttendance && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3 text-sm text-red-800 shadow-xs">
          <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <div>
            <h3 className="font-bold">Institutional Low Attendance Warning</h3>
            <p className="text-xs text-red-700 mt-0.5">
              Your overall attendance ({summary.overall_percentage}%) has dropped below the mandatory institutional requirement of {summary.threshold}%.
              Please consult your Section Counsellor ({summary.counsellor?.name || 'Faculty Proctor'}) or department HOD to rectify attendance shortages.
            </p>
          </div>
        </div>
      )}

      {/* Aggregate Statistics with Interactive Date Picker */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        
        {/* Total Classes Held Card with Date Picker */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Total Classes Held</span>
              <div className="p-2 rounded-lg bg-[#2F4858] text-white">
                <Calendar className="w-5 h-5 text-[#AAFFC7]" />
              </div>
            </div>
            <div>
              <span className="text-3xl font-extrabold font-mono text-slate-900">{summary.total_classes}</span>
              <p className="text-xs text-slate-500 mt-0.5">All curriculum courses conducted</p>
            </div>
          </div>

          {/* Interactive Date Inspection Selector */}
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
            <label className="text-[11px] font-bold text-[#376A7B] flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" />
              <span>Inspect Date:</span>
            </label>
            <div className="flex items-center gap-1.5">
              <input
                type="date"
                value={selectedDateFilter}
                onChange={(e) => setSelectedDateFilter(e.target.value)}
                className="px-2 py-1 text-xs border border-slate-300 rounded-md bg-slate-50 focus:bg-white text-slate-700"
              />
              {selectedDateFilter && (
                <button
                  type="button"
                  onClick={() => setSelectedDateFilter('')}
                  title="Clear Date Filter"
                  className="px-1.5 py-1 text-[11px] bg-slate-200 hover:bg-slate-300 text-slate-700 rounded cursor-pointer font-bold"
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        </div>

        <StatCard
          title="Classes Attended"
          value={summary.total_present}
          subtitle={`${summary.total_present} of ${summary.total_classes} sessions`}
          icon={CheckCircle2}
          color="green"
        />
        <StatCard
          title="Sessions Missed"
          value={summary.total_absent}
          subtitle="Absences recorded"
          icon={XCircle}
          color={summary.total_absent > 5 ? 'amber' : 'brand'}
        />
      </div>

      {/* Monthly Attendance Report Table */}
      {summary.monthly_breakdown && summary.monthly_breakdown.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Calendar className="w-5 h-5 text-[#3F8F99]" />
                <span>Monthly Attendance Report</span>
              </h2>
              <p className="text-xs text-slate-500">Aggregate attendance progression grouped by calendar month</p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-[#2F4858] text-white">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">Academic Month</th>
                  <th className="px-4 py-3 text-center font-semibold">Total Classes</th>
                  <th className="px-4 py-3 text-center font-semibold">Attended</th>
                  <th className="px-4 py-3 text-center font-semibold">Missed</th>
                  <th className="px-4 py-3 text-left font-semibold">Monthly Attendance</th>
                  <th className="px-4 py-3 text-right font-semibold">Standing</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {summary.monthly_breakdown.map((monthItem, index) => (
                  <tr key={index} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-bold text-slate-900">{monthItem.month_name}</td>
                    <td className="px-4 py-3 text-center font-mono font-semibold text-xs">{monthItem.total}</td>
                    <td className="px-4 py-3 text-center font-mono font-bold text-xs text-green-700">{monthItem.present}</td>
                    <td className="px-4 py-3 text-center font-mono font-bold text-xs text-red-600">{monthItem.absent}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-28 bg-slate-200 rounded-full h-2">
                          <div
                            className={`h-2 rounded-full ${monthItem.percentage >= summary.threshold ? 'bg-[#53B4AF]' : 'bg-red-500'}`}
                            style={{ width: `${Math.min(100, monthItem.percentage)}%` }}
                          />
                        </div>
                        <span className="font-mono font-bold text-xs">{monthItem.percentage}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                        monthItem.status === 'Good' ? 'bg-[#AAFFC7]/50 text-[#2F4858] border border-[#78DABE]' :
                        monthItem.status === 'Warning' ? 'bg-amber-100 text-amber-800 border border-amber-200' :
                        'bg-red-100 text-red-800 border border-red-200'
                      }`}>
                        {monthItem.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Subject-Wise Attendance Breakdown Table */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-[#3F8F99]" />
              <span>Subject-Wise Attendance Breakdown</span>
            </h2>
            <p className="text-xs text-slate-500">Per-course attendance percentages and faculty details</p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-[#2F4858] text-white">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Code</th>
                <th className="px-4 py-3 text-left font-semibold">Subject Title</th>
                <th className="px-4 py-3 text-left font-semibold">Assigned Faculty</th>
                <th className="px-4 py-3 text-center font-semibold">Attended / Total</th>
                <th className="px-4 py-3 text-left font-semibold">Attendance Gauge</th>
                <th className="px-4 py-3 text-right font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {summary.subjects.map(subjectItem => (
                <tr key={subjectItem.subject_id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-mono font-bold text-[#376A7B]">{subjectItem.subject_code}</td>
                  <td className="px-4 py-3 font-semibold text-slate-900">{subjectItem.subject_name}</td>
                  <td className="px-4 py-3 text-slate-600 text-xs">{subjectItem.faculty_name}</td>
                  <td className="px-4 py-3 text-center font-mono font-semibold text-xs">
                    {subjectItem.present_sessions} / {subjectItem.total_sessions}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-28 bg-slate-200 rounded-full h-2">
                        <div
                          className={`h-2 rounded-full ${subjectItem.percentage >= summary.threshold ? 'bg-[#53B4AF]' : 'bg-red-500'}`}
                          style={{ width: `${Math.min(100, subjectItem.percentage)}%` }}
                        />
                      </div>
                      <span className="font-mono font-bold text-xs">{subjectItem.percentage}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {subjectItem.percentage >= summary.threshold ? (
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#AAFFC7]/50 text-[#2F4858] border border-[#78DABE]">
                        Eligible
                      </span>
                    ) : (
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-800 border border-red-200">
                        Low Attendance
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Daily Attendance History Activity Log */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Clock className="w-5 h-5 text-[#3F8F99]" />
              <span>Daily Attendance Activity Log</span>
            </h2>
            <p className="text-xs text-slate-500">Chronological history of every class session marked for you</p>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={selectedSubjectFilter}
              onChange={(e) => setSelectedSubjectFilter(e.target.value)}
              className="w-full sm:w-56 px-3 py-1.5 border border-slate-300 rounded-lg text-xs"
            >
              <option value="">All Subjects</option>
              {summary.subjects.map(s => (
                <option key={s.subject_id} value={s.subject_code}>{s.subject_code} - {s.subject_name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Date Filter Status Banner */}
        {selectedDateFilter && (
          <div className="bg-[#AAFFC7]/40 border border-[#78DABE] rounded-lg p-3 flex items-center justify-between text-xs text-[#2F4858]">
            <span className="flex items-center gap-1.5">
              <Calendar className="w-4 h-4 text-[#376A7B]" />
              <span>Active Date Filter: <strong>{selectedDateFilter}</strong> ({history.length} {history.length === 1 ? 'class session' : 'class sessions'} found)</span>
            </span>
            <button
              type="button"
              onClick={() => setSelectedDateFilter('')}
              className="font-bold underline text-[#376A7B] hover:text-[#2F4858] cursor-pointer"
            >
              Show All Recorded Dates ✕
            </button>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-[#2F4858] text-white">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Date</th>
                <th className="px-4 py-3 text-left font-semibold">Session Time</th>
                <th className="px-4 py-3 text-left font-semibold">Subject</th>
                <th className="px-4 py-3 text-left font-semibold">Topic Covered</th>
                <th className="px-4 py-3 text-left font-semibold">Faculty</th>
                <th className="px-4 py-3 text-right font-semibold">Attendance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {history.length === 0 ? (
                <tr>
                  <td colSpan="6" className="px-6 py-8 text-center text-slate-500 text-sm">
                    No attendance records logged for this filter.
                  </td>
                </tr>
              ) : (
                history.map(item => (
                  <tr key={item.record_id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-mono text-xs text-slate-700">{item.date}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">{item.time}</td>
                    <td className="px-4 py-3 font-bold font-mono text-[#376A7B]">{item.subject_code}</td>
                    <td className="px-4 py-3 text-xs text-slate-600 italic">{item.topic || 'Regular Lecture'}</td>
                    <td className="px-4 py-3 text-xs text-slate-600">{item.faculty_name}</td>
                    <td className="px-4 py-3 text-right">
                      <StatusBadge status={item.status} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
