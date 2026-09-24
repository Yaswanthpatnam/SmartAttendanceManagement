/**
 * SMART ATTENDANCE MANAGEMENT SYSTEM - INSTITUTIONAL ADMIN DASHBOARD
 * 
 * Central administrative workspace providing executive oversight and management of:
 * 1. Master Academic Records: Departments, cohorts/sections, curriculum subjects, academic years.
 * 2. Institutional Directories: Comprehensive, paginated search and filters for all students and faculty.
 * 3. Two-Phase Bulk CSV Onboarding:
 *    - Phase 1: Upload, header validation, data-type checking, staging, and diagnostic preview.
 *    - Phase 2: Administrative confirmation triggering atomic bulk insertion with auto-generated IDs.
 * 4. Audit History: Immutable log of all bulk imports and row-level outcomes.
 * 5. System Configuration: Dynamic tuning of institutional attendance thresholds (e.g. 75% warning trigger).
 */

import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import StatCard from '../common/StatCard';
import StatusBadge from '../common/StatusBadge';
import Modal from '../common/Modal';
import Pagination from '../common/Pagination';
import { 
  Users, GraduationCap, Building2, BookOpen, Upload, History, 
  Settings, Plus, Search, Filter, AlertCircle, CheckCircle2, 
  FileText, Download, Layers, ShieldCheck, RefreshCw, Eye
} from 'lucide-react';

