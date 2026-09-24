"""
Main URL Routing Configuration
===============================
This module registers all institutional API endpoints and viewsets:
1. Authentication endpoints (JWT token issuance, token refresh, active user profile).
2. Academic master data routers (departments, semesters, sections, subjects, faculty allocations, timetable sessions).
3. Attendance tracking endpoints (rosters, batch marking, audit corrections, individual student histories).
4. Bulk CSV onboarding pipeline (student/faculty file upload, validation preview, transactional commit).
5. Macro institutional analytics and operational alert endpoints.
"""

from django.contrib import admin
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenRefreshView

from apps.core.views import CustomTokenObtainPairView, CurrentUserView, SystemSettingViewSet
from apps.academic.views import (
    DepartmentViewSet, AcademicYearViewSet, SemesterViewSet,
    SectionViewSet, SubjectViewSet, FacultyViewSet,
    StudentViewSet, FacultyAllocationViewSet, ClassSessionViewSet
)
from apps.attendance.views import (
    SessionRosterView, SubmitSessionAttendanceView,
    CorrectAttendanceRecordView, AttendanceCorrectionLogViewSet,
    StudentAttendanceSummaryView, StudentAttendanceHistoryView,
    FacultyBiometricLogViewSet
)
from apps.imports.views import (
    UploadStudentCSVView, UploadFacultyCSVView,
    BatchPreviewDetailView, ConfirmImportBatchView, ImportHistoryViewSet
)
from apps.analytics.views import (
    CollegeOverviewAnalyticsView, DepartmentOverviewAnalyticsView,
    LowAttendanceStudentsView, AssignFacultySubstitutionView
)

# Instantiate DefaultRouter for RESTful ViewSets
router = DefaultRouter()

# Core institutional configuration parameters
router.register(r'core/settings', SystemSettingViewSet, basename='system-settings')

# Academic curriculum and organizational hierarchy
router.register(r'academic/departments', DepartmentViewSet, basename='departments')
router.register(r'academic/academic-years', AcademicYearViewSet, basename='academic-years')
router.register(r'academic/semesters', SemesterViewSet, basename='semesters')
router.register(r'academic/sections', SectionViewSet, basename='sections')
router.register(r'academic/subjects', SubjectViewSet, basename='subjects')
router.register(r'academic/faculty', FacultyViewSet, basename='faculty')
router.register(r'academic/students', StudentViewSet, basename='students')
router.register(r'academic/allocations', FacultyAllocationViewSet, basename='faculty-allocations')
router.register(r'academic/sessions', ClassSessionViewSet, basename='class-sessions')

# Attendance logging and audit trail routers
router.register(r'attendance/corrections', AttendanceCorrectionLogViewSet, basename='attendance-corrections')
router.register(r'attendance/biometrics', FacultyBiometricLogViewSet, basename='faculty-biometrics')

# Bulk onboarding batch history
router.register(r'imports/history', ImportHistoryViewSet, basename='import-history')

urlpatterns = [
    # Built-in Django administration portal
    path('admin/', admin.site.urls),

    # Authentication & User Profile Endpoints
    path('api/auth/login/', CustomTokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('api/auth/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('api/auth/me/', CurrentUserView.as_view(), name='current_user'),

    # Attendance Marking and Student Summary Operations
    path('api/attendance/session/<int:session_id>/roster/', SessionRosterView.as_view(), name='session_roster'),
    path('api/attendance/session/<int:session_id>/submit/', SubmitSessionAttendanceView.as_view(), name='submit_session_attendance'),
    path('api/attendance/record/<int:record_id>/correct/', CorrectAttendanceRecordView.as_view(), name='correct_attendance_record'),
    path('api/attendance/student/summary/', StudentAttendanceSummaryView.as_view(), name='self_student_summary'),
    path('api/attendance/student/<str:student_id>/summary/', StudentAttendanceSummaryView.as_view(), name='staff_student_summary'),
    path('api/attendance/student/history/', StudentAttendanceHistoryView.as_view(), name='self_student_history'),
    path('api/attendance/student/<str:student_id>/history/', StudentAttendanceHistoryView.as_view(), name='staff_student_history'),

    # Two-Phase Bulk Onboarding Workflows
    path('api/imports/students/upload/', UploadStudentCSVView.as_view(), name='upload_student_csv'),
    path('api/imports/faculty/upload/', UploadFacultyCSVView.as_view(), name='upload_faculty_csv'),
    path('api/imports/batch/<uuid:batch_id>/preview/', BatchPreviewDetailView.as_view(), name='batch_preview'),
    path('api/imports/batch/<uuid:batch_id>/confirm/', ConfirmImportBatchView.as_view(), name='batch_confirm'),

    # Institutional Analytics and Academic Continuity Alerts
    path('api/analytics/college-overview/', CollegeOverviewAnalyticsView.as_view(), name='college_overview'),
    path('api/analytics/department-overview/', DepartmentOverviewAnalyticsView.as_view(), name='department_overview'),
    path('api/analytics/low-attendance/', LowAttendanceStudentsView.as_view(), name='low_attendance_students'),
    path('api/analytics/substitution/', AssignFacultySubstitutionView.as_view(), name='faculty_substitution'),

    # Mount automated router endpoints
    path('api/', include(router.urls)),
]
