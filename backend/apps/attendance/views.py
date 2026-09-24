"""
Attendance API Views and Controllers
====================================
This module provides RESTful API endpoints for:
1. Fetching session rosters with pre-populated attendance states.
2. Submitting batch attendance records for a class session.
3. Performing audit-tracked attendance corrections with mandatory rationale.
4. Querying individual student attendance metrics (summary and historical breakdown).
5. Reviewing faculty biometric punch logs.
"""

from rest_framework import viewsets, views, permissions, status, response
from django.shortcuts import get_object_or_404
from django.core.exceptions import PermissionDenied, ValidationError
from apps.core.models import User
from apps.academic.models import ClassSession, StudentProfile
from apps.attendance.models import AttendanceRecord, AttendanceCorrectionLog, FacultyBiometricLog
from apps.attendance.serializers import (
    AttendanceRecordSerializer,
    SubmitSessionAttendanceSerializer,
    AttendanceCorrectionSerializer,
    AttendanceCorrectionLogSerializer,
    FacultyBiometricLogSerializer
)
from apps.attendance.services.attendance_service import (
    submit_session_attendance,
    correct_attendance_record,
    get_student_attendance_summary
)


class SessionRosterView(views.APIView):
    """
    Retrieves the complete student roster for an active class session.
    Allows the faculty or substitute instructor to mark or update attendance.
    """

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, session_id):
        """
        Handles GET requests to load session metadata and student enrollment list.
        """
        # Fetch target class session along with related faculty, subject, and section info
        session = get_object_or_404(
            ClassSession.objects.select_related(
                'allocation__faculty__user',
                'allocation__subject',
                'allocation__section__department',
                'substitute_faculty__user'
            ),
            pk=session_id
        )

        user = request.user

        # Evaluate whether the current user is the primarily assigned instructor
        is_assigned_faculty = (session.allocation.faculty.user == user)

        # Evaluate whether the current user is designated as the official substitute
        is_substitute_faculty = bool(session.substitute_faculty and session.substitute_faculty.user == user)

        # Check if the user possesses system-wide administrative privileges
        is_administrator = (user.role == User.Role.ADMIN)

        # Determine whether the user is an HOD overseeing this specific academic department
        is_department_hod = False
        if user.role == User.Role.HOD:
            # First check if the user has an explicitly assigned managed department
            department = getattr(user, 'managed_department', None)
            if not department and hasattr(user, 'faculty_profile'):
                # Fallback to the faculty profile department if managed_department is unset
                department = user.faculty_profile.department
            
            # Compare department instance with the session subject's department
            is_department_hod = (department == session.allocation.subject.department)
        else:
            # Non-HOD roles cannot claim department head access
            is_department_hod = False

        # Verify overall authorization: instructor, substitute, HOD, principal, VP, or admin
        has_authorized_role = (
            is_assigned_faculty or
            is_substitute_faculty or
            is_administrator or
            is_department_hod or
            user.role in [User.Role.PRINCIPAL, User.Role.VICE_PRINCIPAL]
        )
        if not has_authorized_role:
            # Block unauthorized users from viewing or submitting attendance
            raise PermissionDenied("You do not have access permissions for this class session roster.")

        # Query all enrolled students belonging to this section, ordered alphabetically by student ID
        section = session.allocation.section
        enrolled_students = StudentProfile.objects.filter(section=section).select_related('user').order_by('student_id')

        # Load existing attendance entries into a lookup dictionary keyed by student database ID
        existing_records_map = {
            record.student_id: {'id': record.id, 'status': record.status}
            for record in AttendanceRecord.objects.filter(session=session)
        }

        # Build clean roster payload
        roster_entries = []
        for student in enrolled_students:
            # Check if this student already has a recorded status for this session
            existing_record = existing_records_map.get(student.id, None)

            # Assign existing status or default to PRESENT as recommended workflow state
            if existing_record:
                # Existing status retrieved from previous submission
                resolved_status = existing_record['status']
                resolved_record_id = existing_record['id']
            else:
                # Default status for unmarked rosters
                resolved_status = 'PRESENT'
                resolved_record_id = None

            roster_entries.append({
                'student_profile_id': student.id,
                'student_id': student.student_id,
                'student_name': student.user.get_full_name(),
                'email': student.user.email,
                'record_id': resolved_record_id,
                'status': resolved_status,
            })

        return response.Response({
            'session': {
                'id': session.id,
                'subject_code': session.allocation.subject.code,
                'subject_name': session.allocation.subject.name,
                'section_name': session.allocation.section.name,
                'department_code': session.allocation.section.department.code,
                'session_date': session.session_date,
                'start_time': session.start_time,
                'end_time': session.end_time,
                'is_attendance_taken': session.is_attendance_taken,
                'attendance_taken_at': session.attendance_taken_at,
            },
            'roster': roster_entries
        })


