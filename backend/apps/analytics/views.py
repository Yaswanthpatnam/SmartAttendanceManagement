"""
Analytics and Institutional KPI Controllers
===========================================
This module defines endpoints providing executive oversight and actionable alerts:
1. College-wide macro KPIs for Principal, Vice Principal, and Administration.
2. Scoped departmental metrics and risk monitors for HODs.
3. Defaulter registers highlighting students whose attendance breaches safety thresholds.
4. Smart emergency faculty substitution assignments.
"""

from rest_framework import views, permissions, status, response
from django.shortcuts import get_object_or_404
from django.core.exceptions import PermissionDenied
from apps.core.models import User
from apps.core.permissions import IsPrincipalOrVPRole, IsHODRole
from apps.academic.models import Department, ClassSession, FacultyProfile
from apps.analytics.models import FacultySubstitution
from apps.analytics.services.exception_service import (
    get_college_macro_analytics,
    get_department_macro_analytics,
    get_low_attendance_students
)


class CollegeOverviewAnalyticsView(views.APIView):
    """
    Macro Institutional KPI dashboard providing real-time executive visibility
    for Principal, Vice Principal, and Central Academic Administration.
    """

    permission_classes = [IsPrincipalOrVPRole]

    def get(self, request):
        """
        Retrieves institutional-level key performance metrics.
        """
        # Execute cross-departmental aggregation engine
        macro_analytics_data = get_college_macro_analytics()
        return response.Response(macro_analytics_data)


class DepartmentOverviewAnalyticsView(views.APIView):
    """
    Scoped Departmental KPI dashboard for HODs and executive drill-down views.
    """

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        """
        Returns departmental attendance statistics, faculty status, and section summaries.
        """
        user = request.user
        department_query_param = request.query_params.get('department_id')

        # Determine target department according to requesting user's organizational role
        if user.role == User.Role.HOD:
            # HOD can only inspect their assigned department
            target_department = getattr(user, 'managed_department', None)
            if not target_department and hasattr(user, 'faculty_profile'):
                target_department = user.faculty_profile.department

            # Ensure HOD has a registered departmental assignment
            if not target_department:
                raise PermissionDenied("You are not currently assigned to manage any academic department.")

        elif user.role in [User.Role.ADMIN, User.Role.PRINCIPAL, User.Role.VICE_PRINCIPAL]:
            # Institutional leadership can query any department or default to the primary one
            if department_query_param:
                target_department = get_object_or_404(Department, pk=department_query_param)
            else:
                # Default to the first registered department when no specific ID is provided
                target_department = Department.objects.first()

        else:
            # Unauthorized roles (Students, non-HOD Faculty) cannot access macro departmental analytics
            raise PermissionDenied("You do not possess clearance for departmental analytics.")

        # Handle case where no department exists in database
        if not target_department:
            return response.Response(
                {'error': 'No academic departments are registered in the system.'},
                status=status.HTTP_404_NOT_FOUND
            )

        # Compute granular departmental analytics
        department_analytics_data = get_department_macro_analytics(target_department)
        return response.Response(department_analytics_data)


class LowAttendanceStudentsView(views.APIView):
    """
    Exception Detection Service: Identifies enrolled students whose cumulative attendance
    falls below statutory threshold requirements (default 75%).
    """

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        """
        Returns a list of students with low attendance, scoped appropriately by role.
        """
        user = request.user
        department_param = request.query_params.get('department_id')
        section_param = request.query_params.get('section_id')
        threshold_param = request.query_params.get('threshold')

        # Parse custom threshold if provided by client
        if threshold_param:
            custom_threshold = float(threshold_param)
        else:
            custom_threshold = None

        # Apply role-based scoping to query parameters
        if user.role == User.Role.HOD:
            # Enforce HOD's departmental boundaries
            hod_department = getattr(user, 'managed_department', None)
            if not hod_department and hasattr(user, 'faculty_profile'):
                hod_department = user.faculty_profile.department

            if hod_department:
                department_param = hod_department.id
            else:
                department_param = None

        elif user.role in [User.Role.FACULTY, User.Role.STUDENT]:
            # Faculty and students are barred from querying institutional low-attendance registers
            raise PermissionDenied("You do not have administrative authorization to inspect low-attendance registers.")

        else:
            # Institutional leadership (Principal, VP, Admin) can review across any department
            pass

        # Query low-attendance records via analytics service
        defaulters_data = get_low_attendance_students(
            department_id=department_param,
            section_id=section_param,
            threshold=custom_threshold
        )
        return response.Response(defaulters_data)


class AssignFacultySubstitutionView(views.APIView):
    """
    Academic Continuity Controller: Allows department heads to assign a substitute
    instructor to a class session when the scheduled faculty member is unavailable.
    """

    permission_classes = [IsHODRole]

    def post(self, request):
        """
        Creates or updates a faculty substitution record and rebinds session substitute.
        """
        target_session_id = request.data.get('session_id')
        substitute_id = request.data.get('substitute_faculty_id')
        substitution_notes = request.data.get('notes', '')

        # Fetch session and candidate substitute faculty records
        target_session = get_object_or_404(ClassSession, pk=target_session_id)
        substitute_faculty = get_object_or_404(FacultyProfile, pk=substitute_id)

        user = request.user

        # Enforce departmental authorization bounds for HOD
        if user.role == User.Role.HOD:
            hod_department = getattr(user, 'managed_department', None)
            if not hod_department and hasattr(user, 'faculty_profile'):
                hod_department = user.faculty_profile.department

            # Verify session belongs to the HOD's department
            session_department = target_session.allocation.subject.department
            if session_department != hod_department:
                raise PermissionDenied("Cannot assign faculty substitutions for sessions outside your department.")

        # Bind substitute faculty to the class session
        target_session.substitute_faculty = substitute_faculty
        target_session.save()

        # Create or update substitution audit history
        substitution_record, was_created = FacultySubstitution.objects.update_or_create(
            session=target_session,
            defaults={
                'absent_faculty': target_session.allocation.faculty,
                'substitute_faculty': substitute_faculty,
                'assigned_by': user,
                'notes': substitution_notes
            }
        )

        return response.Response({
            'message': 'Substitute instructor successfully designated for class session.',
            'session_id': target_session.id,
            'substitute_name': substitute_faculty.user.get_full_name(),
            'notes': substitution_notes
        }, status=status.HTTP_200_OK)
