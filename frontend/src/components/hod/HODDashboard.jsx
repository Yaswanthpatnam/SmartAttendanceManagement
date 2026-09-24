/**
 * Head of Department (HOD) Administrative & Academic Command Center
 * =================================================================
 * Executive dashboard for academic department heads:
 * 1. Macro Department Overview: Enrollment, faculty headcount, today's lecture completion, low-attendance counts.
 * 2. Interactive Section Cards: Inspect section attendance, verify attendance marking for any date, assign counsellors, or advance semesters.
 * 3. Student Identification Search: Query student roll numbers to access attendance dossiers (courses, monthly reports, counsellors).
 * 4. Timetable Allocations: Assign teaching faculty to course and section combinations.
 * 5. Academic Continuity & Substitution: Detect absent instructors and assign substitute faculty to unconducted sessions.
 * 6. Defaulter Registers: Track students failing statutory minimum attendance thresholds.
 * 7. Departmental Correction Audit Logs: Supervise manual attendance changes and audit justifications.
 */

import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import StatCard from '../common/StatCard';
import StatusBadge from '../common/StatusBadge';
import Modal from '../common/Modal';
import { 
  Building2, Users, Layers, BookOpen, AlertTriangle, 
  Calendar, Clock, UserPlus, Shuffle, Activity,
  Search, ArrowRight
} from 'lucide-react';