class SubmitSessionAttendanceView(views.APIView):
    """
    Endpoint for submitting batch attendance records for an entire class roster.
    Executes transactionally via the domain service layer.
    """

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, session_id):
        """
        Receives validated attendance entries and persists them atomically.
        """
        # Validate input schema against expected structure
        serializer = SubmitSessionAttendanceSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            # Delegate submission business logic to dedicated service
            submission_summary = submit_session_attendance(
                session_id=session_id,
                records=serializer.validated_data['records'],
                user=request.user
            )
            return response.Response(submission_summary, status=status.HTTP_200_OK)
        except ValidationError as validation_err:
            # Return descriptive validation error response
            return response.Response({'error': str(validation_err)}, status=status.HTTP_400_BAD_REQUEST)
        except PermissionDenied as permission_err:
            # Return explicit authorization failure
            return response.Response({'error': str(permission_err)}, status=status.HTTP_403_FORBIDDEN)


class CorrectAttendanceRecordView(views.APIView):
    """
    Allows instructors or academic administrators to modify a previously recorded
    attendance entry with mandatory written justification.
    """

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, record_id):
        """
        Processes status correction and creates an audit log entry.
        """
        # Validate correction parameters
        serializer = AttendanceCorrectionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            # Execute business logic for status correction and audit logging
            updated_record = correct_attendance_record(
                record_id=record_id,
                new_status=serializer.validated_data['new_status'],
                reason=serializer.validated_data['reason'],
                user=request.user
            )
            return response.Response(AttendanceRecordSerializer(updated_record).data, status=status.HTTP_200_OK)
        except ValidationError as validation_err:
            # Handle invalid transition or validation failure
            return response.Response({'error': str(validation_err)}, status=status.HTTP_400_BAD_REQUEST)
        except PermissionDenied as permission_err:
            # Reject unauthorized modification attempt
            return response.Response({'error': str(permission_err)}, status=status.HTTP_403_FORBIDDEN)


class AttendanceCorrectionLogViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Read-only viewset providing an auditable history of all attendance adjustments.
    Applies role-based scoping to restrict visible entries.
    """

    queryset = AttendanceCorrectionLog.objects.all().select_related(
        'record__student__user',
        'record__session__allocation__subject',
        'record__session__allocation__section',
        'corrected_by'
    )
    serializer_class = AttendanceCorrectionLogSerializer

    def get_queryset(self):
        """
        Filters correction logs based on the querying user's organizational role.
        """
        user = self.request.user
        base_queryset = super().get_queryset()

        # Apply role-specific visibility restrictions
        if user.role == User.Role.HOD:
            # Resolve HOD's departmental scope
            department = getattr(user, 'managed_department', None)
            if not department and hasattr(user, 'faculty_profile'):
                department = user.faculty_profile.department

            if department:
                # Restrict to corrections within subjects of this department
                return base_queryset.filter(record__session__allocation__subject__department=department)
            else:
                # Unassigned HOD cannot view records
                return base_queryset.none()

        elif user.role == User.Role.FACULTY:
            # Faculty members can only view corrections they personally performed
            return base_queryset.filter(corrected_by=user)

        elif user.role == User.Role.STUDENT:
            # Students can only view corrections made to their own attendance records
            return base_queryset.filter(record__student__user=user)

        else:
            # Institutional leadership (Principal, VP, Admin) can review all institutional logs
            return base_queryset


class StudentAttendanceSummaryView(views.APIView):
    """
    Calculates aggregated attendance metrics, threshold warnings, and subject-level summaries
    for an individual student. Supports self-service queries and staff lookups.
    """

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, student_id=None):
        """
        Retrieves attendance metrics for either the authenticated student or a queried student ID.
        """
        user = request.user

        # Identify student target profile
        if user.role == User.Role.STUDENT:
            # Ensure student account has an attached profile
            if not hasattr(user, 'student_profile'):
                return response.Response(
                    {'error': 'Student profile is not linked to this user account.'},
                    status=status.HTTP_404_NOT_FOUND
                )
            target_student = user.student_profile

        else:
            # Administrative lookup requires an explicit student ID argument
            if not student_id:
                return response.Response(
                    {'error': 'Student identifier is required for administrative lookup.'},
                    status=status.HTTP_400_BAD_REQUEST
                )

            from django.db.models import Q
            student_queryset = StudentProfile.objects.select_related(
                'user', 'department', 'section', 'section__counsellor__user'
            )

            # Resolve query argument based on integer primary key or alphanumeric registration code
            if str(student_id).isdigit():
                # Query by primary key, student ID, or institutional code
                target_student = student_queryset.filter(
                    Q(pk=student_id) |
                    Q(student_id=student_id) |
                    Q(user__institutional_id=student_id)
                ).first()
            else:
                # Query case-insensitively by registration code or username
                target_student = student_queryset.filter(
                    Q(student_id__iexact=student_id) |
                    Q(user__institutional_id__iexact=student_id) |
                    Q(user__username__iexact=student_id)
                ).first()

            # Ensure student was found
            if not target_student:
                return response.Response(
                    {'error': f"Student with identifier '{student_id}' was not found in the institution."},
                    status=status.HTTP_404_NOT_FOUND
                )

            # Departmental scoping for HOD queries
            if user.role == User.Role.HOD:
                department = getattr(user, 'managed_department', None)
                if not department and hasattr(user, 'faculty_profile'):
                    department = user.faculty_profile.department

                # Prevent cross-department student inspections by HOD
                if target_student.department != department:
                    raise PermissionDenied("You do not possess authorization to view student profiles outside your department.")

        # Compute dynamic attendance summary using business service
        summary_payload = get_student_attendance_summary(target_student)
        return response.Response(summary_payload)


class StudentAttendanceHistoryView(views.APIView):
    """
    Provides a chronological daily log of class sessions and attendance statuses
    for an individual student.
    """

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, student_id=None):
        """
        Retrieves detailed chronological attendance records with optional subject and date filtering.
        """
        user = request.user

        # Resolve student profile
        if user.role == User.Role.STUDENT:
            if not hasattr(user, 'student_profile'):
                return response.Response(
                    {'error': 'Student profile is not linked.'},
                    status=status.HTTP_404_NOT_FOUND
                )
            target_student = user.student_profile
        else:
            if not student_id:
                return response.Response(
                    {'error': 'Student ID parameter is required.'},
                    status=status.HTTP_400_BAD_REQUEST
                )

            from django.db.models import Q
            student_queryset = StudentProfile.objects.select_related('user', 'department', 'section')
            
            # Lookup student matching numerical or alphanumeric identifier
            if str(student_id).isdigit():
                target_student = student_queryset.filter(
                    Q(pk=student_id) |
                    Q(student_id=student_id) |
                    Q(user__institutional_id=student_id)
                ).first()
            else:
                target_student = student_queryset.filter(
                    Q(student_id__iexact=student_id) |
                    Q(user__institutional_id__iexact=student_id) |
                    Q(user__username__iexact=student_id)
                ).first()

            if not target_student:
                return response.Response(
                    {'error': f"Student with ID '{student_id}' was not found."},
                    status=status.HTTP_404_NOT_FOUND
                )

            # Departmental authorization check for HOD
            if user.role == User.Role.HOD:
                department = getattr(user, 'managed_department', None)
                if not department and hasattr(user, 'faculty_profile'):
                    department = user.faculty_profile.department

                if target_student.department != department:
                    raise PermissionDenied("You do not have access to student records outside your department.")

        # Query all attendance records for this student ordered by most recent first
        record_queryset = AttendanceRecord.objects.filter(student=target_student).select_related(
            'session__allocation__subject',
            'session__allocation__faculty__user'
        ).order_by('-session__session_date', '-session__start_time')

        # Filter by course/subject code if provided
        subject_filter = request.query_params.get('subject')
        if subject_filter:
            record_queryset = record_queryset.filter(session__allocation__subject__code=subject_filter)

        # Filter by specific calendar date if provided
        date_filter = request.query_params.get('date')
        if date_filter:
            record_queryset = record_queryset.filter(session__session_date=date_filter)

        # Serialize results into clean response format
        history_list = []
        for record in record_queryset:
            # Format period times nicely
            start_formatted = record.session.start_time.strftime('%H:%M')
            end_formatted = record.session.end_time.strftime('%H:%M')

            history_list.append({
                'record_id': record.id,
                'date': record.session.session_date,
                'time': f"{start_formatted} - {end_formatted}",
                'subject_code': record.session.allocation.subject.code,
                'subject_name': record.session.allocation.subject.name,
                'faculty_name': record.session.allocation.faculty.user.get_full_name(),
                'status': record.status,
                'topic': record.session.topic,
            })

        return response.Response(history_list)


class FacultyBiometricLogViewSet(viewsets.ModelViewSet):
    """
    Manages and displays daily biometric arrival logs for academic faculty.
    Scoping:
    - Faculty members: inspect personal punch records.
    - HOD: inspect all faculty within the department.
    - Principal, VP, Admin: inspect college-wide punch logs.
    """

    queryset = FacultyBiometricLog.objects.all().select_related('faculty__user', 'faculty__department')
    serializer_class = FacultyBiometricLogSerializer

    def get_queryset(self):
        """
        Restricts biometric log visibility according to user role and optional date filters.
        """
        user = self.request.user
        base_queryset = super().get_queryset()

        # Apply role-based filtering
        if user.role == User.Role.FACULTY:
            # Faculty only see their personal punch logs
            if hasattr(user, 'faculty_profile'):
                base_queryset = base_queryset.filter(faculty=user.faculty_profile)
            else:
                base_queryset = base_queryset.none()

        elif user.role == User.Role.HOD:
            # HODs see faculty in their managed department
            department = getattr(user, 'managed_department', None)
            if not department and hasattr(user, 'faculty_profile'):
                department = user.faculty_profile.department

            if department:
                base_queryset = base_queryset.filter(faculty__department=department)
            else:
                base_queryset = base_queryset.none()

        # Optional date filter for targeted calendar day inspection
        date_param = self.request.query_params.get('date')
        if date_param:
            base_queryset = base_queryset.filter(date=date_param)

        return base_queryset
