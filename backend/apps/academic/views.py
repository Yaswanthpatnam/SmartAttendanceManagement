from rest_framework import viewsets, permissions, status, views, filters
from rest_framework.decorators import action
from rest_framework.response import Response
from django.db.models import Q, Count, Case, When, IntegerField
from django.utils import timezone
from datetime import datetime

from apps.core.models import User
from apps.core.permissions import IsAdminRole, IsHODRole, IsFacultyRole, IsPrincipalOrVPRole
from apps.academic.models import (
    Department, AcademicYear, Semester, Section, Subject,
    AdminProfile, FacultyProfile, StudentProfile, FacultyAllocation, ClassSession
)
from apps.attendance.models import AttendanceRecord
from apps.academic.serializers import (
    DepartmentSerializer, AcademicYearSerializer, SemesterSerializer,
    SectionSerializer, SubjectSerializer, FacultyProfileSerializer,
    CreateFacultySerializer, StudentProfileSerializer, CreateStudentSerializer,
    FacultyAllocationSerializer, ClassSessionSerializer
)


class DepartmentViewSet(viewsets.ModelViewSet):
    """
    CRUD controller for institutional academic departments (e.g. CSE, ECE, MECH).
    Admin role can create and modify records; all other authenticated users have read access.
    """
    queryset = Department.objects.all().prefetch_related('sections', 'faculty_members', 'students')
    serializer_class = DepartmentSerializer

    def get_permissions(self):
        """Restricts write operations to system administrators."""
        # For mutations, require administrative privileges
        if self.action in ['create', 'update', 'partial_update', 'destroy']:
            return [IsAdminRole()]
        # For list and retrieve operations, allow any authenticated member
        return [permissions.IsAuthenticated()]


class AcademicYearViewSet(viewsets.ModelViewSet):
    """
    Manages institutional academic calendar years (e.g., 2026-2027).
    """
    queryset = AcademicYear.objects.all()
    serializer_class = AcademicYearSerializer

    def get_permissions(self):
        """Restricts calendar year modifications to administrative staff."""
        # Apply Admin restriction for data mutations
        if self.action in ['create', 'update', 'partial_update', 'destroy']:
            return [IsAdminRole()]
        # Read-only access for general campus members
        return [permissions.IsAuthenticated()]


class SemesterViewSet(viewsets.ModelViewSet):
    """
    CRUD controller for academic semesters within the active academic year.
    """
    queryset = Semester.objects.all().select_related('academic_year')
    serializer_class = SemesterSerializer

    def get_permissions(self):
        """Restricts semester configurations to administrators."""
        # Mutation check
        if self.action in ['create', 'update', 'partial_update', 'destroy']:
            return [IsAdminRole()]
        return [permissions.IsAuthenticated()]