export default function HODDashboard() {
  // Navigation active tab
  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [deptAnalytics, setDeptAnalytics] = useState(null);
  
  // Department operational datasets
  const [allocations, setAllocations] = useState([]);
  const [deptFaculty, setDeptFaculty] = useState([]);
  const [deptSections, setDeptSections] = useState([]);
  const [deptSubjects, setDeptSubjects] = useState([]);
  const [lowAttendanceStudents, setLowAttendanceStudents] = useState([]);
  const [academicYears, setAcademicYears] = useState([]);

  // Modal display toggles
  const [isAllocModalOpen, setIsAllocModalOpen] = useState(false);
  const [isSubModalOpen, setIsSubModalOpen] = useState(false);
  const [selectedSessionForSub, setSelectedSessionForSub] = useState(null);

  // Student Search state
  const [studentSearchQuery, setStudentSearchQuery] = useState('');
  const [searchingStudent, setSearchingStudent] = useState(false);
  const [searchedStudent, setSearchedStudent] = useState(null);
  const [isStudentModalOpen, setIsStudentModalOpen] = useState(false);

  // Section Detail Modal state
  const [selectedSection, setSelectedSection] = useState(null);
  const [sectionSummary, setSectionSummary] = useState(null);
  const [loadingSectionSummary, setLoadingSectionSummary] = useState(false);
  const [isSectionModalOpen, setIsSectionModalOpen] = useState(false);
  const [sectionModalDate, setSectionModalDate] = useState('');
  const [selectedCounsellorId, setSelectedCounsellorId] = useState('');
  const [updatingCounsellor, setUpdatingCounsellor] = useState(false);
  const [advancingSemester, setAdvancingSemester] = useState(false);

  // Allocation and Substitution Form inputs
  const [allocForm, setAllocForm] = useState({
    faculty: '',
    subject: '',
    section: '',
    academic_year: '',
    semester: 5
  });
  const [subForm, setSubForm] = useState({
    substitute_faculty_id: '',
    notes: ''
  });

  // Toast notification banner state
  const [notification, setNotification] = useState(null);

  /**
   * Dispatches temporary banner notification.
   */
  const showNotice = (msg, isErr = false) => {
    setNotification({ msg, isErr });
    setTimeout(() => setNotification(null), 4000);
  };

  /**
   * Searches for a student by ID, roll number, or institutional code.
   */
  const handleSearchStudent = async (event) => {
    if (event) {
      event.preventDefault();
    }
    if (!studentSearchQuery.trim()) {
      return;
    }

    setSearchingStudent(true);
    try {
      const response = await api.attendance.getStudentSummary(studentSearchQuery.trim());
      setSearchedStudent(response.data);
      setIsStudentModalOpen(true);
    } catch (err) {
      const errorMsg = err.response?.data?.error || `Student '${studentSearchQuery}' not found in this department.`;
      showNotice(errorMsg, true);
    } finally {
      setSearchingStudent(false);
    }
  };

  /**
   * Inspects detailed student attendance report directly from roster table.
   */
  const handleInspectStudent = async (studentId) => {
    setSearchingStudent(true);
    try {
      const response = await api.attendance.getStudentSummary(studentId);
      setSearchedStudent(response.data);
      setIsStudentModalOpen(true);
    } catch (err) {
      showNotice('Failed to retrieve student attendance dossier.', true);
    } finally {
      setSearchingStudent(false);
    }
  };

  /**
   * Opens detailed section inspection modal with daily roster and administrative controls.
   */
  const handleOpenSectionModal = async (section, dateParam = null) => {
    setSelectedSection(section);
    setIsSectionModalOpen(true);
    setLoadingSectionSummary(true);

    // Default to today's date if not explicitly specified
    const queryDate = dateParam !== null ? dateParam : (deptAnalytics?.today_date || new Date().toISOString().split('T')[0]);
    setSectionModalDate(queryDate);
    setSelectedCounsellorId(section.counsellor_id || '');

    try {
      const sectionId = section.section_id || section.id;
      const response = await api.academic.getSectionAttendanceSummary(sectionId, queryDate);
      setSectionSummary(response.data);
    } catch (err) {
      showNotice('Failed to load section attendance breakdown.', true);
    } finally {
      setLoadingSectionSummary(false);
    }
  };

  /**
   * Re-queries section attendance roster when the calendar date is modified.
   */
  const handleDateChangeForSection = async (newDate) => {
    if (!selectedSection) return;
    setSectionModalDate(newDate);
    setLoadingSectionSummary(true);

    try {
      const sectionId = selectedSection.section_id || selectedSection.id;
      const response = await api.academic.getSectionAttendanceSummary(sectionId, newDate);
      setSectionSummary(response.data);
    } catch (err) {
      showNotice('Failed to load attendance records for selected date.', true);
    } finally {
      setLoadingSectionSummary(false);
    }
  };

  /**
   * Promotes the section and its enrolled students to the next academic semester.
   */
  const handleAdvanceSemester = async () => {
    if (!selectedSection) return;

    const isConfirmed = window.confirm(
      `Are you sure you want to advance Semester for section ${selectedSection.section_name}? This will increment the semester for all enrolled students.`
    );
    if (!isConfirmed) return;

    setAdvancingSemester(true);
    try {
      const sectionId = selectedSection.section_id || selectedSection.id;
      const response = await api.academic.advanceSectionSemester(sectionId);
      showNotice(response.data.message || 'Semester successfully advanced.');

      // Refresh department overview and section summary
      await loadDepartmentData();
      const updatedSummary = await api.academic.getSectionAttendanceSummary(sectionId, sectionModalDate);
      setSectionSummary(updatedSummary.data);
    } catch (err) {
      showNotice(err.response?.data?.detail || 'Failed to advance semester.', true);
    } finally {
      setAdvancingSemester(false);
    }
  };

  /**
   * Designates a faculty member as the section counsellor (proctor).
   */
  const handleAssignCounsellor = async () => {
    if (!selectedSection || !selectedCounsellorId) return;
    setUpdatingCounsellor(true);

    try {
      const sectionId = selectedSection.section_id || selectedSection.id;
      const response = await api.academic.assignSectionCounsellor(sectionId, selectedCounsellorId);
      showNotice(response.data.message || 'Section counsellor assigned successfully.');

      // Refresh departmental master data
      await loadDepartmentData();
      const updatedSummary = await api.academic.getSectionAttendanceSummary(sectionId, sectionModalDate);
      setSectionSummary(updatedSummary.data);
    } catch (err) {
      showNotice(err.response?.data?.detail || 'Failed to assign counsellor.', true);
    } finally {
      setUpdatingCounsellor(false);
    }
  };

  // Initial data loading on mount
  useEffect(() => {
    loadDepartmentData();
  }, []);

  /**
   * Loads departmental analytics, faculty allocations, course catalog, and defaulters list.
   */
  const loadDepartmentData = async () => {
    setLoading(true);
    try {
      // Parallel execution of departmental API queries
      const [analyticsRes, allocRes, facRes, secRes, subjRes, lowRes, acadRes] = await Promise.all([
        api.analytics.getDepartmentOverview(),
        api.academic.getAllocations(),
        api.academic.getFaculty(),
        api.academic.getSections(),
        api.academic.getSubjects(),
        api.analytics.getLowAttendance(),
        api.academic.getAcademicYears()
      ]);

      setDeptAnalytics(analyticsRes.data);
      setAllocations(allocRes.data.results || allocRes.data);
      setDeptFaculty(facRes.data.results || facRes.data);
      setDeptSections(secRes.data.results || secRes.data);
      setDeptSubjects(subjRes.data.results || subjRes.data);
      setLowAttendanceStudents(lowRes.data);
      
      const years = acadRes.data.results || acadRes.data;
      setAcademicYears(years);

      // Pre-select current academic year in form
      const currentYear = years.find(y => y.is_current) || years[0];
      if (currentYear) {
        setAllocForm(previousForm => ({ ...previousForm, academic_year: currentYear.id }));
      }
    } catch (err) {
      console.error('Failed to load departmental data:', err);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Submits new faculty teaching allocation.
   */
  const handleCreateAllocation = async (event) => {
    event.preventDefault();
    try {
      await api.academic.createAllocation(allocForm);
      showNotice('Faculty member successfully allocated to subject and section.');
      setIsAllocModalOpen(false);

      // Reset form
      setAllocForm({
        faculty: '',
        subject: '',
        section: '',
        academic_year: academicYears[0]?.id || '',
        semester: 5
      });

      // Reload allocations list
      const allocationsResponse = await api.academic.getAllocations();
      setAllocations(allocationsResponse.data.results || allocationsResponse.data);
    } catch (err) {
      showNotice('Failed to create allocation. Check for duplicate assignments.', true);
    }
  };

  /**
   * Opens substitution dialog for an unattended or missing class session.
   */
  const openSubstitutionModal = (session) => {
    setSelectedSessionForSub(session);
    setSubForm({ substitute_faculty_id: '', notes: '' });
    setIsSubModalOpen(true);
  };

  /**
   * Submits emergency or planned faculty substitution.
   */
  const handleAssignSubstitution = async (event) => {
    event.preventDefault();
    if (!selectedSessionForSub || !subForm.substitute_faculty_id) return;

    try {
      await api.analytics.assignSubstitution({
        session_id: selectedSessionForSub.session_id,
        substitute_faculty_id: subForm.substitute_faculty_id,
        notes: subForm.notes
      });
      showNotice('Substitute instructor designated successfully.');
      setIsSubModalOpen(false);

      // Refresh departmental analytics to reflect substitution
      const analyticsResponse = await api.analytics.getDepartmentOverview();
      setDeptAnalytics(analyticsResponse.data);
    } catch (err) {
      showNotice('Failed to assign substitute faculty.', true);
    }
  };

  // Render loading state while initial metrics are being computed
  if (loading || !deptAnalytics) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-8">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 border-3 border-[#376A7B] border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm font-semibold text-slate-600">Loading Department Console...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex">
      
      {/* Department Head Sidebar */}
      <aside className="w-64 bg-[#2F4858] text-white flex flex-col shrink-0 min-h-screen border-r border-[#376A7B]">
        <div className="p-5 border-b border-[#376A7B]">
          <span className="text-xs uppercase font-bold text-[#AAFFC7] tracking-wider block">Department Head</span>
          <span className="text-sm font-semibold text-white">
            {deptAnalytics.department_code} • Command Center
          </span>
        </div>

        <nav className="flex-1 p-3 space-y-1 text-sm font-medium">
          {[
            { id: 'overview', label: 'Department Overview', icon: Building2 },
            { id: 'allocations', label: 'Faculty Allocations', icon: Users },
            { id: 'exceptions', label: 'Missing Classes & Subs', icon: Shuffle },
            { id: 'low-attendance', label: 'Low Attendance Register', icon: AlertTriangle },
            { id: 'corrections', label: 'Corrections Audit Log', icon: Activity },
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

      {/* Main Workspace */}
      <main className="flex-1 p-8 overflow-y-auto">
        
        {/* Banner notification */}
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

        {/* TAB 1: OVERVIEW */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
              <div>
                <div className="flex items-center gap-3">
                  <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
                    {deptAnalytics.department_name} ({deptAnalytics.department_code})
                  </h2>
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-[#AAFFC7]/60 text-[#2F4858] border border-[#78DABE]">
                    <Calendar className="w-3.5 h-3.5 text-[#376A7B]" />
                    <span>Today: {deptAnalytics.today_date ? new Date(deptAnalytics.today_date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : 'Current Session'}</span>
                  </span>
                </div>
                <p className="text-sm text-slate-500 mt-1">Department Operational Status, Section Counsellor Oversight & Attendance Adherence</p>
              </div>

              {/* Student ID Search Bar */}
              <form onSubmit={handleSearchStudent} className="flex gap-2 w-full lg:w-auto">
                <div className="relative flex-1 lg:w-80">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Enter Student ID (e.g. STU-CSE1-0001)..."
                    value={studentSearchQuery}
                    onChange={(e) => setStudentSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg text-sm bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#376A7B] text-slate-800"
                  />
                </div>
                <button
                  type="submit"
                  disabled={searchingStudent || !studentSearchQuery.trim()}
                  className="px-4 py-2 bg-[#376A7B] hover:bg-[#2F4858] disabled:opacity-50 text-white rounded-lg text-sm font-semibold flex items-center gap-2 cursor-pointer shadow-xs shrink-0"
                >
                  <Search className="w-4 h-4" />
                  <span>{searchingStudent ? 'Searching...' : 'Search'}</span>
                </button>
              </form>
            </div>

            {/* Department Summary KPI Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              <StatCard
                title="Department Students"
                value={deptAnalytics.total_students}
                subtitle={`Distributed in ${deptAnalytics.total_sections} sections`}
                icon={Users}
                color="brand"
              />
              <StatCard
                title="Department Faculty"
                value={deptAnalytics.total_faculty}
                subtitle={`${deptAnalytics.faculty_attendance_summary.present_count} on campus today`}
                icon={Users}
                color="teal"
              />
              <StatCard
                title="Today's Classes Conducted"
                value={`${deptAnalytics.today_sessions.taken} / ${deptAnalytics.today_sessions.total}`}
                subtitle={`${deptAnalytics.today_sessions.pending} pending submission`}
                icon={Clock}
                color={deptAnalytics.today_sessions.pending === 0 ? 'green' : 'amber'}
              />
              <StatCard
                title="Low Attendance Register"
                value={lowAttendanceStudents.length}
                subtitle={`Students below ${deptAnalytics.threshold}% minimum`}
                icon={AlertTriangle}
                color="red"
              />
            </div>

            {/* Section Breakdown Grid (Interactive Cards) */}
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-4 border-b border-slate-100 gap-2 mb-4">
                <div>
                  <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <Layers className="w-5 h-5 text-[#3F8F99]" />
                    <span>Department Sections Overview</span>
                  </h3>
                  <p className="text-xs text-slate-500">Click any section card to inspect today's student attendance marking, counsellor details, or advance semester</p>
                </div>
                <span className="text-xs font-semibold text-[#376A7B] bg-[#AAFFC7]/30 px-3 py-1 rounded-full border border-[#78DABE]">
                  {deptAnalytics.sections.length} Active Sections
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                {deptAnalytics.sections.map(sec => {
                  const hasData = sec.has_sessions && sec.attendance_percentage !== null;
                  return (
                    <div 
                      key={sec.section_id} 
                      onClick={() => handleOpenSectionModal(sec)}
                      className="p-5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-white hover:border-[#376A7B] hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex justify-between items-start mb-2">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-lg text-[#2F4858] group-hover:text-[#376A7B] transition-colors">{sec.section_name}</span>
                            <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-white text-slate-700 border border-slate-200">
                              Sem {sec.current_semester}
                            </span>
                          </div>
                          {hasData ? (
                            <span className={`text-sm font-mono font-bold ${sec.attendance_percentage >= 75 ? 'text-[#376A7B]' : 'text-amber-600'}`}>
                              {sec.attendance_percentage}%
                            </span>
                          ) : (
                            <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-slate-200 text-slate-600">
                              No Sessions
                            </span>
                          )}
                        </div>

                        <div className="space-y-1.5 mb-4 text-xs text-slate-600">
                          <p className="flex items-center gap-1.5">
                            <Users className="w-3.5 h-3.5 text-slate-400" />
                            <span><strong>{sec.student_count}</strong> Students Enrolled</span>
                          </p>
                          <p className="flex items-center gap-1.5 truncate">
                            <span className="font-semibold text-slate-500">Counsellor:</span>
                            <span className="font-medium text-slate-800 truncate">{sec.counsellor_name || 'Unassigned'}</span>
                          </p>
                        </div>
                      </div>

                      <div>
                        <div className="w-full bg-slate-200 rounded-full h-2 mb-3">
                          {hasData && (
                            <div
                              className={`h-2 rounded-full ${sec.attendance_percentage >= 75 ? 'bg-[#53B4AF]' : 'bg-amber-500'}`}
                              style={{ width: `${Math.min(100, sec.attendance_percentage)}%` }}
                            />
                          )}
                        </div>

                        <div className="flex items-center justify-between text-xs text-[#376A7B] font-semibold group-hover:underline pt-2 border-t border-slate-200/60">
                          <span>View Today's Marking & Roster</span>
                          <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: FACULTY ALLOCATIONS */}
        {activeTab === 'allocations' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Faculty Academic Allocations</h2>
                <p className="text-sm text-slate-500">Assign faculty members to Subject + Section combinations</p>
              </div>
              <button
                onClick={() => setIsAllocModalOpen(true)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-[#376A7B] hover:bg-[#2F4858] text-white rounded-lg text-sm font-semibold shadow-xs cursor-pointer"
              >
                <UserPlus className="w-4 h-4" />
                <span>New Faculty Allocation</span>
              </button>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-[#2F4858] text-white">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold">Faculty Member</th>
                    <th className="px-4 py-3 text-left font-semibold">Faculty ID</th>
                    <th className="px-4 py-3 text-left font-semibold">Subject Code</th>
                    <th className="px-4 py-3 text-left font-semibold">Subject Name</th>
                    <th className="px-4 py-3 text-left font-semibold">Assigned Section</th>
                    <th className="px-4 py-3 text-left font-semibold">Academic Year</th>
                    <th className="px-4 py-3 text-left font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {allocations.map(a => (
                    <tr key={a.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-semibold text-slate-900">{a.faculty_name}</td>
                      <td className="px-4 py-3 font-mono font-bold text-[#376A7B]">{a.faculty_id_code}</td>
                      <td className="px-4 py-3 font-mono font-semibold text-slate-700">{a.subject_code}</td>
                      <td className="px-4 py-3 text-slate-700">{a.subject_name}</td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 rounded text-xs font-semibold bg-slate-100 text-slate-800 border">
                          {a.section_name}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">{a.academic_year_label}</td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 rounded text-xs font-semibold bg-[#AAFFC7]/50 text-[#2F4858] border border-[#78DABE]">
                          Active
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 3: MISSING SESSIONS & FACULTY SUBSTITUTION */}
        {activeTab === 'exceptions' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
                Missing Class Attendance & Substitution Management
              </h2>
              <p className="text-sm text-slate-500">
                Identify scheduled lectures where attendance was unrecorded or primary faculty is absent
              </p>
            </div>

            {/* Absent Faculty Alert Box */}
            {deptAnalytics.faculty_attendance_summary?.absent_or_late_faculty?.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
                <h3 className="text-sm font-bold text-amber-900 flex items-center gap-2 mb-2">
                  <AlertTriangle className="w-4 h-4 text-amber-700" />
                  <span>Absent / Late Faculty Today Requiring Class Coverage</span>
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {deptAnalytics.faculty_attendance_summary.absent_or_late_faculty.map((f, i) => (
                    <div key={i} className="p-3 bg-white rounded-lg border border-amber-200">
                      <div className="flex justify-between items-start">
                        <span className="font-semibold text-xs text-slate-900">{f.name}</span>
                        <StatusBadge status={f.status} />
                      </div>
                      <p className="text-[11px] text-slate-500 font-mono mt-1">{f.faculty_id} • {f.classes_today_count} lectures scheduled</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Missing Sessions Table */}
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
              <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
                <h3 className="text-sm font-bold text-slate-800">
                  Pending / Unrecorded Class Sessions ({deptAnalytics.missing_sessions_count})
                </h3>
              </div>
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-[#2F4858] text-white">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold">Date</th>
                    <th className="px-4 py-3 text-left font-semibold">Time Slot</th>
                    <th className="px-4 py-3 text-left font-semibold">Subject</th>
                    <th className="px-4 py-3 text-left font-semibold">Section</th>
                    <th className="px-4 py-3 text-left font-semibold">Assigned Faculty</th>
                    <th className="px-4 py-3 text-right font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {deptAnalytics.missing_sessions_sample.length === 0 ? (
                    <tr>
                      <td colSpan="6" className="px-6 py-8 text-center text-slate-500 text-sm">
                        All scheduled class sessions in this department have attendance recorded!
                      </td>
                    </tr>
                  ) : (
                    deptAnalytics.missing_sessions_sample.map(s => (
                      <tr key={s.session_id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-mono text-xs">{s.date}</td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-600">{s.time}</td>
                        <td className="px-4 py-3 font-bold text-[#376A7B] font-mono">{s.subject_code}</td>
                        <td className="px-4 py-3 font-semibold text-slate-800">{s.section_name}</td>
                        <td className="px-4 py-3 text-slate-700">{s.faculty_name} ({s.faculty_id})</td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => openSubstitutionModal(s)}
                            className="px-3 py-1.5 bg-[#376A7B] hover:bg-[#2F4858] text-white text-xs font-semibold rounded-lg shadow-xs transition-colors cursor-pointer"
                          >
                            Assign Substitute
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 4: LOW ATTENDANCE REGISTER */}
        {activeTab === 'low-attendance' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
                {deptAnalytics.department_code} Low Attendance Register
              </h2>
              <p className="text-sm text-slate-500">
                Department students falling below {deptAnalytics.threshold}% attendance minimum
              </p>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-[#2F4858] text-white">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold">Student ID</th>
                    <th className="px-4 py-3 text-left font-semibold">Student Name</th>
                    <th className="px-4 py-3 text-left font-semibold">Section</th>
                    <th className="px-4 py-3 text-left font-semibold">Semester</th>
                    <th className="px-4 py-3 text-left font-semibold">Attended / Total</th>
                    <th className="px-4 py-3 text-left font-semibold">Percentage</th>
                    <th className="px-4 py-3 text-left font-semibold">Guardian Phone</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {lowAttendanceStudents.length === 0 ? (
                    <tr>
                      <td colSpan="7" className="px-6 py-8 text-center text-slate-500 text-sm">
                        No students in this department currently fall below the threshold.
                      </td>
                    </tr>
                  ) : (
                    lowAttendanceStudents.map(s => (
                      <tr key={s.student_profile_id} className="hover:bg-red-50/30">
                        <td className="px-4 py-3 font-mono font-bold text-red-700">{s.student_id}</td>
                        <td className="px-4 py-3 font-medium text-slate-900">{s.student_name}</td>
                        <td className="px-4 py-3 text-slate-700">{s.section_name}</td>
                        <td className="px-4 py-3 text-slate-600">Sem {s.semester}</td>
                        <td className="px-4 py-3 font-mono text-xs">{s.present_classes} / {s.total_classes}</td>
                        <td className="px-4 py-3">
                          <span className="px-2 py-0.5 rounded text-xs font-bold bg-red-100 text-red-800 border border-red-200">
                            {s.attendance_percentage}%
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-600">{s.phone}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 5: CORRECTIONS AUDIT REVIEW */}
        {activeTab === 'corrections' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Department Attendance Corrections Audit</h2>
              <p className="text-sm text-slate-500">Supervise change requests and historical justifications by faculty</p>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-[#2F4858] text-white">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold">Timestamp</th>
                    <th className="px-4 py-3 text-left font-semibold">Student ID</th>
                    <th className="px-4 py-3 text-left font-semibold">Student Name</th>
                    <th className="px-4 py-3 text-left font-semibold">Subject / Section</th>
                    <th className="px-4 py-3 text-left font-semibold">Correction</th>
                    <th className="px-4 py-3 text-left font-semibold">Mandatory Reason</th>
                    <th className="px-4 py-3 text-left font-semibold">Modified By</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {deptAnalytics.recent_corrections.length === 0 ? (
                    <tr>
                      <td colSpan="7" className="px-6 py-8 text-center text-slate-500 text-sm">
                        No corrections recorded for this department.
                      </td>
                    </tr>
                  ) : (
                    deptAnalytics.recent_corrections.map(c => (
                      <tr key={c.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-mono text-xs text-slate-500">
                          {new Date(c.timestamp).toLocaleString()}
                        </td>
                        <td className="px-4 py-3 font-mono font-bold text-[#376A7B]">{c.student_id}</td>
                        <td className="px-4 py-3 font-medium text-slate-900">{c.student_name}</td>
                        <td className="px-4 py-3 font-mono text-xs">{c.subject_code} ({c.section_name})</td>
                        <td className="px-4 py-3 text-xs font-semibold">
                          <span className="text-red-600 line-through">{c.original_status}</span> →{' '}
                          <span className="text-emerald-700 font-bold">{c.new_status}</span>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-700 italic max-w-xs">{c.reason}</td>
                        <td className="px-4 py-3 text-xs text-slate-600 font-medium">{c.corrected_by}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </main>

      {/* MODAL: Faculty Allocation */}
      <Modal isOpen={isAllocModalOpen} onClose={() => setIsAllocModalOpen(false)} title="Allocate Faculty to Class">
        <form onSubmit={handleCreateAllocation} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Faculty Member *</label>
            <select
              required
              value={allocForm.faculty}
              onChange={(e) => setAllocForm({ ...allocForm, faculty: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
            >
              <option value="">Select Faculty Member</option>
              {deptFaculty.map(f => (
                <option key={f.id} value={f.id}>{f.faculty_id} - {f.full_name} ({f.designation})</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Subject *</label>
              <select
                required
                value={allocForm.subject}
                onChange={(e) => setAllocForm({ ...allocForm, subject: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              >
                <option value="">Select Subject</option>
                {deptSubjects.map(s => (
                  <option key={s.id} value={s.id}>{s.code} - {s.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Target Section *</label>
              <select
                required
                value={allocForm.section}
                onChange={(e) => setAllocForm({ ...allocForm, section: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              >
                <option value="">Select Section</option>
                {deptSections.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
            <button type="button" onClick={() => setIsAllocModalOpen(false)} className="px-4 py-2 border rounded-lg text-xs cursor-pointer">Cancel</button>
            <button type="submit" className="px-4 py-2 bg-[#376A7B] text-white rounded-lg text-xs font-bold cursor-pointer">Assign Allocation</button>
          </div>
        </form>
      </Modal>

      {/* MODAL: Faculty Substitution */}
      <Modal isOpen={isSubModalOpen} onClose={() => setIsSubModalOpen(false)} title="Assign Substitute Faculty Coverage">
        {selectedSessionForSub && (
          <form onSubmit={handleAssignSubstitution} className="space-y-4">
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-1">
              <p><strong>Session Date:</strong> {selectedSessionForSub.date} ({selectedSessionForSub.time})</p>
              <p><strong>Subject:</strong> {selectedSessionForSub.subject_code} • <strong>Section:</strong> {selectedSessionForSub.section_name}</p>
              <p><strong>Primary Faculty:</strong> {selectedSessionForSub.faculty_name} ({selectedSessionForSub.faculty_id})</p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Select Substitute Faculty *</label>
              <select
                required
                value={subForm.substitute_faculty_id}
                onChange={(e) => setSubForm({ ...subForm, substitute_faculty_id: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              >
                <option value="">Select Available Department Faculty</option>
                {deptFaculty.map(f => (
                  <option key={f.id} value={f.id}>{f.faculty_id} - {f.full_name} ({f.designation})</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Administrative Note / Reason</label>
              <input
                type="text"
                placeholder="e.g. Primary faculty on sick leave; temporary coverage"
                value={subForm.notes}
                onChange={(e) => setSubForm({ ...subForm, notes: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              />
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
              <button type="button" onClick={() => setIsSubModalOpen(false)} className="px-4 py-2 border rounded-lg text-xs cursor-pointer">Cancel</button>
              <button type="submit" className="px-4 py-2 bg-[#376A7B] text-white rounded-lg text-xs font-bold cursor-pointer">Confirm Substitution</button>
            </div>
          </form>
        )}
      </Modal>

      {/* MODAL: Section Attendance & Section Management */}
      <Modal 
        isOpen={isSectionModalOpen} 
        onClose={() => setIsSectionModalOpen(false)} 
        title={selectedSection ? `Section ${selectedSection.section_name} • Today's Attendance Marking & Oversight` : 'Section Attendance'}
      >
        {loadingSectionSummary ? (
          <div className="py-12 text-center space-y-3">
            <div className="w-8 h-8 border-3 border-[#376A7B] border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-sm font-semibold text-slate-600">Loading Section Attendance Roster...</p>
          </div>
        ) : sectionSummary ? (
          <div className="space-y-6 max-h-[75vh] overflow-y-auto pr-1">
            
            {/* Top Management Controls: Counsellor & Advance Semester */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-slate-200">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-800 text-sm">{sectionSummary.section_name} ({sectionSummary.department})</span>
                  <span className="px-2 py-0.5 rounded text-xs font-semibold bg-[#2F4858] text-white">
                    Semester {sectionSummary.semester}
                  </span>
                </div>

                {/* Advance Semester Button */}
                <button
                  type="button"
                  onClick={handleAdvanceSemester}
                  disabled={advancingSemester}
                  className="px-3 py-1.5 bg-[#376A7B] hover:bg-[#2F4858] disabled:opacity-50 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <ArrowRight className="w-3.5 h-3.5" />
                  <span>{advancingSemester ? 'Advancing...' : 'Advance to Next Semester'}</span>
                </button>
              </div>

              {/* Counsellor Assignment Row */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-slate-700">Section Counsellor:</span>
                  {sectionSummary.counsellor ? (
                    <span className="font-bold text-[#376A7B] bg-[#AAFFC7]/50 px-2.5 py-0.5 rounded-full border border-[#78DABE]">
                      {sectionSummary.counsellor.name} ({sectionSummary.counsellor.faculty_id})
                    </span>
                  ) : (
                    <span className="text-amber-700 font-semibold bg-amber-50 px-2.5 py-0.5 rounded-full border border-amber-200">
                      Unassigned
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <select
                    value={selectedCounsellorId}
                    onChange={(e) => setSelectedCounsellorId(e.target.value)}
                    className="px-2.5 py-1 border border-slate-300 rounded-lg text-xs bg-white"
                  >
                    <option value="">Assign / Change Counsellor...</option>
                    {deptFaculty.map(f => (
                      <option key={f.id} value={f.id}>{f.faculty_id} - {f.full_name}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={handleAssignCounsellor}
                    disabled={updatingCounsellor || !selectedCounsellorId}
                    className="px-3 py-1 bg-[#2F4858] hover:bg-[#376A7B] disabled:opacity-50 text-white rounded-lg text-xs font-semibold cursor-pointer"
                  >
                    {updatingCounsellor ? 'Updating...' : 'Assign'}
                  </button>
                </div>
              </div>
            </div>

            {/* Date Selector & Stats Summary Row */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-[#376A7B]" />
                <span className="text-xs font-semibold text-slate-700">Attendance Date:</span>
                <input
                  type="date"
                  value={sectionModalDate}
                  onChange={(e) => handleDateChangeForSection(e.target.value)}
                  className="px-2.5 py-1 border border-slate-300 rounded-lg text-xs bg-slate-50 focus:bg-white"
                />
              </div>

              <div className="flex items-center gap-3 text-xs">
                <span className="font-semibold text-slate-600">Sessions Today: <strong>{sectionSummary.today_sessions_count}</strong></span>
                <span className="text-slate-300">|</span>
                <span className="font-semibold text-green-700">Present: <strong>{sectionSummary.present_today}</strong></span>
                <span className="text-slate-300">|</span>
                <span className="font-semibold text-red-600">Absent: <strong>{sectionSummary.absent_today}</strong></span>
                <span className="text-slate-300">|</span>
                <span className="font-bold font-mono text-[#376A7B]">
                  Overall: {sectionSummary.overall_attendance_percentage !== null ? `${sectionSummary.overall_attendance_percentage}%` : 'No Sessions'}
                </span>
              </div>
            </div>

            {/* Students Roster Table */}
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <table className="min-w-full divide-y divide-slate-200 text-xs">
                <thead className="bg-[#2F4858] text-white">
                  <tr>
                    <th className="px-3 py-2.5 text-left font-semibold">Student ID</th>
                    <th className="px-3 py-2.5 text-left font-semibold">Student Name</th>
                    <th className="px-3 py-2.5 text-center font-semibold">Marking for {sectionModalDate}</th>
                    <th className="px-3 py-2.5 text-center font-semibold">Sessions Attended</th>
                    <th className="px-3 py-2.5 text-center font-semibold">Overall Semester %</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {sectionSummary.students.map((stu) => (
                    <tr key={stu.id} className="hover:bg-slate-50">
                      <td className="px-3 py-2 font-mono font-bold text-[#376A7B]">{stu.student_id}</td>
                      <td className="px-3 py-2">
                        <div className="font-medium text-slate-900">{stu.name}</div>
                        <div className="text-[11px] text-slate-400">{stu.email}</div>
                      </td>
                      <td className="px-3 py-2 text-center">
                        {stu.today_status === 'PRESENT' ? (
                          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#AAFFC7]/60 text-[#2F4858] border border-[#78DABE]">
                            Present
                          </span>
                        ) : stu.today_status === 'ABSENT' ? (
                          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-red-100 text-red-800 border border-red-200">
                            Absent
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[11px] text-slate-500 bg-slate-100">
                            No Session Held
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-center font-mono">
                        {stu.today_sessions_attended} / {stu.today_total_sessions}
                      </td>
                      <td className="px-3 py-2 text-center font-mono">
                        {stu.overall_percentage !== null ? (
                          <span className={`font-bold ${
                            stu.is_critical ? 'text-red-600 bg-red-50 px-2 py-0.5 rounded' : 
                            stu.is_warning ? 'text-amber-600 bg-amber-50 px-2 py-0.5 rounded' : 'text-[#376A7B]'
                          }`}>
                            {stu.overall_percentage}% {stu.is_critical && '⚠️'}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => handleInspectStudent(stu.student_id)}
                          className="px-2 py-1 text-[11px] font-bold text-[#376A7B] hover:text-[#2F4858] hover:underline cursor-pointer"
                        >
                          View Report ➜
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsSectionModalOpen(false)}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-lg text-xs font-semibold cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        ) : null}
      </Modal>

      {/* MODAL: Student Detailed Attendance Report */}
      <Modal 
        isOpen={isStudentModalOpen} 
        onClose={() => setIsStudentModalOpen(false)} 
        title={searchedStudent ? `Student Attendance Dossier: ${searchedStudent.student_name}` : 'Student Report'}
      >
        {searchedStudent && (
          <div className="space-y-6 max-h-[80vh] overflow-y-auto pr-1">
            
            {/* Header Identity Card */}
            <div className="bg-gradient-to-r from-slate-900 to-[#2F4858] text-white p-5 rounded-2xl shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <span className="text-[11px] uppercase font-bold text-[#AAFFC7] tracking-wider block">Official Academic Record</span>
                <h3 className="text-xl font-bold">{searchedStudent.student_name}</h3>
                <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-slate-300">
                  <span className="font-mono font-bold text-[#AAFFC7]">{searchedStudent.student_id}</span>
                  <span>•</span>
                  <span>Dept: {searchedStudent.department_code}</span>
                  <span>•</span>
                  <span>Section: {searchedStudent.section_name}</span>
                  <span>•</span>
                  <span>Semester {searchedStudent.semester}</span>
                </div>
              </div>

              <div className="text-right">
                <span className="text-xs text-slate-300 block">Overall Attendance</span>
                <span className={`text-3xl font-extrabold font-mono ${searchedStudent.overall_percentage >= 75 ? 'text-[#AAFFC7]' : 'text-red-400'}`}>
                  {searchedStudent.overall_percentage}%
                </span>
                <span className="text-[11px] text-slate-300 block">Threshold: {searchedStudent.threshold}%</span>
              </div>
            </div>

            {/* Counsellor & Today's Date Banner */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                <span className="font-bold text-slate-800 flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-[#376A7B]" />
                  <span>Section Counsellor Details</span>
                </span>
                {searchedStudent.counsellor ? (
                  <div className="text-slate-600 space-y-0.5 pt-1">
                    <p><strong>Name:</strong> {searchedStudent.counsellor.name} ({searchedStudent.counsellor.faculty_id})</p>
                    <p><strong>Email:</strong> {searchedStudent.counsellor.email}</p>
                    <p><strong>Contact:</strong> {searchedStudent.counsellor.phone}</p>
                  </div>
                ) : (
                  <p className="text-amber-600 italic pt-1">No section counsellor designated yet.</p>
                )}
              </div>

              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1 flex flex-col justify-between">
                <div>
                  <span className="font-bold text-slate-800 flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-[#376A7B]" />
                    <span>Report Generation Date</span>
                  </span>
                  <p className="text-slate-600 pt-1">
                    <strong>Today's Date:</strong> {searchedStudent.today_date ? new Date(searchedStudent.today_date).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : new Date().toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center gap-2 pt-2 border-t border-slate-200">
                  <span className="font-semibold text-slate-700">Total Classes: {searchedStudent.total_classes}</span>
                  <span className="text-slate-300">|</span>
                  <span className="font-semibold text-green-700">Attended: {searchedStudent.total_present}</span>
                  <span className="text-slate-300">|</span>
                  <span className="font-semibold text-red-600">Missed: {searchedStudent.total_absent}</span>
                </div>
              </div>
            </div>

            {/* Subject-Wise Breakdown */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                <BookOpen className="w-4 h-4 text-[#376A7B]" />
                <span>Curriculum Course Attendance</span>
              </h4>
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="min-w-full divide-y divide-slate-200 text-xs">
                  <thead className="bg-[#2F4858] text-white">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold">Subject</th>
                      <th className="px-3 py-2 text-left font-semibold">Faculty</th>
                      <th className="px-3 py-2 text-center font-semibold">Attended / Total</th>
                      <th className="px-3 py-2 text-center font-semibold">Percentage</th>
                      <th className="px-3 py-2 text-right font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {searchedStudent.subjects?.map(s => (
                      <tr key={s.subject_id} className="hover:bg-slate-50">
                        <td className="px-3 py-2 font-medium text-slate-900">
                          <span className="font-mono font-bold text-[#376A7B] mr-1.5">{s.subject_code}</span>
                          <span>{s.subject_name}</span>
                        </td>
                        <td className="px-3 py-2 text-slate-600">{s.faculty_name}</td>
                        <td className="px-3 py-2 text-center font-mono">{s.present_sessions} / {s.total_sessions}</td>
                        <td className="px-3 py-2 text-center font-mono font-bold">
                          <span className={s.percentage >= searchedStudent.threshold ? 'text-[#376A7B]' : 'text-red-600'}>
                            {s.percentage}%
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right">
                          {s.percentage >= searchedStudent.threshold ? (
                            <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-[#AAFFC7]/50 text-[#2F4858] border border-[#78DABE]">
                              Eligible
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-red-100 text-red-800 border border-red-200">
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

            {/* Monthly Attendance Report Breakdown */}
            {searchedStudent.monthly_breakdown && searchedStudent.monthly_breakdown.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                  <Calendar className="w-4 h-4 text-[#376A7B]" />
                  <span>Monthly Attendance Report</span>
                </h4>
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="min-w-full divide-y divide-slate-200 text-xs">
                    <thead className="bg-[#376A7B] text-white">
                      <tr>
                        <th className="px-3 py-2 text-left font-semibold">Month</th>
                        <th className="px-3 py-2 text-center font-semibold">Classes Conducted</th>
                        <th className="px-3 py-2 text-center font-semibold">Attended</th>
                        <th className="px-3 py-2 text-center font-semibold">Missed</th>
                        <th className="px-3 py-2 text-center font-semibold">Monthly Percentage</th>
                        <th className="px-3 py-2 text-right font-semibold">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {searchedStudent.monthly_breakdown.map((m, idx) => (
                        <tr key={idx} className="hover:bg-slate-50">
                          <td className="px-3 py-2 font-bold text-slate-800">{m.month_name}</td>
                          <td className="px-3 py-2 text-center font-mono">{m.total}</td>
                          <td className="px-3 py-2 text-center font-mono text-green-700 font-semibold">{m.present}</td>
                          <td className="px-3 py-2 text-center font-mono text-red-600 font-semibold">{m.absent}</td>
                          <td className="px-3 py-2 text-center font-mono font-bold text-slate-900">{m.percentage}%</td>
                          <td className="px-3 py-2 text-right">
                            <span className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                              m.status === 'Good' ? 'bg-[#AAFFC7]/50 text-[#2F4858] border border-[#78DABE]' :
                              m.status === 'Warning' ? 'bg-amber-100 text-amber-800 border border-amber-200' :
                              'bg-red-100 text-red-800 border border-red-200'
                            }`}>
                              {m.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="flex justify-end pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsStudentModalOpen(false)}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-lg text-xs font-semibold cursor-pointer"
              >
                Close Report
              </button>
            </div>
          </div>
        )}
      </Modal>

    </div>
  );
}
