/**
 * Unified API Client Service
 * ==========================
 * Configures Axios HTTP client with JWT interceptors, automatic token renewal,
 * dynamic backend URL discovery, and modular domain service methods.
 */

import axios from 'axios';

// Dynamically determine the backend API base endpoint with resilient /api normalization
const getApiBaseUrl = () => {
  const envUrl = import.meta.env.VITE_API_URL;
  if (envUrl) {
    const trimmed = envUrl.trim().replace(/\/$/, '');
    // Ensure /api suffix is appended only once
    return trimmed.endsWith('/api') ? trimmed : `${trimmed}/api`;
  }
  return import.meta.env.PROD ? '/api' : 'http://127.0.0.1:8000/api';
};

const API_BASE_URL = getApiBaseUrl();

// Create configured Axios instance
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

/**
 * Request Interceptor: Injects active Bearer JWT token from storage into outgoing HTTP headers.
 */
apiClient.interceptors.request.use(
  (config) => {
    // Read JWT access token from localStorage
    const accessToken = localStorage.getItem('access_token');
    if (accessToken) {
      config.headers.Authorization = `Bearer ${accessToken}`;
    }
    return config;
  },
  (requestError) => {
    // Forward request failure
    return Promise.reject(requestError);
  }
);

/**
 * Response Interceptor: Intercepts 401 Unauthorized errors and attempts refresh token rotation.
 */
apiClient.interceptors.response.use(
  (response) => {
    // Forward successful responses directly
    return response;
  },
  async (responseError) => {
    const originalRequestConfig = responseError.config;

    // Check if error status is 401 Unauthorized and retry hasn't occurred yet
    if (responseError.response?.status === 401 && !originalRequestConfig._retry) {
      originalRequestConfig._retry = true;
      const storedRefreshToken = localStorage.getItem('refresh_token');

      // If refresh token exists, attempt renewal
      if (storedRefreshToken) {
        try {
          // Request new access token from refresh endpoint
          const refreshResponse = await axios.post(`${API_BASE_URL}/auth/refresh/`, {
            refresh: storedRefreshToken,
          });
          const newAccessToken = refreshResponse.data.access;

          // Store new token in browser storage
          localStorage.setItem('access_token', newAccessToken);

          // Update default authorization header and retry original failed request
          apiClient.defaults.headers.common['Authorization'] = `Bearer ${newAccessToken}`;
          originalRequestConfig.headers['Authorization'] = `Bearer ${newAccessToken}`;

          return apiClient(originalRequestConfig);
        } catch (refreshFailure) {
          // If refresh token has expired or is invalid, purge credentials and force logout
          localStorage.removeItem('access_token');
          localStorage.removeItem('refresh_token');
          localStorage.removeItem('user_profile');
          window.location.href = '/';
        }
      } else {
        // No refresh token available, redirect user to landing
        localStorage.clear();
        window.location.href = '/';
      }
    }

    return Promise.reject(responseError);
  }
);

/**
 * Domain Service Catalog
 */