class SectionViewSet(viewsets.ModelViewSet):
    """
    Classroom section management with departmental filtering,
    dynamic semester progression, counsellor role assignment,
    and daily roll-call attendance summaries.
    """
    queryset = Section.objects.all().select_related('department', 'academic_year', 'counsellor__user')
    serializer_class = SectionSerializer

    def get_permissions(self):
        """Restricts base CRUD mutations to administrators."""
        # Mutation protection
        if self.action in ['create', 'update', 'partial_update', 'destroy']:
            return [IsAdminRole()]
        return [permissions.IsAuthenticated()]

    def get_queryset(self):
        """Applies optional department query parameter filter."""
        qs = super().get_queryset()
        dept_id = self.request.query_params.get('department')
        # Filter by department if query parameter is provided
        if dept_id:
            qs = qs.filter(department_id=dept_id)
        return qs.order_by('department__code', 'name')

    @action(detail=True, methods=['post'], url_path='advance-semester')
    def advance_semester(self, request, pk=None):
        """
        Dynamically promotes a section to the subsequent semester (1 through 8).
        Synchronizes all enrolled students' semester fields atomically.
        Only the departmental HOD or college leadership may trigger this action.
        """
        section = self.get_object()
        user = request.user
        
        # Authorization check: Department HOD boundary
        if user.role == User.Role.HOD:
            dept = getattr(user, 'managed_department', None)
            # Resolve HOD department from faculty profile if not directly on user model
            if not dept and hasattr(user, 'faculty_profile'):
                dept = user.faculty_profile.department
                
            # Verify HOD has jurisdiction over this section's department
            if not dept or dept.id != section.department_id:
                return Response(
                    {'detail': 'HOD can only advance semesters for sections in their own department.'},
                    status=status.HTTP_403_FORBIDDEN
                )
        # Campus leadership (Admin, Principal, VP) authorization
        elif user.role not in [User.Role.ADMIN, User.Role.PRINCIPAL, User.Role.VICE_PRINCIPAL]:
            return Response(
                {'detail': 'Permission denied. Only HOD or college leadership can advance semesters.'},
                status=status.HTTP_403_FORBIDDEN
            )

        # Record current semester and execute dynamic advancement
        old_semester = section.current_semester
        new_semester = section.advance_semester()
        
        return Response({
            'status': 'success',
            'message': f"Section {section.name} advanced from Semester {old_semester} to Semester {new_semester}.",
            'section_id': section.id,
            'previous_semester': old_semester,
            'current_semester': new_semester,
            'students_updated': section.students.count()
        })

    @action(detail=True, methods=['post'], url_path='assign-counsellor')
    def assign_counsellor(self, request, pk=None):
        """
        Designates a specific faculty member as the Section Counsellor / Proctor.
        Enforces that HODs may only assign faculty belonging to their own department.
        """
        section = self.get_object()
        user = request.user
        
        # Scope enforcement for HOD
        if user.role == User.Role.HOD:
            dept = getattr(user, 'managed_department', None)
            if not dept and hasattr(user, 'faculty_profile'):
                dept = user.faculty_profile.department
            if not dept or dept.id != section.department_id:
                return Response(
                    {'detail': 'HOD can only assign counsellors for sections in their own department.'},
                    status=status.HTTP_403_FORBIDDEN
                )
        # Scope enforcement for non-executives
        elif user.role not in [User.Role.ADMIN, User.Role.PRINCIPAL, User.Role.VICE_PRINCIPAL]:
            return Response(
                {'detail': 'Permission denied.'},
                status=status.HTTP_403_FORBIDDEN
            )

        # Validate request payload
        faculty_id = request.data.get('faculty_id')
        if not faculty_id:
            return Response(
                {'detail': 'faculty_id is required in the request body.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Locate faculty record
        try:
            faculty = FacultyProfile.objects.select_related('user').get(id=faculty_id)
        except FacultyProfile.DoesNotExist:
            return Response(
                {'detail': 'Selected faculty member was not found.'},
                status=status.HTTP_404_NOT_FOUND
            )

        # Enforce that counsellor belongs to the same department as the section
        if user.role == User.Role.HOD and faculty.department_id != section.department_id:
            return Response(
                {'detail': 'Counsellor must belong to the same department as the section.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Assign counsellor and persist
        section.counsellor = faculty
        section.save(update_fields=['counsellor'])
        
        return Response({
            'status': 'success',
            'message': f"{faculty.user.get_full_name()} has been designated as Section Counsellor for {section.name}.",
            'counsellor': {
                'id': faculty.id,
                'name': faculty.user.get_full_name(),
                'faculty_id': faculty.faculty_id,
                'email': faculty.user.email
            }
        })

    @action(detail=True, methods=['get'], url_path='attendance-summary')
    def attendance_summary(self, request, pk=None):
        """
        Returns full attendance summary for a section on a given date (defaults to today):
        - Today's conducted class count
        - Overall section attendance percentage
        - Student-by-student attendance breakdown and present/absent markings
        """
        section = self.get_object()
        
        # Parse date filter from query parameters
        target_date_str = request.query_params.get('date')
        if target_date_str:
            try:
                target_date = datetime.strptime(target_date_str, '%Y-%m-%d').date()
            except ValueError:
                # Fallback to local calendar date if malformed
                target_date = timezone.localdate()
        else:
            target_date = timezone.localdate()

        students = section.students.select_related('user').order_by('student_id')
        total_students = students.count()

        # Query all class sessions conducted for this section on the target date
        sessions_today = ClassSession.objects.filter(
            allocation__section=section,
            session_date=target_date
        ).select_related('allocation__subject', 'allocation__faculty__user')

        today_sessions_count = sessions_today.count()

        # Query individual student attendance marks for today's sessions
        today_records = AttendanceRecord.objects.filter(
            session__in=sessions_today
        ).select_related('student', 'session')

        # Map student IDs to their attendance statuses today
        student_today_map = {}
        for rec in today_records:
            if rec.student_id not in student_today_map:
                student_today_map[rec.student_id] = []
            student_today_map[rec.student_id].append(rec.status)

        # Calculate section-wide cumulative attendance across all conducted classes
        all_records = AttendanceRecord.objects.filter(session__allocation__section=section)
        total_all_records = all_records.count()
        present_all_records = all_records.filter(status='PRESENT').count()
        
        # Calculate overall attendance percentage
        if total_all_records > 0:
            overall_pct = round((present_all_records / total_all_records) * 100, 1)
        else:
            overall_pct = None

        # Aggregate cumulative attendance percentage per individual student
        student_overall_stats = AttendanceRecord.objects.filter(
            session__allocation__section=section
        ).values('student_id').annotate(
            total=Count('id'),
            present=Count(Case(When(status='PRESENT', then=1), output_field=IntegerField()))
        )
        
        # Map student cumulative percentages into lookup dictionary
        student_stat_dict = {}
        for s in student_overall_stats:
            if s['total'] > 0:
                student_stat_dict[s['student_id']] = round((s['present'] / s['total']) * 100, 1)
            else:
                student_stat_dict[s['student_id']] = None

        # Build student roster with today's status and warnings
        student_roster = []
        present_today_count = 0
        absent_today_count = 0

        for stu in students:
            today_statuses = student_today_map.get(stu.id, [])
            
            # Determine daily attendance label based on today's classes
            if today_statuses:
                num_present = sum(1 for st in today_statuses if st == 'PRESENT')
                # Student is present for the day if attended at least half of today's periods
                is_present_today = num_present >= (len(today_statuses) / 2)
                
                if is_present_today:
                    day_status = 'PRESENT'
                    present_today_count += 1
                else:
                    day_status = 'ABSENT'
                    absent_today_count += 1
            else:
                # No records marked yet today
                if today_sessions_count == 0:
                    day_status = 'NO_SESSION'
                else:
                    day_status = 'NOT_MARKED'

            stu_pct = student_stat_dict.get(stu.id, None)

            # Append structured student row
            student_roster.append({
                'id': stu.id,
                'student_id': stu.student_id,
                'roll_number': stu.student_id,
                'name': stu.user.get_full_name(),
                'email': stu.user.email,
                'today_status': day_status,
                'today_sessions_attended': sum(1 for st in today_statuses if st == 'PRESENT'),
                'today_total_sessions': len(today_statuses),
                'overall_percentage': stu_pct,
                'is_critical': stu_pct is not None and stu_pct < 65.0,
                'is_warning': stu_pct is not None and 65.0 <= stu_pct < 75.0
            })

        # Return full section attendance digest
        return Response({
            'section_id': section.id,
            'section_name': section.name,
            'department': section.department.code,
            'semester': section.current_semester,
            'counsellor': {
                'id': section.counsellor.id,
                'name': section.counsellor.user.get_full_name(),
                'faculty_id': section.counsellor.faculty_id,
                'email': section.counsellor.user.email
            } if section.counsellor else None,
            'date': str(target_date),
            'today_sessions_count': today_sessions_count,
            'total_students': total_students,
            'present_today': present_today_count,
            'absent_today': absent_today_count,
            'overall_attendance_percentage': overall_pct,
            'has_sessions': total_all_records > 0,
            'students': student_roster
        })

    @action(detail=True, methods=['get'], url_path='counsellor-report')
    def counsellor_report(self, request, pk=None):
        """
        Dedicated Section Counsellor / Proctor Attendance Oversight Report.
        Strictly restricted to:
        - The specific faculty member designated as this section's counsellor.
        - Departmental HOD.
        - College Executive Leadership (Principal, VP, Admin).
        Non-counsellor faculty members are strictly rejected with HTTP 403 Forbidden.
        """
        section = self.get_object()
        user = request.user
        is_allowed = False
        
        # Check 1: Institutional Leadership
        if user.role in [User.Role.ADMIN, User.Role.PRINCIPAL, User.Role.VICE_PRINCIPAL]:
            is_allowed = True
        # Check 2: Department HOD
        elif user.role == User.Role.HOD:
            dept = getattr(user, 'managed_department', None)
            if not dept and hasattr(user, 'faculty_profile'):
                dept = user.faculty_profile.department
            if dept and dept.id == section.department_id:
                is_allowed = True
        # Check 3: Designated Section Counsellor
        elif user.role == User.Role.FACULTY:
            if hasattr(user, 'faculty_profile') and section.counsellor_id == user.faculty_profile.id:
                is_allowed = True

        # Enforce proctor access control
        if not is_allowed:
            return Response(
                {'detail': 'Permission denied. Only assigned section counsellor, HOD, or administration can view this report.'},
                status=status.HTTP_403_FORBIDDEN
            )

        students = section.students.select_related('user').order_by('student_id')

        # Aggregate cumulative attendance records for this section
        student_stats = AttendanceRecord.objects.filter(
            session__allocation__section=section
        ).values('student_id').annotate(
            total=Count('id'),
            present=Count(Case(When(status='PRESENT', then=1), output_field=IntegerField())),
            absent=Count(Case(When(status='ABSENT', then=1), output_field=IntegerField()))
        )
        stat_map = {s['student_id']: s for s in student_stats}

        student_list = []
        critical_count = 0
        warning_count = 0
        good_count = 0

        # Classify each student into compliance bands (<65% Critical, 65-75% Warning, >=75% Good)
        for stu in students:
            s_data = stat_map.get(stu.id, {'total': 0, 'present': 0, 'absent': 0})
            total = s_data['total']
            present = s_data['present']
            
            # Compute attendance percentage if classes have been recorded
            if total > 0:
                pct = round((present / total * 100), 1)
            else:
                pct = None

            # Category classification logic
            cat = 'NO_DATA'
            if pct is not None:
                if pct < 65.0:
                    cat = 'CRITICAL'
                    critical_count += 1
                elif pct < 75.0:
                    cat = 'WARNING'
                    warning_count += 1
                else:
                    cat = 'GOOD'
                    good_count += 1

            # Build student data record with contact directory
            student_list.append({
                'id': stu.id,
                'student_id': stu.student_id,
                'roll_number': stu.student_id,
                'name': stu.user.get_full_name(),
                'email': stu.user.email,
                'phone_number': getattr(stu.user, 'phone', 'N/A') or 'N/A',
                'parent_name': f"Guardian of {stu.user.get_full_name()}",
                'parent_phone': getattr(stu.user, 'phone', 'N/A') or 'N/A',
                'total_sessions': total,
                'present_sessions': present,
                'absent_sessions': s_data['absent'],
                'attendance_percentage': pct,
                'category': cat
            })

        return Response({
            'section_id': section.id,
            'section_name': section.name,
            'department': section.department.code,
            'semester': section.current_semester,
            'counsellor': {
                'id': section.counsellor.id,
                'name': section.counsellor.user.get_full_name(),
                'faculty_id': section.counsellor.faculty_id,
                'email': section.counsellor.user.email
            } if section.counsellor else None,
            'total_students': students.count(),
            'critical_count': critical_count,
            'warning_count': warning_count,
            'good_count': good_count,
            'students': student_list,
            'report_date': timezone.localdate().isoformat()
        })


class SubjectViewSet(viewsets.ModelViewSet):
    """
    CRUD viewset for curriculum subjects with department and semester filtering.
    """
    queryset = Subject.objects.all().select_related('department')
    serializer_class = SubjectSerializer

    def get_permissions(self):
        """Restricts subject creation/updates to administration."""
        if self.action in ['create', 'update', 'partial_update', 'destroy']:
            return [IsAdminRole()]
        return [permissions.IsAuthenticated()]

    def get_queryset(self):
        """Applies department and semester query parameter filters."""
        qs = super().get_queryset()
        dept_id = self.request.query_params.get('department')
        semester = self.request.query_params.get('semester')
        
        # Apply filters if provided
        if dept_id:
            qs = qs.filter(department_id=dept_id)
        if semester:
            qs = qs.filter(semester=semester)
            
        return qs.order_by('code')


class FacultyViewSet(viewsets.ModelViewSet):
    """
    Faculty directory and onboarding controller.
    Enforces departmental boundaries:
    - HODs see faculty members belonging to their own department.
    - Administration, Principal, and VP maintain campus-wide directory access.
    """
    queryset = FacultyProfile.objects.all().select_related('user', 'department')
    serializer_class = FacultyProfileSerializer

    def get_permissions(self):
        """Restricts manual single-faculty creation to administrators."""
        if self.action == 'create':
            return [IsAdminRole()]
        return [permissions.IsAuthenticated()]

    def get_queryset(self):
        """Applies role-based scoping to the faculty directory."""
        user = self.request.user
        qs = FacultyProfile.objects.all().select_related('user', 'department')
        
        # HOD scope: restrict to managed department
        if user.role == User.Role.HOD:
            dept = getattr(user, 'managed_department', None)
            if not dept and hasattr(user, 'faculty_profile'):
                dept = user.faculty_profile.department
            if dept:
                qs = qs.filter(department=dept)
            else:
                qs = qs.none()
        # Faculty scope: see departmental colleagues
        elif user.role == User.Role.FACULTY:
            if hasattr(user, 'faculty_profile'):
                qs = qs.filter(department=user.faculty_profile.department)

        # Optional query filters for administrative users
        dept_id = self.request.query_params.get('department')
        search = self.request.query_params.get('search')
        
        if dept_id and user.role in [User.Role.ADMIN, User.Role.PRINCIPAL, User.Role.VICE_PRINCIPAL]:
            qs = qs.filter(department_id=dept_id)
            
        # Case-insensitive keyword search
        if search:
            qs = qs.filter(
                Q(faculty_id__icontains=search) |
                Q(user__first_name__icontains=search) |
                Q(user__last_name__icontains=search) |
                Q(user__email__icontains=search)
            )
        return qs.order_by('faculty_id')

    def create(self, request, *args, **kwargs):
        """Validates and creates an individual faculty member."""
        serializer = CreateFacultySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        faculty = serializer.save()
        return Response(FacultyProfileSerializer(faculty).data, status=status.HTTP_201_CREATED)


class StudentViewSet(viewsets.ModelViewSet):
    """
    Student directory with server-side pagination, keyword search, and data isolation:
    - Students see ONLY their own record.
    - HODs see ONLY students within their department.
    - Faculty see students enrolled in their assigned sections.
    - Administration, Principal, and VP maintain college-wide access.
    """
    queryset = StudentProfile.objects.all().select_related('user', 'department', 'section', 'academic_year')
    serializer_class = StudentProfileSerializer

    def get_permissions(self):
        """Restricts manual student creation to administrators."""
        if self.action == 'create':
            return [IsAdminRole()]
        return [permissions.IsAuthenticated()]

    def get_queryset(self):
        """Enforces student isolation and departmental scoping."""
        user = self.request.user
        qs = StudentProfile.objects.all().select_related('user', 'department', 'section', 'academic_year')

        # Branch 1: Student role strictly isolated to own record
        if user.role == User.Role.STUDENT:
            if hasattr(user, 'student_profile'):
                return qs.filter(id=user.student_profile.id)
            return qs.none()

        # Branch 2: HOD role scoped to department
        if user.role == User.Role.HOD:
            dept = getattr(user, 'managed_department', None)
            if not dept and hasattr(user, 'faculty_profile'):
                dept = user.faculty_profile.department
            if dept:
                qs = qs.filter(department=dept)
            else:
                qs = qs.none()

        # Branch 3: Faculty role scoped to their active teaching sections
        elif user.role == User.Role.FACULTY:
            if hasattr(user, 'faculty_profile'):
                assigned_sections = FacultyAllocation.objects.filter(
                    faculty=user.faculty_profile,
                    is_active=True
                ).values_list('section_id', flat=True)
                qs = qs.filter(section_id__in=assigned_sections)

        # Query parameter filters
        dept_id = self.request.query_params.get('department')
        section_id = self.request.query_params.get('section')
        semester = self.request.query_params.get('semester')
        search = self.request.query_params.get('search')

        # Apply department filter for administrators
        if dept_id and user.role in [User.Role.ADMIN, User.Role.PRINCIPAL, User.Role.VICE_PRINCIPAL]:
            qs = qs.filter(department_id=dept_id)
        if section_id:
            qs = qs.filter(section_id=section_id)
        if semester:
            qs = qs.filter(semester=semester)
            
        # Keyword search across roll number, name, and email
        if search:
            qs = qs.filter(
                Q(student_id__icontains=search) |
                Q(user__first_name__icontains=search) |
                Q(user__last_name__icontains=search) |
                Q(user__email__icontains=search)
            )

        return qs

    def create(self, request, *args, **kwargs):
        """Creates an individual student account with credentials."""
        serializer = CreateStudentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        student = serializer.save()
        return Response(StudentProfileSerializer(student).data, status=status.HTTP_201_CREATED)


class FacultyAllocationViewSet(viewsets.ModelViewSet):
    """
    Subject and section allocation management.
    HODs assign faculty members to specific subjects and sections.
    """
    queryset = FacultyAllocation.objects.all().select_related(
        'faculty__user', 'faculty__department', 'subject', 'section', 'academic_year'
    )
    serializer_class = FacultyAllocationSerializer

    def get_permissions(self):
        """Only HODs and administrators can create or adjust allocations."""
        if self.action in ['create', 'update', 'partial_update', 'destroy']:
            return [IsHODRole()]
        return [permissions.IsAuthenticated()]

    def get_queryset(self):
        """Scopes allocation queries by role."""
        user = self.request.user
        qs = super().get_queryset()

        # HOD queries: scoped to faculty in HOD's department
        if user.role == User.Role.HOD:
            dept = getattr(user, 'managed_department', None)
            if not dept and hasattr(user, 'faculty_profile'):
                dept = user.faculty_profile.department
            if dept:
                qs = qs.filter(faculty__department=dept)
        # Faculty queries: only see own teaching allocations
        elif user.role == User.Role.FACULTY:
            if hasattr(user, 'faculty_profile'):
                qs = qs.filter(faculty=user.faculty_profile)

        # Query filters
        dept_id = self.request.query_params.get('department')
        faculty_id = self.request.query_params.get('faculty')
        section_id = self.request.query_params.get('section')
        
        if dept_id:
            qs = qs.filter(faculty__department_id=dept_id)
        if faculty_id:
            qs = qs.filter(faculty_id=faculty_id)
        if section_id:
            qs = qs.filter(section_id=section_id)

        return qs.order_by('faculty__faculty_id', 'subject__code')

    def perform_create(self, serializer):
        """Validates that HOD only allocates faculty within their own department and provisions live session."""
        user = self.request.user
        if user.role == User.Role.HOD:
            dept = getattr(user, 'managed_department', None)
            if not dept and hasattr(user, 'faculty_profile'):
                dept = user.faculty_profile.department
            faculty = serializer.validated_data.get('faculty')
            if faculty and faculty.department != dept:
                raise permissions.exceptions.PermissionDenied("You can only allocate faculty members belonging to your department.")
        alloc = serializer.save()

        # Proactively provision an initial timetable class session for today so the newly
        # allocated instructor can immediately commence attendance taking in their dashboard.
        today = timezone.localdate()
        ClassSession.objects.get_or_create(
            allocation=alloc,
            session_date=today,
            defaults={
                'start_time': '10:00:00',
                'end_time': '11:00:00',
                'topic': f"{alloc.subject.name} - Introductory Lecture",
                'is_attendance_taken': False,
            }
        )


class ClassSessionViewSet(viewsets.ModelViewSet):
    """
    Timetable class sessions controller.
    Faculty members use this endpoint to view their schedule, retrieve rosters,
    and submit class attendance records.
    """
    queryset = ClassSession.objects.all().select_related(
        'allocation__faculty__user', 'allocation__subject',
        'allocation__section__department', 'substitute_faculty__user'
    )
    serializer_class = ClassSessionSerializer

    def get_queryset(self):
        """Scopes sessions by role and timetable query parameters."""
        user = self.request.user
        qs = super().get_queryset()

        # Faculty: view classes where they are primary allocated teacher or designated substitute
        if user.role == User.Role.FACULTY:
            if hasattr(user, 'faculty_profile'):
                fac = user.faculty_profile
                qs = qs.filter(Q(allocation__faculty=fac) | Q(substitute_faculty=fac))
        # HOD: view departmental class sessions
        elif user.role == User.Role.HOD:
            dept = getattr(user, 'managed_department', None)
            if not dept and hasattr(user, 'faculty_profile'):
                dept = user.faculty_profile.department
            if dept:
                qs = qs.filter(allocation__subject__department=dept)
        # Student: view sessions for their enrolled section
        elif user.role == User.Role.STUDENT:
            if hasattr(user, 'student_profile'):
                qs = qs.filter(allocation__section=user.student_profile.section)

        # Filter by specific date if supplied (e.g. today's classes)
        date_param = self.request.query_params.get('date')
        if date_param:
            qs = qs.filter(session_date=date_param)

        # Filter by allocation if specified
        alloc_id = self.request.query_params.get('allocation')
        if alloc_id:
            qs = qs.filter(allocation_id=alloc_id)

        return qs.order_by('session_date', 'start_time')

    def perform_create(self, serializer):
        """Ensures faculty members can only schedule sessions for their own allocated courses."""
        user = self.request.user
        if user.role == User.Role.FACULTY and hasattr(user, 'faculty_profile'):
            alloc = serializer.validated_data.get('allocation')
            if alloc and alloc.faculty != user.faculty_profile:
                raise permissions.exceptions.PermissionDenied("You can only create sessions for your assigned allocations.")
        serializer.save()