export default function AdminDashboard() {
  // Navigation tab state tracker (defaulting to overview)
  const [activeTab, setActiveTab] = useState('overview');
  
  // Master institutional data states
  const [departments, setDepartments] = useState([]);
  const [sections, setSections] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [academicYears, setAcademicYears] = useState([]);

  // Student directory states: pagination, live search filter, and department dropdown filter
  const [students, setStudents] = useState([]);
  const [studentTotal, setStudentTotal] = useState(0);
  const [studentPage, setStudentPage] = useState(1);
  const [studentSearch, setStudentSearch] = useState('');
  const [studentDeptFilter, setStudentDeptFilter] = useState('');

  // Faculty directory states: pagination, live search filter, and department dropdown filter
  const [faculty, setFaculty] = useState([]);
  const [facultyTotal, setFacultyTotal] = useState(0);
  const [facultyPage, setFacultyPage] = useState(1);
  const [facultySearch, setFacultySearch] = useState('');
  const [facultyDeptFilter, setFacultyDeptFilter] = useState('');

  // Institutional configuration states
  const [systemSettings, setSystemSettings] = useState([]);
  const [threshold, setThreshold] = useState('75.0');

  // Bulk CSV Onboarding states
  const [importType, setImportType] = useState('STUDENT');
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [previewBatch, setPreviewBatch] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const [importSummary, setImportSummary] = useState(null);
  const [importHistory, setImportHistory] = useState([]);

  // Modal dialog open/close visibility flags
  const [isStudentModalOpen, setIsStudentModalOpen] = useState(false);
  const [isFacultyModalOpen, setIsFacultyModalOpen] = useState(false);
  const [isDeptModalOpen, setIsDeptModalOpen] = useState(false);
  const [isSectionModalOpen, setIsSectionModalOpen] = useState(false);

  // Form input capture states for single entity onboarding modals
  const [studentForm, setStudentForm] = useState({
    full_name: '', date_of_birth: '', department: '', section: '',
    academic_year: '', semester: 5, email: '', phone: ''
  });
  const [facultyForm, setFacultyForm] = useState({
    full_name: '', date_of_birth: '', department: '', designation: 'Assistant Professor',
    email: '', phone: '', is_hod: false
  });
  const [deptForm, setDeptForm] = useState({ code: '', name: '' });
  const [sectionForm, setSectionForm] = useState({ department: '', name: '', academic_year: '', current_semester: 5 });

  // Floating feedback banner notification state
  const [notification, setNotification] = useState(null);

  /**
   * Dispatches a temporary toast notification banner to the user interface.
   * Cleans up after 4000ms using a timer.
   */
  const showNotice = (msg, isErr = false) => {
    // Set notification payload
    setNotification({ msg, isErr });
    // Schedule automatic dismissal after display duration
    setTimeout(() => {
      setNotification(null);
    }, 4000);
  };

  /**
   * Top-level effect hook: loads static reference datasets and system settings on mount.
   */
  useEffect(() => {
    loadMasterData();
    loadSystemSettings();
  }, []);

  /**
   * Watches activeTab and student filter dependencies to trigger paginated queries.
   */
  useEffect(() => {
    // Only query student backend if student directory tab is actively viewed
    if (activeTab === 'students') {
      loadStudents();
    }
  }, [activeTab, studentPage, studentSearch, studentDeptFilter]);

  /**
   * Watches activeTab and faculty filter dependencies to trigger paginated queries.
   */
  useEffect(() => {
    // Only query faculty backend if faculty directory tab is actively viewed
    if (activeTab === 'faculty') {
      loadFaculty();
    }
  }, [activeTab, facultyPage, facultySearch, facultyDeptFilter]);

  /**
   * Watches activeTab to reload historical audit entries upon viewing the history tab.
   */
  useEffect(() => {
    // Fetch import audit runs when switching to audit history
    if (activeTab === 'history') {
      loadImportHistory();
    }
  }, [activeTab]);

  /**
   * Fetches core master academic records concurrently using Promise.all to minimize latency.
   */
  const loadMasterData = async () => {
    try {
      const [dRes, sRes, subRes, aRes] = await Promise.all([
        api.academic.getDepartments(),
        api.academic.getSections(),
        api.academic.getSubjects(),
        api.academic.getAcademicYears()
      ]);

      // Normalize DRF paginated results vs flat list responses
      setDepartments(dRes.data.results || dRes.data);
      setSections(sRes.data.results || sRes.data);
      setSubjects(subRes.data.results || subRes.data);

      const aData = aRes.data.results || aRes.data;
      setAcademicYears(aData);
      
      // Auto-populate active academic year in forms if available
      const currentYear = aData.find(y => y.is_current) || aData[0];
      if (currentYear) {
        setStudentForm(prev => ({ ...prev, academic_year: currentYear.id }));
        setSectionForm(prev => ({ ...prev, academic_year: currentYear.id }));
      }
    } catch (err) {
      console.error('Error loading master data:', err);
    }
  };

  /**
   * Retrieves global institutional parameters and parses the attendance warning threshold.
   */
  const loadSystemSettings = async () => {
    try {
      const res = await api.settings.getSettings();
      const settingsList = res.data.results || res.data;
      setSystemSettings(settingsList);
      
      // Extract configured low attendance threshold value
      const th = settingsList.find(s => s.key === 'LOW_ATTENDANCE_THRESHOLD');
      if (th) {
        setThreshold(th.value);
      }
    } catch (err) {
      console.error('Error loading system settings:', err);
    }
  };

  /**
   * Fetches paginated student roster records filtered by search keywords and department.
   */
  const loadStudents = async () => {
    try {
      const params = { page: studentPage };
      // Include search query parameter if provided by user
      if (studentSearch) {
        params.search = studentSearch;
      }
      // Include department filter ID if selected
      if (studentDeptFilter) {
        params.department = studentDeptFilter;
      }
      
      const res = await api.academic.getStudents(params);
      setStudents(res.data.results || res.data);
      // Safeguard count for total record pagination calculations
      setStudentTotal(res.data.count || res.data.length || 0);
    } catch (err) {
      console.error('Failed to load students:', err);
    }
  };

  /**
   * Fetches paginated faculty directory records with optional department filtering and search.
   */
  const loadFaculty = async () => {
    try {
      const params = { page: facultyPage };
      // Apply search term if present
      if (facultySearch) {
        params.search = facultySearch;
      }
      // Apply department filter if present
      if (facultyDeptFilter) {
        params.department = facultyDeptFilter;
      }

      const res = await api.academic.getFaculty(params);
      setFaculty(res.data.results || res.data);
      setFacultyTotal(res.data.count || res.data.length || 0);
    } catch (err) {
      console.error('Failed to load faculty:', err);
    }
  };

  /**
   * Fetches chronological bulk onboarding audit log history.
   */
  const loadImportHistory = async () => {
    try {
      const res = await api.imports.getHistory();
      setImportHistory(res.data.results || res.data);
    } catch (err) {
      console.error('Failed to load import audit history:', err);
    }
  };

  /**
   * Submits single student creation payload, handles modal teardown, and refreshes directory.
   */
  const handleCreateStudent = async (e) => {
    e.preventDefault();
    try {
      await api.academic.createStudent(studentForm);
      showNotice('Student successfully registered.');
      setIsStudentModalOpen(false);
      // Reset form state to initial blank fields
      setStudentForm({
        full_name: '', date_of_birth: '', department: '', section: '',
        academic_year: academicYears[0]?.id || '', semester: 5, email: '', phone: ''
      });
      loadStudents();
      loadMasterData();
    } catch (err) {
      // Format validation errors returned by DRF serializer
      const detail = err.response?.data ? JSON.stringify(err.response.data) : 'Failed to register student';
      showNotice(detail, true);
    }
  };

  /**
   * Submits single faculty member creation payload, handles modal teardown, and refreshes list.
   */
  const handleCreateFaculty = async (e) => {
    e.preventDefault();
    try {
      await api.academic.createFaculty(facultyForm);
      showNotice('Faculty member successfully onboarded.');
      setIsFacultyModalOpen(false);
      // Reset form fields
      setFacultyForm({
        full_name: '', date_of_birth: '', department: '', designation: 'Assistant Professor',
        email: '', phone: '', is_hod: false
      });
      loadFaculty();
      loadMasterData();
    } catch (err) {
      const detail = err.response?.data ? JSON.stringify(err.response.data) : 'Failed to onboard faculty';
      showNotice(detail, true);
    }
  };

  /**
   * Creates a new academic department code and name.
   */
  const handleCreateDept = async (e) => {
    e.preventDefault();
    try {
      await api.academic.createDepartment(deptForm);
      showNotice('Department successfully created.');
      setIsDeptModalOpen(false);
      setDeptForm({ code: '', name: '' });
      loadMasterData();
    } catch (err) {
      showNotice('Failed to create department.', true);
    }
  };

  /**
   * Creates a new cohort section tied to a department and academic year.
   */
  const handleCreateSection = async (e) => {
    e.preventDefault();
    try {
      await api.academic.createSection(sectionForm);
      showNotice('Section successfully created.');
      setIsSectionModalOpen(false);
      setSectionForm({ department: '', name: '', academic_year: academicYears[0]?.id || '', current_semester: 5 });
      loadMasterData();
    } catch (err) {
      showNotice('Failed to create section.', true);
    }
  };

  /**
   * Executes Phase 1 of Bulk CSV Onboarding:
   * Parses uploaded CSV, validates rows, checks for duplicate institutional IDs, and stages the batch.
   */
  const handleUploadCSV = async (e) => {
    e.preventDefault();
    // Validate file selection before initiating request
    if (!selectedFile) {
      showNotice('Please select a valid CSV file.', true);
      return;
    }

    setUploading(true);
    setPreviewBatch(null);
    setImportSummary(null);

    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      let res;
      // Route request based on selected import entity type
      if (importType === 'STUDENT') {
        res = await api.imports.uploadStudents(formData);
      } else {
        res = await api.imports.uploadFaculty(formData);
      }
      setPreviewBatch(res.data);
      showNotice('CSV parsed and validated. Review the preview diagnostics below.');
    } catch (err) {
      const errMsg = err.response?.data?.error || 'Validation failed. Check CSV schema.';
      showNotice(errMsg, true);
    } finally {
      setUploading(false);
    }
  };

  /**
   * Executes Phase 2 of Bulk CSV Onboarding:
   * Commits staged batch into the live database within an atomic transaction.
   */
  const handleConfirmBatch = async () => {
    // Guard against confirmation without an active staged batch
    if (!previewBatch) return;

    setConfirming(true);
    try {
      const res = await api.imports.confirmBatch(previewBatch.batch_id);
      setImportSummary(res.data);
      setPreviewBatch(null);
      setSelectedFile(null);
      showNotice('Import committed successfully!');
      loadMasterData();
      
      // Refresh directory corresponding to imported entity
      if (importType === 'STUDENT') {
        loadStudents();
      } else {
        loadFaculty();
      }
    } catch (err) {
      showNotice('Failed to commit import batch.', true);
    } finally {
      setConfirming(false);
    }
  };

  /**
   * Updates institutional minimum attendance threshold in global settings.
   */
  const handleSaveThreshold = async (e) => {
    e.preventDefault();
    const thSetting = systemSettings.find(s => s.key === 'LOW_ATTENDANCE_THRESHOLD');
    // Ensure setting record exists in database
    if (thSetting) {
      try {
        await api.settings.updateSetting(thSetting.id, { value: threshold });
        showNotice('Attendance threshold updated successfully.');
      } catch (err) {
        showNotice('Failed to update threshold.', true);
      }
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex">
      
      {/* Sidebar Navigation */}
      <aside className="w-64 bg-[#2F4858] text-white flex flex-col shrink-0 min-h-screen border-r border-[#376A7B]">
        <div className="p-5 border-b border-[#376A7B]">
          <span className="text-xs uppercase font-bold text-[#AAFFC7] tracking-wider block">Admin Control Panel</span>
          <span className="text-sm font-semibold text-white">Institutional Records</span>
        </div>

        <nav className="flex-1 p-3 space-y-1 text-sm font-medium">
          {/* Iterate over administrative navigation tabs */}
          {[
            { id: 'overview', label: 'Institutional Overview', icon: Building2 },
            { id: 'students', label: 'Students Directory', icon: GraduationCap },
            { id: 'faculty', label: 'Faculty Directory', icon: Users },
            { id: 'departments', label: 'Departments & Sections', icon: Layers },
            { id: 'subjects', label: 'Curriculum Subjects', icon: BookOpen },
            { id: 'import', label: 'Bulk CSV Onboarding', icon: Upload },
            { id: 'history', label: 'Import Audit History', icon: History },
            { id: 'settings', label: 'System Configuration', icon: Settings },
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
        
        {/* Floating Notification Toast */}
        {notification && (
          <div className={`mb-6 p-4 rounded-xl border flex items-center justify-between text-sm shadow-md transition-all ${
            notification.isErr
              ? 'bg-red-50 border-red-200 text-red-800'
              : 'bg-[#AAFFC7]/40 border-[#78DABE] text-[#2F4858]'
          }`}>
            <div className="flex items-center gap-2">
              {notification.isErr ? (
                <AlertCircle className="w-5 h-5 text-red-600" />
              ) : (
                <CheckCircle2 className="w-5 h-5 text-[#3F8F99]" />
              )}
              <span className="font-semibold">{notification.msg}</span>
            </div>
            <button onClick={() => setNotification(null)} className="text-xs font-bold underline">Dismiss</button>
          </div>
        )}

        {/* TAB 1: INSTITUTIONAL OVERVIEW */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Institutional Master Overview</h2>
              <p className="text-sm text-slate-500">Apex Institute of Technology & Engineering • Configuration State</p>
            </div>

            {/* Macro KPI Scorecards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              <StatCard title="Total Departments" value={departments.length} icon={Building2} color="brand" subtitle="Active academic faculties" />
              <StatCard title="Department Sections" value={sections.length} icon={Layers} color="teal" subtitle="Enrolled cohort sections" />
              <StatCard title="Curriculum Subjects" value={subjects.length} icon={BookOpen} color="green" subtitle="Semester credit courses" />
              <StatCard title="Attendance Threshold" value={`${threshold}%`} icon={ShieldCheck} color="navy" subtitle="Configured warning limit" />
            </div>

            {/* Department Summary Cards */}
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs">
              <h3 className="text-base font-bold text-slate-900 mb-4 flex items-center gap-2">
                <Building2 className="w-5 h-5 text-[#3F8F99]" />
                <span>Departmental Breakdown</span>
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {/* Render cards for each active academic department */}
                {departments.map(d => (
                  <div key={d.id} className="p-4 rounded-lg border border-slate-200 bg-slate-50">
                    <div className="flex justify-between items-center mb-2">
                      <span className="font-bold text-sm text-[#2F4858]">{d.code}</span>
                      <span className="text-xs bg-[#AAFFC7]/50 text-[#2F4858] font-semibold px-2 py-0.5 rounded border border-[#78DABE]">
                        {d.total_sections} Sections
                      </span>
                    </div>
                    <p className="text-xs text-slate-700 font-medium">{d.name}</p>
                    <div className="mt-3 text-xs text-slate-500 flex justify-between border-t border-slate-200 pt-2">
                      <span>Students: <strong>{d.total_students}</strong></span>
                      <span>Faculty: <strong>{d.total_faculty}</strong></span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: STUDENTS DIRECTORY */}
        {activeTab === 'students' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Student Directory</h2>
                <p className="text-sm text-slate-500">Manage individual student enrollment and credentials</p>
              </div>
              <button
                onClick={() => setIsStudentModalOpen(true)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-[#376A7B] hover:bg-[#2F4858] text-white rounded-lg text-sm font-semibold shadow-xs transition-colors cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Add Single Student</span>
              </button>
            </div>

            {/* Real-time search and department filtering toolbar */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 flex flex-col md:flex-row items-center gap-3">
              <div className="relative flex-1 w-full">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="text"
                  placeholder="Search by student ID, name, or email..."
                  value={studentSearch}
                  onChange={(e) => { 
                    setStudentSearch(e.target.value); 
                    setStudentPage(1); 
                  }}
                  className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#376A7B]"
                />
              </div>
              <select
                value={studentDeptFilter}
                onChange={(e) => { 
                  setStudentDeptFilter(e.target.value); 
                  setStudentPage(1); 
                }}
                className="w-full md:w-56 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#376A7B]"
              >
                <option value="">All Departments</option>
                {/* Populate department selection options */}
                {departments.map(d => (
                  <option key={d.id} value={d.id}>{d.code} - {d.name}</option>
                ))}
              </select>
            </div>

            {/* Students Data Grid */}
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-[#2F4858] text-white">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold">Student ID</th>
                      <th className="px-4 py-3 text-left font-semibold">Full Name</th>
                      <th className="px-4 py-3 text-left font-semibold">Department</th>
                      <th className="px-4 py-3 text-left font-semibold">Section</th>
                      <th className="px-4 py-3 text-left font-semibold">Semester</th>
                      <th className="px-4 py-3 text-left font-semibold">Email</th>
                      <th className="px-4 py-3 text-left font-semibold">Phone</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {/* Render empty state notice if no students match query */}
                    {students.length === 0 ? (
                      <tr>
                        <td colSpan="7" className="px-6 py-8 text-center text-slate-500 text-sm">
                          No student records found matching the query.
                        </td>
                      </tr>
                    ) : (
                      /* Iterate through student profile rows */
                      students.map(s => (
                        <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-3 font-mono font-semibold text-[#376A7B]">{s.student_id}</td>
                          <td className="px-4 py-3 font-medium text-slate-900">{s.full_name}</td>
                          <td className="px-4 py-3 font-semibold text-slate-700">{s.department_code}</td>
                          <td className="px-4 py-3">
                            <span className="px-2 py-0.5 rounded text-xs font-semibold bg-slate-100 text-slate-800 border border-slate-200">
                              {s.section_name}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-slate-600">Sem {s.semester}</td>
                          <td className="px-4 py-3 text-slate-500 font-mono text-xs">{s.email}</td>
                          <td className="px-4 py-3 text-slate-500 font-mono text-xs">{s.phone || '—'}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              
              {/* Pagination Controller */}
              <Pagination
                count={studentTotal}
                pageSize={20}
                currentPage={studentPage}
                onPageChange={(p) => setStudentPage(p)}
              />
            </div>
          </div>
        )}

        {/* TAB 3: FACULTY DIRECTORY */}
        {activeTab === 'faculty' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Faculty Directory</h2>
                <p className="text-sm text-slate-500">Manage institutional educators and designations</p>
              </div>
              <button
                onClick={() => setIsFacultyModalOpen(true)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-[#376A7B] hover:bg-[#2F4858] text-white rounded-lg text-sm font-semibold shadow-xs transition-colors cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Add Single Faculty</span>
              </button>
            </div>

            {/* Filter toolbar */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 flex flex-col md:flex-row items-center gap-3">
              <div className="relative flex-1 w-full">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="text"
                  placeholder="Search faculty by ID, name, email..."
                  value={facultySearch}
                  onChange={(e) => { 
                    setFacultySearch(e.target.value); 
                    setFacultyPage(1); 
                  }}
                  className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#376A7B]"
                />
              </div>
              <select
                value={facultyDeptFilter}
                onChange={(e) => { 
                  setFacultyDeptFilter(e.target.value); 
                  setFacultyPage(1); 
                }}
                className="w-full md:w-56 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#376A7B]"
              >
                <option value="">All Departments</option>
                {departments.map(d => (
                  <option key={d.id} value={d.id}>{d.code} - {d.name}</option>
                ))}
              </select>
            </div>

            {/* Faculty Table */}
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-[#2F4858] text-white">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold">Faculty ID</th>
                      <th className="px-4 py-3 text-left font-semibold">Full Name</th>
                      <th className="px-4 py-3 text-left font-semibold">Department</th>
                      <th className="px-4 py-3 text-left font-semibold">Designation</th>
                      <th className="px-4 py-3 text-left font-semibold">Email</th>
                      <th className="px-4 py-3 text-left font-semibold">Allocated Classes</th>
                      <th className="px-4 py-3 text-left font-semibold">Role</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {/* Iterate over faculty profile records */}
                    {faculty.map(f => (
                      <tr key={f.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3 font-mono font-semibold text-[#376A7B]">{f.faculty_id}</td>
                        <td className="px-4 py-3 font-medium text-slate-900">{f.full_name}</td>
                        <td className="px-4 py-3 font-semibold text-slate-700">{f.department_code}</td>
                        <td className="px-4 py-3 text-slate-600">{f.designation}</td>
                        <td className="px-4 py-3 text-slate-500 font-mono text-xs">{f.email}</td>
                        <td className="px-4 py-3 text-slate-600 font-semibold">{f.allocated_subjects_count} assigned</td>
                        <td className="px-4 py-3">
                          {/* Highlight Head of Department status badge */}
                          {f.is_hod ? (
                            <span className="px-2 py-0.5 rounded text-xs font-semibold bg-blue-100 text-blue-800">
                              HOD
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700">
                              Faculty
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination
                count={facultyTotal}
                pageSize={20}
                currentPage={facultyPage}
                onPageChange={(p) => setFacultyPage(p)}
              />
            </div>
          </div>
        )}

        {/* TAB 4: DEPARTMENTS & SECTIONS */}
        {activeTab === 'departments' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Academic Departments & Sections</h2>
                <p className="text-sm text-slate-500">Configure institutional academic organizational structures</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setIsDeptModalOpen(true)}
                  className="inline-flex items-center gap-2 px-3.5 py-2 bg-[#376A7B] hover:bg-[#2F4858] text-white rounded-lg text-xs font-semibold shadow-xs cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>New Department</span>
                </button>
                <button
                  onClick={() => setIsSectionModalOpen(true)}
                  className="inline-flex items-center gap-2 px-3.5 py-2 bg-[#53B4AF] hover:bg-[#3F8F99] text-white rounded-lg text-xs font-semibold shadow-xs cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>New Section</span>
                </button>
              </div>
            </div>

            {/* Grid of department organizational cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Map through each department to display enrolled cohort sections */}
              {departments.map(dept => {
                // Filter sections specifically belonging to current department
                const deptSections = sections.filter(s => s.department === dept.id);
                return (
                  <div key={dept.id} className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
                    <div className="flex items-start justify-between border-b border-slate-100 pb-3 mb-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-lg text-[#2F4858]">{dept.code}</span>
                          <span className="text-xs text-slate-500">({dept.name})</span>
                        </div>
                        <p className="text-xs text-[#376A7B] mt-0.5">
                          HOD: <strong>{dept.hod_name || 'Unassigned'}</strong> {dept.hod_institutional_id && `(${dept.hod_institutional_id})`}
                        </p>
                      </div>
                      <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-[#AAFFC7]/50 text-[#2F4858] border border-[#78DABE]">
                        {deptSections.length} Sections
                      </span>
                    </div>

                    <div>
                      <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Sections Configured:</h4>
                      <div className="flex flex-wrap gap-2">
                        {/* Check if any sections exist for this department */}
                        {deptSections.length === 0 ? (
                          <span className="text-xs text-slate-400">No sections added yet</span>
                        ) : (
                          deptSections.map(sec => (
                            <div key={sec.id} className="px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-xs flex items-center gap-2">
                              <span className="font-semibold text-slate-800">{sec.name}</span>
                              <span className="text-slate-400">•</span>
                              <span className="text-slate-500 font-mono text-[11px]">{sec.student_count} students</span>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 5: CURRICULUM SUBJECTS */}
        {activeTab === 'subjects' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Curriculum Subjects</h2>
                <p className="text-sm text-slate-500">Master subject codes and departmental offerings</p>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-[#2F4858] text-white">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold">Subject Code</th>
                    <th className="px-4 py-3 text-left font-semibold">Subject Name</th>
                    <th className="px-4 py-3 text-left font-semibold">Department</th>
                    <th className="px-4 py-3 text-left font-semibold">Semester</th>
                    <th className="px-4 py-3 text-left font-semibold">Credits</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {/* Iterate over all registered academic subjects */}
                  {subjects.map(s => (
                    <tr key={s.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-mono font-bold text-[#376A7B]">{s.code}</td>
                      <td className="px-4 py-3 font-medium text-slate-900">{s.name}</td>
                      <td className="px-4 py-3 font-semibold text-slate-700">{s.department_code}</td>
                      <td className="px-4 py-3 text-slate-600">Semester {s.semester}</td>
                      <td className="px-4 py-3 text-slate-600 font-semibold">{s.credits} Credits</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 6: BULK CSV ONBOARDING ENGINE */}
        {activeTab === 'import' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Bulk CSV Onboarding Engine</h2>
              <p className="text-sm text-slate-500">
                Two-Phase Workflow: Upload → Validate & Stage → Preview Diagnostics → Admin Confirm & Ingestion
              </p>
            </div>

            {/* Upload Control Card */}
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs">
              <form onSubmit={handleUploadCSV} className="space-y-4">
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer font-semibold text-sm">
                    <input
                      type="radio"
                      name="importType"
                      value="STUDENT"
                      checked={importType === 'STUDENT'}
                      onChange={() => { 
                        setImportType('STUDENT'); 
                        setPreviewBatch(null); 
                      }}
                      className="text-[#376A7B] focus:ring-[#376A7B]"
                    />
                    <span>Student Onboarding CSV</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer font-semibold text-sm">
                    <input
                      type="radio"
                      name="importType"
                      value="FACULTY"
                      checked={importType === 'FACULTY'}
                      onChange={() => { 
                        setImportType('FACULTY'); 
                        setPreviewBatch(null); 
                      }}
                      className="text-[#376A7B] focus:ring-[#376A7B]"
                    />
                    <span>Faculty Onboarding CSV</span>
                  </label>
                </div>

                <div className="border-2 border-dashed border-slate-300 rounded-xl p-6 text-center hover:bg-slate-50 transition-colors">
                  <Upload className="w-8 h-8 text-[#376A7B] mx-auto mb-2" />
                  <p className="text-sm font-medium text-slate-700">Choose a structured CSV file</p>
                  <p className="text-xs text-slate-500 mt-1">
                    {/* Display entity specific column requirements */}
                    {importType === 'STUDENT'
                      ? 'Expected Columns: Name, Date of Birth, Department, Section, Academic Year, Semester, Email, Phone'
                      : 'Expected Columns: Name, Date of Birth, Department, Designation, Email, Phone'}
                  </p>
                  <input
                    type="file"
                    accept=".csv"
                    onChange={(e) => setSelectedFile(e.target.files[0])}
                    className="mt-4 block mx-auto text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-[#376A7B] file:text-white hover:file:bg-[#2F4858] cursor-pointer"
                  />
                  {selectedFile && (
                    <p className="mt-2 text-xs font-semibold text-[#2F4858]">Selected: {selectedFile.name}</p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={uploading || !selectedFile}
                  className="px-5 py-2.5 bg-[#376A7B] hover:bg-[#2F4858] text-white rounded-lg text-sm font-semibold shadow-xs transition-colors flex items-center gap-2 disabled:opacity-50 cursor-pointer"
                >
                  {uploading ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Parsing & Validating CSV...</span>
                    </>
                  ) : (
                    <>
                      <FileText className="w-4 h-4" />
                      <span>Parse & Validate CSV</span>
                    </>
                  )}
                </button>
              </form>
            </div>

            {/* PREVIEW & DIAGNOSTICS CARD (Rendered after successful Phase 1 validation) */}
            {previewBatch && (
              <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-5 animate-in fade-in duration-300">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-4">
                  <div>
                    <h3 className="text-lg font-bold text-slate-900">Validation Preview Report</h3>
                    <p className="text-xs text-slate-500 font-mono">Batch ID: {previewBatch.batch_id} • File: {previewBatch.file_name}</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={handleConfirmBatch}
                      disabled={confirming || previewBatch.valid_rows === 0}
                      className="px-5 py-2 bg-[#2F4858] hover:bg-[#376A7B] text-white text-sm font-bold rounded-lg shadow-sm transition-colors flex items-center gap-2 disabled:opacity-50 cursor-pointer"
                    >
                      {confirming ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>Importing Records...</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="w-4 h-4 text-[#AAFFC7]" />
                          <span>Confirm & Ingest ({previewBatch.valid_rows} Valid Rows)</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Metric Scorecards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <p className="text-xs text-slate-500 font-semibold">Total Rows Parsed</p>
                    <p className="text-xl font-bold text-slate-900">{previewBatch.total_rows}</p>
                  </div>
                  <div className="p-3 bg-[#AAFFC7]/30 rounded-lg border border-[#78DABE]">
                    <p className="text-xs text-[#2F4858] font-semibold">Valid Rows (Ready)</p>
                    <p className="text-xl font-bold text-[#2F4858]">{previewBatch.valid_rows}</p>
                  </div>
                  <div className="p-3 bg-red-50 rounded-lg border border-red-200">
                    <p className="text-xs text-red-700 font-semibold">Invalid / Corrupted Rows</p>
                    <p className="text-xl font-bold text-red-700">{previewBatch.invalid_rows}</p>
                  </div>
                  <div className="p-3 bg-amber-50 rounded-lg border border-amber-200">
                    <p className="text-xs text-amber-700 font-semibold">Duplicate Records</p>
                    <p className="text-xl font-bold text-amber-700">{previewBatch.duplicate_rows}</p>
                  </div>
                </div>

                {/* Detailed Diagnostic Errors Table (Displayed if any row level issues detected) */}
                {previewBatch.row_errors?.length > 0 && (
                  <div className="mt-4 border border-red-200 rounded-lg overflow-hidden">
                    <div className="bg-red-50 px-4 py-2 border-b border-red-200 text-xs font-bold text-red-800 flex items-center gap-1.5">
                      <AlertCircle className="w-4 h-4 text-red-600" />
                      <span>Validation Errors Diagnostics ({previewBatch.row_errors.length} issues detected)</span>
                    </div>
                    <div className="max-h-60 overflow-y-auto">
                      <table className="min-w-full text-xs divide-y divide-slate-100">
                        <thead className="bg-slate-50 text-slate-700">
                          <tr>
                            <th className="px-3 py-2 text-left">CSV Row #</th>
                            <th className="px-3 py-2 text-left">Field</th>
                            <th className="px-3 py-2 text-left">Raw Value</th>
                            <th className="px-3 py-2 text-left">Validation Error Reason</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-mono">
                          {/* Map through each granular validation failure */}
                          {previewBatch.row_errors.map(err => (
                            <tr key={err.id} className="hover:bg-red-50/50">
                              <td className="px-3 py-1.5 font-bold text-slate-800">Row {err.row_number}</td>
                              <td className="px-3 py-1.5 text-slate-700 font-semibold">{err.field_name}</td>
                              <td className="px-3 py-1.5 text-slate-500">{err.raw_value || '<empty>'}</td>
                              <td className="px-3 py-1.5 text-red-600 font-sans font-medium">{err.error_reason}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Valid Staged Rows Sample */}
                {previewBatch.preview_valid_rows?.length > 0 && (
                  <div>
                    <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                      Sample Valid Rows to be Imported (Showing first {previewBatch.preview_valid_rows.length}):
                    </h4>
                    <div className="max-h-56 overflow-y-auto border border-slate-200 rounded-lg">
                      <table className="min-w-full text-xs divide-y divide-slate-100 font-mono">
                        <thead className="bg-slate-50 text-slate-700 font-sans">
                          <tr>
                            <th className="px-3 py-2 text-left">Name</th>
                            <th className="px-3 py-2 text-left">Department</th>
                            <th className="px-3 py-2 text-left">{importType === 'STUDENT' ? 'Section' : 'Designation'}</th>
                            <th className="px-3 py-2 text-left">Email</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {/* Map through staged valid sample rows */}
                          {previewBatch.preview_valid_rows.map((row, idx) => (
                            <tr key={idx} className="hover:bg-slate-50">
                              <td className="px-3 py-1.5 font-sans font-medium text-slate-900">{row.name}</td>
                              <td className="px-3 py-1.5 text-slate-700 font-bold">{row.department_code}</td>
                              <td className="px-3 py-1.5 text-slate-600">{row.section_name || row.designation}</td>
                              <td className="px-3 py-1.5 text-slate-500">{row.email}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Import Summary Result Banner */}
            {importSummary && (
              <div className="bg-[#AAFFC7]/30 border border-[#78DABE] rounded-xl p-6 text-center space-y-2">
                <CheckCircle2 className="w-10 h-10 text-[#3F8F99] mx-auto" />
                <h3 className="text-lg font-bold text-[#2F4858]">Import Successfully Completed!</h3>
                <p className="text-sm text-slate-700 font-medium">
                  Created and onboarded <strong>{importSummary.imported_rows}</strong> records with system-generated institutional IDs.
                </p>
              </div>
            )}
          </div>
        )}

        {/* TAB 7: BULK IMPORT AUDIT HISTORY */}
        {activeTab === 'history' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Bulk Import Audit History</h2>
              <p className="text-sm text-slate-500">Historical record of all bulk onboarding batches and row metrics</p>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-[#2F4858] text-white">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold">Date & Time</th>
                    <th className="px-4 py-3 text-left font-semibold">Import Type</th>
                    <th className="px-4 py-3 text-left font-semibold">File Name</th>
                    <th className="px-4 py-3 text-left font-semibold">Total Rows</th>
                    <th className="px-4 py-3 text-left font-semibold">Imported</th>
                    <th className="px-4 py-3 text-left font-semibold">Invalid / Dups</th>
                    <th className="px-4 py-3 text-left font-semibold">Status</th>
                    <th className="px-4 py-3 text-left font-semibold">Admin</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {/* Iterate over all historic import batches */}
                  {importHistory.map(h => (
                    <tr key={h.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 text-xs text-slate-600 font-mono">
                        {new Date(h.created_at).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 font-semibold text-slate-800">{h.import_type_display}</td>
                      <td className="px-4 py-3 text-slate-700 text-xs font-mono">{h.file_name}</td>
                      <td className="px-4 py-3 font-semibold text-slate-900">{h.total_rows}</td>
                      <td className="px-4 py-3 font-bold text-[#376A7B]">{h.imported_rows}</td>
                      <td className="px-4 py-3 text-xs">
                        <span className="text-red-600 font-semibold">{h.invalid_rows} inv</span> / {' '}
                        <span className="text-amber-600 font-semibold">{h.duplicate_rows} dup</span>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={h.status} />
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">{h.created_by_name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 8: SYSTEM CONFIGURATION */}
        {activeTab === 'settings' && (
          <div className="space-y-6 max-w-2xl">
            <div>
              <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Institutional System Configuration</h2>
              <p className="text-sm text-slate-500">Configure global parameters and attendance thresholds</p>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs">
              <form onSubmit={handleSaveThreshold} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Minimum Attendance Threshold (%)
                  </label>
                  <p className="text-xs text-slate-500 mb-2">
                    Students below this percentage will be automatically flagged for academic warning across dashboards.
                  </p>
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      step="0.5"
                      min="50"
                      max="100"
                      value={threshold}
                      onChange={(e) => setThreshold(e.target.value)}
                      className="w-32 px-3 py-2 border border-slate-300 rounded-lg text-sm font-bold font-mono focus:ring-2 focus:ring-[#376A7B]"
                    />
                    <span className="text-sm font-semibold text-slate-600">%</span>
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    className="px-4 py-2 bg-[#376A7B] hover:bg-[#2F4858] text-white rounded-lg text-sm font-semibold shadow-xs transition-colors cursor-pointer"
                  >
                    Save Institutional Threshold
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

      </main>

      {/* MODAL: Register Individual Student */}
      <Modal isOpen={isStudentModalOpen} onClose={() => setIsStudentModalOpen(false)} title="Register Individual Student">
        <form onSubmit={handleCreateStudent} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Full Name *</label>
              <input
                type="text" required
                value={studentForm.full_name}
                onChange={(e) => setStudentForm({ ...studentForm, full_name: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Date of Birth *</label>
              <input
                type="date" required
                value={studentForm.date_of_birth}
                onChange={(e) => setStudentForm({ ...studentForm, date_of_birth: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Department *</label>
              <select
                required
                value={studentForm.department}
                onChange={(e) => setStudentForm({ ...studentForm, department: e.target.value, section: '' })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              >
                <option value="">Select Department</option>
                {departments.map(d => <option key={d.id} value={d.id}>{d.code} - {d.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Section *</label>
              <select
                required
                disabled={!studentForm.department}
                value={studentForm.section}
                onChange={(e) => setStudentForm({ ...studentForm, section: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm disabled:opacity-50"
              >
                <option value="">Select Section</option>
                {/* Dynamically filter sections by selected department */}
                {sections.filter(s => String(s.department) === String(studentForm.department)).map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Email *</label>
              <input
                type="email" required
                value={studentForm.email}
                onChange={(e) => setStudentForm({ ...studentForm, email: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Phone</label>
              <input
                type="text"
                value={studentForm.phone}
                onChange={(e) => setStudentForm({ ...studentForm, phone: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsStudentModalOpen(false)}
              className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-[#376A7B] hover:bg-[#2F4858] text-white rounded-lg text-xs font-bold cursor-pointer"
            >
              Register Student
            </button>
          </div>
        </form>
      </Modal>

      {/* MODAL: Onboard Individual Faculty */}
      <Modal isOpen={isFacultyModalOpen} onClose={() => setIsFacultyModalOpen(false)} title="Onboard Individual Faculty Member">
        <form onSubmit={handleCreateFaculty} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Full Name *</label>
              <input
                type="text" required
                value={facultyForm.full_name}
                onChange={(e) => setFacultyForm({ ...facultyForm, full_name: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Date of Birth *</label>
              <input
                type="date" required
                value={facultyForm.date_of_birth}
                onChange={(e) => setFacultyForm({ ...facultyForm, date_of_birth: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Department *</label>
              <select
                required
                value={facultyForm.department}
                onChange={(e) => setFacultyForm({ ...facultyForm, department: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              >
                <option value="">Select Department</option>
                {departments.map(d => <option key={d.id} value={d.id}>{d.code} - {d.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Designation</label>
              <select
                value={facultyForm.designation}
                onChange={(e) => setFacultyForm({ ...facultyForm, designation: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              >
                <option value="Assistant Professor">Assistant Professor</option>
                <option value="Associate Professor">Associate Professor</option>
                <option value="Professor">Professor</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Email *</label>
              <input
                type="email" required
                value={facultyForm.email}
                onChange={(e) => setFacultyForm({ ...facultyForm, email: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Phone</label>
              <input
                type="text"
                value={facultyForm.phone}
                onChange={(e) => setFacultyForm({ ...facultyForm, phone: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsFacultyModalOpen(false)}
              className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-[#376A7B] hover:bg-[#2F4858] text-white rounded-lg text-xs font-bold cursor-pointer"
            >
              Onboard Faculty
            </button>
          </div>
        </form>
      </Modal>

      {/* MODAL: Create New Academic Department */}
      <Modal isOpen={isDeptModalOpen} onClose={() => setIsDeptModalOpen(false)} title="Create Academic Department">
        <form onSubmit={handleCreateDept} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Department Code *</label>
            <input
              type="text" required placeholder="e.g. AI, BIO, CHE"
              value={deptForm.code}
              onChange={(e) => setDeptForm({ ...deptForm, code: e.target.value.toUpperCase() })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Full Department Name *</label>
            <input
              type="text" required placeholder="e.g. Artificial Intelligence & Data Science"
              value={deptForm.name}
              onChange={(e) => setDeptForm({ ...deptForm, name: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
            />
          </div>
          <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
            <button type="button" onClick={() => setIsDeptModalOpen(false)} className="px-4 py-2 border rounded-lg text-xs">Cancel</button>
            <button type="submit" className="px-4 py-2 bg-[#376A7B] text-white rounded-lg text-xs font-bold">Create Department</button>
          </div>
        </form>
      </Modal>

      {/* MODAL: Create New Department Section */}
      <Modal isOpen={isSectionModalOpen} onClose={() => setIsSectionModalOpen(false)} title="Create Department Section">
        <form onSubmit={handleCreateSection} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Department *</label>
            <select
              required
              value={sectionForm.department}
              onChange={(e) => setSectionForm({ ...sectionForm, department: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
            >
              <option value="">Select Department</option>
              {departments.map(d => <option key={d.id} value={d.id}>{d.code} - {d.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Section Name *</label>
            <input
              type="text" required placeholder="e.g. CSE-4, CSM-3"
              value={sectionForm.name}
              onChange={(e) => setSectionForm({ ...sectionForm, name: e.target.value.toUpperCase() })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono"
            />
          </div>
          <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
            <button type="button" onClick={() => setIsSectionModalOpen(false)} className="px-4 py-2 border rounded-lg text-xs">Cancel</button>
            <button type="submit" className="px-4 py-2 bg-[#376A7B] text-white rounded-lg text-xs font-bold">Create Section</button>
          </div>
        </form>
      </Modal>

    </div>
  );
}
