/**
 * Faculty Operations & Attendance Management Dashboard
 * ====================================================
 * Primary workspace for teaching faculty and section proctors/counsellors:
 * 1. Today's Class Schedule: Live timetable slots with pending/completed attendance markers.
 * 2. Interactive Attendance Sheet: Bulk roster marking (Present/Absent toggles, Batch Mark All).
 * 3. Audited Correction Workflow: Single-record adjustments with mandatory justification logging.
 * 4. Course Allocations: HOD-assigned subjects and target sections.
 * 5. Biometric Attendance: Personal physical gate check-in timestamps and arrival status.
 * 6. Counsellor Portal: Cohort attendance health monitoring, defaulter intervention, and guardian contacts.
 */

import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import StatCard from '../common/StatCard';
import StatusBadge from '../common/StatusBadge';
import Modal from '../common/Modal';
import { 
  Calendar, Clock, CheckCircle2, XCircle, BookOpen, 
  UserCheck, AlertCircle, AlertTriangle, Edit3, Fingerprint, Check,
  Users, Phone, RefreshCw, Shield
} from 'lucide-react';

export default function FacultyDashboard() {
  // Navigation tab state
  const [activeTab, setActiveTab] = useState('schedule');
  const [loading, setLoading] = useState(true);

  // Faculty course and timetable data
  const [todayClasses, setTodayClasses] = useState([]);
  const [myAllocations, setMyAllocations] = useState([]);
  const [biometricLogs, setBiometricLogs] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  
  // Section Counsellor (Proctor) state
  const [counsellorSections, setCounsellorSections] = useState([]);
  const [activeCounsellorSectionId, setActiveCounsellorSectionId] = useState(null);
  const [activeCounsellorReport, setActiveCounsellorReport] = useState(null);
  const [counsellorFilter, setCounsellorFilter] = useState('ALL');
  const [loadingCounsellorReport, setLoadingCounsellorReport] = useState(false);

  // Interactive Attendance Workspace state
  const [activeSession, setActiveSession] = useState(null);
  const [roster, setRoster] = useState([]);
  const [submittingAttendance, setSubmittingAttendance] = useState(false);

  // Attendance Correction Modal state
  const [isCorrectionModalOpen, setIsCorrectionModalOpen] = useState(false);
  const [selectedRecordForCorrection, setSelectedRecordForCorrection] = useState(null);
  const [correctionNewStatus, setCorrectionNewStatus] = useState('PRESENT');
  const [correctionReason, setCorrectionReason] = useState('');

  // Notification toast state
  const [notification, setNotification] = useState(null);

  /**
   * Dispatches temporary banner message.
   */
  const showNotice = (msg, isErr = false) => {
    setNotification({ msg, isErr });
    setTimeout(() => setNotification(null), 4000);
  };

  // Initial data load on component mount
  useEffect(() => {
    loadFacultyData();
  }, []);

  /**
   * Loads timetable sessions, assigned courses, biometric punch logs, and counsellor cohorts.
   */
  const loadFacultyData = async () => {
    setLoading(true);
    try {
      const todayIsoDate = new Date().toISOString().split('T')[0];
      
      // Parallel execution of all required faculty data requests
      const [sessionsResponse, allocationsResponse, biometricsResponse, userResponse] = await Promise.all([
        api.academic.getSessions({ date: todayIsoDate }),
        api.academic.getAllocations(),
        api.attendance.getBiometricLogs(),
        api.auth.getCurrentUser()
      ]);

      setTodayClasses(sessionsResponse.data.results || sessionsResponse.data);
      setMyAllocations(allocationsResponse.data.results || allocationsResponse.data);
      setBiometricLogs(biometricsResponse.data.results || biometricsResponse.data);

      const userObject = userResponse.data;
      setCurrentUser(userObject);

      // Extract counselled cohort sections if user is designated as a counsellor
      const counselledSectionsList = userObject?.profile_details?.counselled_sections || [];
      setCounsellorSections(counselledSectionsList);

      // Pre-load counsellor report for first assigned section
      if (counselledSectionsList.length > 0) {
        const primarySectionId = counselledSectionsList[0].id;
        setActiveCounsellorSectionId(primarySectionId);
        try {
          const reportResponse = await api.academic.getSectionCounsellorReport(primarySectionId);
          setActiveCounsellorReport(reportResponse.data);
        } catch (counsellorLoadErr) {
          console.error('Failed to pre-load initial counsellor cohort report:', counsellorLoadErr);
        }
      }
    } catch (dataFetchErr) {
      console.error('Error fetching faculty operational data:', dataFetchErr);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Fetches detailed cohort report for selected section in counsellor view.
   */
  const handleSelectCounsellorSection = async (sectionId) => {
    setActiveCounsellorSectionId(sectionId);
    setLoadingCounsellorReport(true);
    try {
      const reportResponse = await api.academic.getSectionCounsellorReport(sectionId);
      setActiveCounsellorReport(reportResponse.data);
    } catch (err) {
      showNotice('Failed to retrieve counsellor section report.', true);
    } finally {
      setLoadingCounsellorReport(false);
    }
  };

  /**
   * Handles navigation tab switching with automatic counsellor data reload if needed.
   */
  const handleTabSwitch = (tabIdentifier) => {
    setActiveTab(tabIdentifier);
    // If opening counsellor tab and report not yet loaded, trigger fetch
    if (tabIdentifier === 'counsellor' && counsellorSections.length > 0) {
      if (!activeCounsellorReport || activeCounsellorReport.section_id !== activeCounsellorSectionId) {
        handleSelectCounsellorSection(activeCounsellorSectionId || counsellorSections[0].id);
      }
    }
  };

  /**
   * Loads session student roster and switches to attendance marking view.
   */
  const handleOpenAttendanceSheet = async (session) => {
    try {
      const rosterResponse = await api.attendance.getSessionRoster(session.id);
      setActiveSession(rosterResponse.data.session);
      setRoster(rosterResponse.data.roster);
      setActiveTab('take-attendance');
    } catch (err) {
      showNotice('Failed to load session roster for attendance marking.', true);
    }
  };

  /**
   * Toggles attendance status for a single student between PRESENT and ABSENT.
   */
  const handleToggleStatus = (studentProfileId) => {
    setRoster(previousRoster => previousRoster.map(item => {
      if (item.student_profile_id === studentProfileId) {
        // Toggle status
        const nextStatus = item.status === 'PRESENT' ? 'ABSENT' : 'PRESENT';
        return { ...item, status: nextStatus };
      }
      return item;
    }));
  };

  /**
   * Batch updates status across all students in the active roster.
   */
  const handleSetAllStatus = (targetStatus) => {
    setRoster(previousRoster => previousRoster.map(item => ({
      ...item,
      status: targetStatus
    })));
  };

  /**
   * Submits batch attendance records to backend API.
   */
  const handleSubmitAttendance = async () => {
    if (!activeSession) return;
    setSubmittingAttendance(true);

    // Map roster entries into API payload
    const submissionPayload = roster.map(studentItem => ({
      student_id: studentItem.student_profile_id,
      status: studentItem.status
    }));

    try {
      await api.attendance.submitSessionAttendance(activeSession.id, submissionPayload);
      showNotice(`Attendance for ${activeSession.subject_code} submitted successfully!`);
      // Reload timetable data to reflect taken status
      loadFacultyData();
      setActiveTab('schedule');
      setActiveSession(null);
    } catch (err) {
      showNotice('Failed to persist attendance. Please try again.', true);
    } finally {
      setSubmittingAttendance(false);
    }
  };

  /**
   * Opens audited correction modal for a specific student record.
   */
  const handleOpenCorrection = (studentItem) => {
    setSelectedRecordForCorrection(studentItem);
    // Suggest inverted status
    setCorrectionNewStatus(studentItem.status === 'PRESENT' ? 'ABSENT' : 'PRESENT');
    setCorrectionReason('');
    setIsCorrectionModalOpen(true);
  };

  /**
   * Submits audited correction with mandatory written justification.
   */
  const handleSubmitCorrection = async (event) => {
    event.preventDefault();

    if (!selectedRecordForCorrection?.record_id) {
      showNotice('No saved attendance record found to correct.', true);
      return;
    }
    if (!correctionReason.trim()) {
      showNotice('A mandatory written justification must be provided for audit purposes.', true);
      return;
    }

    try {
      await api.attendance.correctRecord(
        selectedRecordForCorrection.record_id,
        correctionNewStatus,
        correctionReason
      );
      showNotice('Attendance record corrected and audit log recorded.');
      setIsCorrectionModalOpen(false);

      // Update in-memory roster entry
      setRoster(previousRoster => previousRoster.map(item => {
        if (item.record_id === selectedRecordForCorrection.record_id) {
          return { ...item, status: correctionNewStatus };
        }
        return item;
      }));
    } catch (err) {
      showNotice('Failed to apply correction to attendance record.', true);
    }
  };

  // Compute live tallies for active attendance sheet
  const presentCount = roster.filter(r => r.status === 'PRESENT').length;
  const absentCount = roster.length - presentCount;

  return (
    <div className="min-h-screen bg-slate-50 flex">
      
      {/* Faculty Operations Sidebar */}
      <aside className="w-64 bg-[#2F4858] text-white flex flex-col shrink-0 min-h-screen border-r border-[#376A7B]">
        <div className="p-5 border-b border-[#376A7B]">
          <span className="text-xs uppercase font-bold text-[#AAFFC7] tracking-wider block">Faculty Portal</span>
          <span className="text-sm font-semibold text-white">Daily Operations</span>
        </div>

        <nav className="flex-1 p-3 space-y-1 text-sm font-medium">
          {[
            { id: 'schedule', label: "Today's Classes", icon: Calendar },
            { id: 'allocations', label: 'My Assigned Subjects', icon: BookOpen },
            { id: 'biometrics', label: 'Biometric Attendance', icon: Fingerprint },
            ...(counsellorSections.length > 0 ? [{ 
              id: 'counsellor', 
              label: 'Counsellor Portal', 
              icon: Users,
              badge: counsellorSections.map(s => s.name).join(', ')
            }] : [])
          ].map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleTabSwitch(item.id)}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg text-left transition-colors cursor-pointer ${
                  active
                    ? 'bg-[#376A7B] text-white font-semibold shadow-xs'
                    : 'text-slate-300 hover:bg-[#376A7B]/40 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon className={`w-4 h-4 ${active ? 'text-[#AAFFC7]' : 'text-[#78DABE]'}`} />
                  <span>{item.label}</span>
                </div>
                {item.badge && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#AAFFC7]/20 text-[#AAFFC7] border border-[#78DABE]/40">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Proctor / Counsellor Assignment Status Card */}
        <div className="p-3 border-t border-[#376A7B]/60">
          {counsellorSections.length > 0 ? (
            <div className="p-3 bg-[#376A7B]/30 rounded-xl border border-[#78DABE]/40 text-xs space-y-1">
              <div className="flex items-center gap-1.5 font-bold text-[#AAFFC7]">
                <Shield className="w-3.5 h-3.5 text-[#AAFFC7]" />
                <span>Assigned Section Counsellor</span>
              </div>
              <p className="text-[11px] text-slate-300">
                Cohort: <span className="font-semibold text-white">{counsellorSections.map(s => s.name).join(', ')}</span>
              </p>
            </div>
          ) : (
            <div className="p-3 bg-[#243B4A] rounded-xl border border-slate-700/60 text-xs space-y-1">
              <div className="flex items-center gap-1.5 font-semibold text-slate-400">
                <Users className="w-3.5 h-3.5 text-slate-400" />
                <span>Teaching Faculty Role</span>
              </div>
              <p className="text-[10px] text-slate-400 leading-tight">
                No proctor cohort assigned. Counsellors are designated by HOD per section.
              </p>
            </div>
          )}
        </div>
      </aside>

      {/* Main Content Pane */}
      <main className="flex-1 p-8 overflow-y-auto">
        
        {/* Toast Notification Banner */}
        {notification && (
          <div className={`mb-6 p-4 rounded-xl border flex items-center justify-between text-sm shadow-md transition-all ${
            notification.isErr
              ? 'bg-red-50 border-red-200 text-red-800'
              : 'bg-[#AAFFC7]/40 border-[#78DABE] text-[#2F4858]'
          }`}>
            <span className="font-semibold">{notification.msg}</span>
            <button onClick={() => setNotification(null)} className="text-xs font-bold underline cursor-pointer">Dismiss</button>
          </div>
        )}

        {/* TAB 1: TODAY'S SCHEDULE & CLASSES */}
        {activeTab === 'schedule' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Today's Class Schedule</h2>
              <p className="text-sm text-slate-500">Scheduled lectures assigned to you for today</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {todayClasses.length === 0 ? (
                <div className="col-span-full bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-500">
                  <Calendar className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                  <p className="font-semibold text-slate-700">No lectures scheduled for today.</p>
                  <p className="text-xs text-slate-400 mt-1">Check your assigned subjects tab to view active semester courses.</p>
                </div>
              ) : (
                todayClasses.map(session => (
                  <div key={session.id} className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between hover:shadow-md transition-all">
                    <div>
                      <div className="flex justify-between items-start mb-2">
                        <span className="font-mono font-bold text-sm text-[#376A7B]">{session.subject_code}</span>
                        <StatusBadge status={session.is_attendance_taken ? 'COMPLETED' : 'PENDING'} />
                      </div>

                      <h3 className="font-bold text-base text-slate-900">{session.subject_name}</h3>
                      <p className="text-xs text-slate-500 mt-0.5">Section: <strong>{session.section_name}</strong></p>

                      <div className="mt-4 space-y-1.5 text-xs text-slate-600 bg-slate-50 p-3 rounded-lg border border-slate-100">
                        <div className="flex items-center gap-2">
                          <Clock className="w-3.5 h-3.5 text-[#53B4AF]" />
                          <span className="font-mono">{session.start_time} - {session.end_time}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <BookOpen className="w-3.5 h-3.5 text-[#3F8F99]" />
                          <span>{session.topic || 'Regular Curriculum Session'}</span>
                        </div>
                      </div>
                    </div>

                    <div className="mt-5 pt-3 border-t border-slate-100">
                      <button
                        onClick={() => handleOpenAttendanceSheet(session)}
                        className={`w-full py-2 px-4 rounded-lg text-xs font-bold shadow-xs transition-colors flex items-center justify-center gap-2 cursor-pointer ${
                          session.is_attendance_taken
                            ? 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-300'
                            : 'bg-[#376A7B] text-white hover:bg-[#2F4858]'
                        }`}
                      >
                        <UserCheck className="w-4 h-4" />
                        <span>{session.is_attendance_taken ? 'View / Correct Attendance' : 'Take Attendance'}</span>
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* TAB 2: INTERACTIVE ATTENDANCE TAKER WORKSPACE */}
        {activeTab === 'take-attendance' && activeSession && (
          <div className="space-y-6">
            
            {/* Header / Session Metadata Bar */}
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-base text-[#376A7B]">{activeSession.subject_code}</span>
                  <span className="text-slate-400">•</span>
                  <span className="font-bold text-base text-slate-900">{activeSession.subject_name}</span>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Section: <strong>{activeSession.section_name}</strong> • Date: <strong>{activeSession.session_date}</strong> • Slot: <strong>{activeSession.start_time} - {activeSession.end_time}</strong>
                </p>
              </div>

              {/* Tally badges */}
              <div className="flex items-center gap-3">
                <div className="px-3 py-1.5 rounded-lg bg-[#AAFFC7]/50 text-[#2F4858] border border-[#78DABE] text-xs font-bold">
                  {presentCount} Present
                </div>
                <div className="px-3 py-1.5 rounded-lg bg-red-50 text-red-700 border border-red-200 text-xs font-bold">
                  {absentCount} Absent
                </div>
                <div className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700 border border-slate-200 text-xs font-bold">
                  {roster.length} Total Cohort
                </div>
              </div>
            </div>

            {/* Action Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-slate-100 p-3 rounded-xl border border-slate-200">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleSetAllStatus('PRESENT')}
                  className="px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Mark All Present
                </button>
                <button
                  type="button"
                  onClick={() => handleSetAllStatus('ABSENT')}
                  className="px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Mark All Absent
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => { setActiveTab('schedule'); setActiveSession(null); }}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSubmitAttendance}
                  disabled={submittingAttendance}
                  className="px-5 py-2 bg-[#376A7B] hover:bg-[#2F4858] text-white rounded-lg text-xs font-bold shadow-xs transition-colors flex items-center gap-2 disabled:opacity-50 cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4 text-[#AAFFC7]" />
                  <span>{submittingAttendance ? 'Saving Attendance...' : 'Submit Class Attendance'}</span>
                </button>
              </div>
            </div>

            {/* Student Roster Table */}
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-[#2F4858] text-white">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold">Student ID</th>
                    <th className="px-4 py-3 text-left font-semibold">Student Full Name</th>
                    <th className="px-4 py-3 text-left font-semibold">Institutional Email</th>
                    <th className="px-4 py-3 text-center font-semibold">Attendance Marking</th>
                    {activeSession.is_attendance_taken && (
                      <th className="px-4 py-3 text-right font-semibold">Audited Correction</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {roster.map((student) => {
                    const isPresent = student.status === 'PRESENT';
                    return (
                      <tr 
                        key={student.student_profile_id} 
                        className={`transition-colors ${isPresent ? 'hover:bg-slate-50' : 'bg-red-50/20 hover:bg-red-50/40'}`}
                      >
                        <td className="px-4 py-3 font-mono font-bold text-[#376A7B]">{student.student_id}</td>
                        <td className="px-4 py-3 font-medium text-slate-900">{student.student_name}</td>
                        <td className="px-4 py-3 text-xs text-slate-500 font-mono">{student.email}</td>
                        
                        {/* Interactive Toggle */}
                        <td className="px-4 py-3 text-center">
                          <button
                            type="button"
                            onClick={() => handleToggleStatus(student.student_profile_id)}
                            className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer shadow-xs ${
                              isPresent
                                ? 'bg-[#AAFFC7] text-[#2F4858] border border-[#78DABE] hover:bg-[#78DABE]'
                                : 'bg-red-100 text-red-800 border border-red-300 hover:bg-red-200'
                            }`}
                          >
                            {isPresent ? (
                              <>
                                <Check className="w-3.5 h-3.5 text-[#2F4858]" />
                                <span>PRESENT</span>
                              </>
                            ) : (
                              <>
                                <XCircle className="w-3.5 h-3.5 text-red-700" />
                                <span>ABSENT</span>
                              </>
                            )}
                          </button>
                        </td>

                        {activeSession.is_attendance_taken && (
                          <td className="px-4 py-3 text-right">
                            {student.record_id && (
                              <button
                                type="button"
                                onClick={() => handleOpenCorrection(student)}
                                className="px-2.5 py-1 text-xs font-semibold text-[#376A7B] hover:text-[#2F4858] border border-slate-200 rounded hover:bg-slate-50 inline-flex items-center gap-1 cursor-pointer"
                              >
                                <Edit3 className="w-3 h-3" />
                                <span>Correct</span>
                              </button>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

          </div>
        )}

        {/* TAB 3: ASSIGNED SUBJECTS */}
        {activeTab === 'allocations' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-slate-900 tracking-tight">My Teaching Allocations</h2>
              <p className="text-sm text-slate-500">Subjects and cohorts assigned to you by the Head of Department</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {myAllocations.map(allocation => (
                <div key={allocation.id} className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
                  <span className="font-mono font-bold text-sm text-[#376A7B]">{allocation.subject_code}</span>
                  <h3 className="font-bold text-base text-slate-900 mt-1">{allocation.subject_name}</h3>
                  <div className="mt-4 pt-3 border-t border-slate-100 text-xs text-slate-600 flex justify-between">
                    <span>Target: <strong>{allocation.section_name}</strong></span>
                    <span>Semester {allocation.semester}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 4: BIOMETRIC ENTRY PUNCHES */}
        {activeTab === 'biometrics' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Personal Biometric Punch Logs</h2>
              <p className="text-sm text-slate-500">Your recorded campus arrival events</p>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-[#2F4858] text-white">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold">Date</th>
                    <th className="px-4 py-3 text-left font-semibold">Punch Time</th>
                    <th className="px-4 py-3 text-left font-semibold">Capture Device</th>
                    <th className="px-4 py-3 text-left font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {biometricLogs.map(logItem => (
                    <tr key={logItem.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-mono text-xs">{logItem.date}</td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-700">
                        {logItem.punch_time ? new Date(logItem.punch_time).toLocaleTimeString() : 'Not Punched'}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500 font-mono">{logItem.device_id}</td>
                      <td className="px-4 py-3">
                        <StatusBadge status={logItem.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 5: COUNSELLOR PORTAL */}
        {activeTab === 'counsellor' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
              <div>
                <div className="flex items-center gap-3">
                  <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Section Counsellor Portal</h2>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#AAFFC7]/60 text-[#2F4858] border border-[#78DABE]">
                    Proctor Oversight Role
                  </span>
                </div>
                <p className="text-sm text-slate-500 mt-1">Detailed student attendance monitoring, early intervention alerts & guardian contact directory</p>
              </div>

              {/* Section Switcher Tabs & Live Refresh */}
              <div className="flex items-center gap-3">
                {counsellorSections.length > 1 && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-slate-500">Cohort:</span>
                    {counsellorSections.map(cohortSection => (
                      <button
                        key={cohortSection.id}
                        onClick={() => handleSelectCounsellorSection(cohortSection.id)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-all ${
                          activeCounsellorSectionId === cohortSection.id
                            ? 'bg-[#376A7B] text-white shadow-xs'
                            : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                        }`}
                      >
                        {cohortSection.name} (Sem {cohortSection.current_semester})
                      </button>
                    ))}
                  </div>
                )}
                <button
                  onClick={() => handleSelectCounsellorSection(activeCounsellorSectionId || counsellorSections[0]?.id)}
                  disabled={loadingCounsellorReport}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg text-xs flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingCounsellorReport ? 'animate-spin' : ''}`} />
                  <span>Refresh Report</span>
                </button>
              </div>
            </div>

            {loadingCounsellorReport ? (
              <div className="py-12 text-center space-y-3 bg-white rounded-xl border border-slate-200">
                <div className="w-8 h-8 border-3 border-[#376A7B] border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-sm font-semibold text-slate-600">Loading Counsellor Attendance Report...</p>
              </div>
            ) : activeCounsellorReport ? (
              <div className="space-y-6">
                
                {/* Counsellor Quick Stats */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                  <StatCard
                    title="Cohort Students"
                    value={activeCounsellorReport.total_students}
                    subtitle={`Section ${activeCounsellorReport.section_name} • Sem ${activeCounsellorReport.semester}`}
                    icon={Users}
                    color="brand"
                  />
                  <StatCard
                    title="Critical Attention"
                    value={activeCounsellorReport.critical_count}
                    subtitle="Attendance strictly <65%"
                    icon={AlertCircle}
                    color="red"
                  />
                  <StatCard
                    title="Warning State"
                    value={activeCounsellorReport.warning_count}
                    subtitle="Attendance between 65% - 75%"
                    icon={AlertTriangle}
                    color="amber"
                  />
                  <StatCard
                    title="Eligible Standing"
                    value={activeCounsellorReport.good_count}
                    subtitle="Attendance >= 75%"
                    icon={CheckCircle2}
                    color="green"
                  />
                </div>

                {/* Counsellor Student Table */}
                <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100 pb-3">
                    <div>
                      <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                        <Users className="w-5 h-5 text-[#3F8F99]" />
                        <span>Student Attendance Roster & Guardian Contacts</span>
                      </h3>
                      <p className="text-xs text-slate-500">Directly consult students and reach parents for attendance rectification</p>
                    </div>

                    {/* Filter buttons */}
                    <div className="flex items-center gap-2 text-xs">
                      {[
                        { id: 'ALL', label: `All (${activeCounsellorReport.students.length})` },
                        { id: 'CRITICAL', label: `Critical (${activeCounsellorReport.critical_count})` },
                        { id: 'WARNING', label: `Warning (${activeCounsellorReport.warning_count})` },
                        { id: 'GOOD', label: `Good (${activeCounsellorReport.good_count})` },
                      ].map(filterItem => (
                        <button
                          key={filterItem.id}
                          onClick={() => setCounsellorFilter(filterItem.id)}
                          className={`px-2.5 py-1 rounded-md font-semibold cursor-pointer transition-colors ${
                            counsellorFilter === filterItem.id
                              ? 'bg-[#376A7B] text-white'
                              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                          }`}
                        >
                          {filterItem.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-slate-200 text-xs">
                      <thead className="bg-[#2F4858] text-white">
                        <tr>
                          <th className="px-3 py-2.5 text-left font-semibold">Student ID</th>
                          <th className="px-3 py-2.5 text-left font-semibold">Student Name</th>
                          <th className="px-3 py-2.5 text-left font-semibold">Guardian / Contact</th>
                          <th className="px-3 py-2.5 text-center font-semibold">Classes (Attended / Held)</th>
                          <th className="px-3 py-2.5 text-left font-semibold">Attendance Gauge</th>
                          <th className="px-3 py-2.5 text-right font-semibold">Standing</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {activeCounsellorReport.students
                          .filter(studentItem => counsellorFilter === 'ALL' || studentItem.category === counsellorFilter)
                          .map(studentItem => (
                            <tr key={studentItem.id} className="hover:bg-slate-50">
                              <td className="px-3 py-2 font-mono font-bold text-[#376A7B]">{studentItem.student_id}</td>
                              <td className="px-3 py-2">
                                <div className="font-semibold text-slate-900">{studentItem.name}</div>
                                <div className="text-[11px] text-slate-400">{studentItem.email}</div>
                              </td>
                              <td className="px-3 py-2 text-slate-600">
                                <div>{studentItem.parent_name}</div>
                                <div className="font-mono text-[11px] text-[#376A7B] flex items-center gap-1 mt-0.5">
                                  <Phone className="w-3 h-3 text-slate-400" />
                                  <span>{studentItem.phone_number}</span>
                                </div>
                              </td>
                              <td className="px-3 py-2 text-center font-mono font-semibold">
                                {studentItem.present_sessions} / {studentItem.total_sessions}
                              </td>
                              <td className="px-3 py-2">
                                <div className="flex items-center gap-2">
                                  <div className="w-24 bg-slate-200 rounded-full h-2">
                                    <div
                                      className={`h-2 rounded-full ${
                                        studentItem.category === 'GOOD' ? 'bg-[#53B4AF]' :
                                        studentItem.category === 'WARNING' ? 'bg-amber-500' : 'bg-red-500'
                                      }`}
                                      style={{ width: `${Math.min(100, studentItem.attendance_percentage || 0)}%` }}
                                    />
                                  </div>
                                  <span className="font-mono font-bold text-[11px]">
                                    {studentItem.attendance_percentage !== null ? `${studentItem.attendance_percentage}%` : 'N/A'}
                                  </span>
                                </div>
                              </td>
                              <td className="px-3 py-2 text-right">
                                <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                                  studentItem.category === 'GOOD' ? 'bg-[#AAFFC7]/50 text-[#2F4858] border border-[#78DABE]' :
                                  studentItem.category === 'WARNING' ? 'bg-amber-100 text-amber-800 border border-amber-200' :
                                  'bg-red-100 text-red-800 border border-red-200'
                                }`}>
                                  {studentItem.category === 'GOOD' ? 'Eligible' :
                                   studentItem.category === 'WARNING' ? 'Warning (<75%)' : 'Critical (<65%)'}
                                </span>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>

              </div>
            ) : (
              <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-500">
                <Users className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                <p className="font-semibold text-slate-700">No counselled cohort assigned.</p>
                <p className="text-xs text-slate-400 mt-1">Section counsellors are designated by the Head of Department.</p>
              </div>
            )}
          </div>
        )}

      </main>

      {/* MODAL: Attendance Correction */}
      <Modal isOpen={isCorrectionModalOpen} onClose={() => setIsCorrectionModalOpen(false)} title="Attendance Correction (Audited)">
        {selectedRecordForCorrection && (
          <form onSubmit={handleSubmitCorrection} className="space-y-4">
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-1">
              <p><strong>Student:</strong> {selectedRecordForCorrection.student_name} ({selectedRecordForCorrection.student_id})</p>
              <p><strong>Current Status:</strong> {selectedRecordForCorrection.status}</p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">New Status *</label>
              <select
                value={correctionNewStatus}
                onChange={(e) => setCorrectionNewStatus(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              >
                <option value="PRESENT">Present</option>
                <option value="ABSENT">Absent</option>
                <option value="EXCUSED">Excused</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Mandatory Correction Justification *
              </label>
              <textarea
                required
                rows={3}
                placeholder="e.g. Student was present in class but marked absent accidentally during roll call."
                value={correctionReason}
                onChange={(e) => setCorrectionReason(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              />
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
              <button type="button" onClick={() => setIsCorrectionModalOpen(false)} className="px-4 py-2 border rounded-lg text-xs cursor-pointer">Cancel</button>
              <button type="submit" className="px-4 py-2 bg-[#376A7B] text-white rounded-lg text-xs font-bold cursor-pointer">Submit Audited Correction</button>
            </div>
          </form>
        )}
      </Modal>

    </div>
  );
}