export const api = {
  // Authentication & Identity Endpoints
  auth: {
    login: (username, password) => apiClient.post('/auth/login/', { username, password }),
    getCurrentUser: () => apiClient.get('/auth/me/'),
  },

  // Academic Structure and Roster Management
  academic: {
    getDepartments: (params) => apiClient.get('/academic/departments/', { params: params || { all: 'true' } }),
    createDepartment: (data) => apiClient.post('/academic/departments/', data),
    getSections: (paramsOrDeptId) => {
      const params = typeof paramsOrDeptId === 'object' && paramsOrDeptId !== null
        ? paramsOrDeptId
        : (paramsOrDeptId ? { department: paramsOrDeptId, all: 'true' } : { all: 'true' });
      return apiClient.get('/academic/sections/', { params });
    },
    createSection: (data) => apiClient.post('/academic/sections/', data),
    getSectionAttendanceSummary: (sectionId, date) => apiClient.get(`/academic/sections/${sectionId}/attendance-summary/`, { params: { date } }),
    getSectionCounsellorReport: (sectionId) => apiClient.get(`/academic/sections/${sectionId}/counsellor-report/`),
    advanceSectionSemester: (sectionId) => apiClient.post(`/academic/sections/${sectionId}/advance-semester/`),
    assignSectionCounsellor: (sectionId, facultyId) => apiClient.post(`/academic/sections/${sectionId}/assign-counsellor/`, { faculty_id: facultyId }),
    getSubjects: (params) => apiClient.get('/academic/subjects/', { params: params || { all: 'true' } }),
    createSubject: (data) => apiClient.post('/academic/subjects/', data),
    getAcademicYears: (params) => apiClient.get('/academic/academic-years/', { params: params || { all: 'true' } }),
    getFaculty: (params) => apiClient.get('/academic/faculty/', { params: params || { all: 'true' } }),
    createFaculty: (data) => apiClient.post('/academic/faculty/', data),
    getStudents: (params) => apiClient.get('/academic/students/', { params }),
    createStudent: (data) => apiClient.post('/academic/students/', data),
    getAllocations: (params) => apiClient.get('/academic/allocations/', { params: params || { all: 'true' } }),
    createAllocation: (data) => apiClient.post('/academic/allocations/', data),
    getSessions: (params) => apiClient.get('/academic/sessions/', { params }),
    createSession: (data) => apiClient.post('/academic/sessions/', data),
  },

  // Student Attendance Recording and Histories
  attendance: {
    getSessionRoster: (sessionId) => apiClient.get(`/attendance/session/${sessionId}/roster/`),
    submitSessionAttendance: (sessionId, records) => apiClient.post(`/attendance/session/${sessionId}/submit/`, { records }),
    correctRecord: (recordId, newStatus, reason) => apiClient.post(`/attendance/record/${recordId}/correct/`, { new_status: newStatus, reason }),
    getStudentSummary: (studentId) => {
      // Branch query path based on whether target student ID is provided
      const targetEndpoint = studentId ? `/attendance/student/${studentId}/summary/` : '/attendance/student/summary/';
      return apiClient.get(targetEndpoint);
    },
    getStudentHistory: (studentId, params) => {
      // Branch history endpoint
      const targetEndpoint = studentId ? `/attendance/student/${studentId}/history/` : '/attendance/student/history/';
      return apiClient.get(targetEndpoint, { params });
    },
    getCorrectionsLog: () => apiClient.get('/attendance/corrections/'),
    getBiometricLogs: (date) => apiClient.get('/attendance/biometrics/', { params: { date } }),
  },

  // Bulk CSV Onboarding Pipeline
  imports: {
    uploadStudents: (formData) => apiClient.post('/imports/students/upload/', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    }),
    uploadFaculty: (formData) => apiClient.post('/imports/faculty/upload/', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    }),
    getBatchPreview: (batchId) => apiClient.get(`/imports/batch/${batchId}/preview/`),
    confirmBatch: (batchId) => apiClient.post(`/imports/batch/${batchId}/confirm/`),
    getHistory: () => apiClient.get('/imports/history/'),
  },

  // Executive Analytics and Continuity Services
  analytics: {
    getCollegeOverview: () => apiClient.get('/analytics/college-overview/'),
    getDepartmentOverview: (departmentId) => apiClient.get('/analytics/department-overview/', { params: { department_id: departmentId } }),
    getLowAttendance: (params) => apiClient.get('/analytics/low-attendance/', { params }),
    assignSubstitution: (data) => apiClient.post('/analytics/substitution/', data),
  },

  // System Configuration Settings
  settings: {
    getSettings: () => apiClient.get('/core/settings/'),
    updateSetting: (settingId, data) => apiClient.patch(`/core/settings/${settingId}/`, data),
  }
};

export default api;
