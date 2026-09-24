"""
Institutional Analytics and Exception Detection Engine
======================================================
This service layer implements data aggregation engines for:
1. Campus-wide macro metrics (Total headcounts, daily turnout, missing period sessions).
2. Departmental health scorecards (Faculty attendance rates, section-level percentages).
3. Student defaulter detection according to institutional attendance thresholds.
"""

from typing import Dict, Any, List
from django.db.models import Count, Q
from django.utils import timezone
from apps.core.models import SystemSetting
from apps.academic.models import (
    Department, Section, StudentProfile,
    FacultyProfile, ClassSession
)
from apps.attendance.models import AttendanceRecord, AttendanceCorrectionLog, FacultyBiometricLog


def get_college_macro_analytics() -> Dict[str, Any]:
    """
    Computes aggregated institutional metrics for senior administration (Principal / VP):
    - Real-time student and faculty census totals
    - Daily attendance percentages and period completion stats
    - Historical attendance averages
    - Faculty presence from physical biometric terminals
    - Breakdown of attendance metrics by academic department
    """
    # Retrieve system warning threshold for student attendance
    statutory_threshold = SystemSetting.get_float('LOW_ATTENDANCE_THRESHOLD', 75.0)
    current_date = timezone.localdate()

    # Headcount metrics across the institution
    student_census_count = StudentProfile.objects.count()
    faculty_census_count = FacultyProfile.objects.count()
    department_census_count = Department.objects.count()

    # Query class sessions scheduled for today
    today_sessions_queryset = ClassSession.objects.filter(session_date=current_date)
    total_sessions_today = today_sessions_queryset.count()
    completed_sessions_today = today_sessions_queryset.filter(is_attendance_taken=True).count()
    unmarked_sessions_today = total_sessions_today - completed_sessions_today

    # Aggregate student attendance marks recorded today
    records_today = AttendanceRecord.objects.filter(session__session_date=current_date)
    total_marks_today = records_today.count()
    present_marks_today = records_today.filter(status=AttendanceRecord.Status.PRESENT).count()

    # Compute today's campus turnout percentage
    if total_marks_today > 0:
        today_turnout_percentage = round((present_marks_today / total_marks_today * 100), 2)
    else:
        today_turnout_percentage = 0.0

    # Calculate institutional cumulative historical average
    all_historical_records = AttendanceRecord.objects.all()
    total_historical_marks = all_historical_records.count()
    present_historical_marks = all_historical_records.filter(status=AttendanceRecord.Status.PRESENT).count()

    if total_historical_marks > 0:
        institutional_avg_percentage = round((present_historical_marks / total_historical_marks * 100), 2)
    else:
        institutional_avg_percentage = 0.0

    # Faculty biometric check-in numbers for today
    biometric_logs_today = FacultyBiometricLog.objects.filter(date=current_date)
    faculty_present_count = biometric_logs_today.filter(status=FacultyBiometricLog.PunchStatus.PRESENT).count()
    faculty_late_count = biometric_logs_today.filter(status=FacultyBiometricLog.PunchStatus.LATE).count()
    faculty_absent_count = biometric_logs_today.filter(status=FacultyBiometricLog.PunchStatus.ABSENT).count()

    # Determine how many faculty have not yet clocked in via biometric sensors
    logged_faculty_pks = set(biometric_logs_today.values_list('faculty_id', flat=True))
    unlogged_faculty_count = max(0, faculty_census_count - len(logged_faculty_pks))

    # Compile department-level summaries
    department_metrics_list = []
    academic_departments = Department.objects.all().order_by('code')

    for department in academic_departments:
        dept_student_count = StudentProfile.objects.filter(department=department).count()
        dept_faculty_count = FacultyProfile.objects.filter(department=department).count()

        # Query all student attendance records belonging to this department's courses
        dept_attendance_records = AttendanceRecord.objects.filter(
            session__allocation__subject__department=department
        )
        total_dept_marks = dept_attendance_records.count()
        present_dept_marks = dept_attendance_records.filter(status=AttendanceRecord.Status.PRESENT).count()

        # Calculate department-level attendance percentage
        if total_dept_marks > 0:
            dept_percentage = round((present_dept_marks / total_dept_marks * 100), 2)
        else:
            dept_percentage = 0.0

        department_metrics_list.append({
            'department_id': department.id,
            'department_code': department.code,
            'department_name': department.name,
            'student_count': dept_student_count,
            'faculty_count': dept_faculty_count,
            'attendance_percentage': dept_percentage,
        })

    # Count overdue unconducted sessions up to and including today
    unmarked_past_sessions_count = ClassSession.objects.filter(
        session_date__lte=current_date,
        is_attendance_taken=False
    ).count()

    # Total audit corrections logged across the institution
    total_recent_corrections = AttendanceCorrectionLog.objects.count()

    return {
        'today_date': current_date.isoformat(),
        'total_students': student_census_count,
        'total_faculty': faculty_census_count,
        'total_departments': department_census_count,
        'threshold': statutory_threshold,
        'today_attendance_percentage': today_turnout_percentage,
        'overall_average_percentage': institutional_avg_percentage,
        'total_today_sessions': total_sessions_today,
        'taken_today_sessions': completed_sessions_today,
        'pending_today_sessions': unmarked_sessions_today,
        'missing_sessions_count': unmarked_past_sessions_count,
        'recent_corrections_count': total_recent_corrections,
        'faculty_attendance_today': {
            'present': faculty_present_count,
            'late': faculty_late_count,
            'absent': faculty_absent_count,
            'not_logged': unlogged_faculty_count,
            'total': faculty_census_count
        },
        'departments': department_metrics_list
    }


def get_department_macro_analytics(department: Department) -> Dict[str, Any]:
    """
    Computes scoped departmental KPIs for HOD oversight:
    - Enrollment counts and faculty strength
    - Faculty attendance status today (present, late, absent, or unlogged)
    - Pending and missing attendance sessions
    - Section-wise attendance averages and assigned counsellors
    - Audit log of recent attendance corrections
    """
    warning_threshold = SystemSetting.get_float('LOW_ATTENDANCE_THRESHOLD', 75.0)
    current_date = timezone.localdate()

    # Department student and faculty totals
    department_students = StudentProfile.objects.filter(department=department)
    total_students_in_dept = department_students.count()

    department_faculty = FacultyProfile.objects.filter(department=department)
    total_faculty_in_dept = department_faculty.count()

    department_sections = Section.objects.filter(department=department)

    # Today's departmental sessions
    dept_today_sessions = ClassSession.objects.filter(
        allocation__subject__department=department,
        session_date=current_date
    )
    total_sessions_today = dept_today_sessions.count()
    completed_sessions_today = dept_today_sessions.filter(is_attendance_taken=True).count()
    pending_sessions_today = total_sessions_today - completed_sessions_today

    # Overdue unsubmitted sessions within this department
    overdue_unmarked_sessions = ClassSession.objects.filter(
        allocation__subject__department=department,
        session_date__lte=current_date,
        is_attendance_taken=False
    ).select_related(
        'allocation__faculty__user',
        'allocation__subject',
        'allocation__section'
    )[:20]

    # Evaluate faculty biometric check-ins today
    faculty_biometric_logs = FacultyBiometricLog.objects.filter(
        faculty__department=department,
        date=current_date
    ).select_related('faculty__user')

    present_faculty_ids = set()
    late_faculty_ids = set()
    absent_faculty_ids = set()

    for punch_log in faculty_biometric_logs:
        if punch_log.status == FacultyBiometricLog.PunchStatus.PRESENT:
            present_faculty_ids.add(punch_log.faculty_id)
        elif punch_log.status == FacultyBiometricLog.PunchStatus.LATE:
            late_faculty_ids.add(punch_log.faculty_id)
        elif punch_log.status == FacultyBiometricLog.PunchStatus.ABSENT:
            absent_faculty_ids.add(punch_log.faculty_id)

    # Classify each faculty member's physical status
    flagged_faculty_exceptions = []
    for faculty_member in department_faculty:
        # Determine status classification
        if faculty_member.id in present_faculty_ids:
            punch_status = 'PRESENT'
        elif faculty_member.id in late_faculty_ids:
            punch_status = 'LATE'
        elif faculty_member.id in absent_faculty_ids:
            punch_status = 'ABSENT'
        else:
            punch_status = 'NOT_LOGGED'

        # Highlight faculty who are absent, unlogged, or late for operational attention
        if punch_status in ['ABSENT', 'NOT_LOGGED', 'LATE']:
            # Count how many classes this faculty member was scheduled to teach today
            scheduled_classes_count = ClassSession.objects.filter(
                allocation__faculty=faculty_member,
                session_date=current_date
            ).count()

            flagged_faculty_exceptions.append({
                'faculty_id': faculty_member.faculty_id,
                'name': faculty_member.user.get_full_name(),
                'designation': faculty_member.designation,
                'status': punch_status,
                'classes_today_count': scheduled_classes_count
            })

    # Calculate section-by-section performance breakdown
    section_breakdown_list = []
    for section in department_sections:
        # Query attendance records specific to this section
        section_attendance_records = AttendanceRecord.objects.filter(session__allocation__section=section)
        total_section_marks = section_attendance_records.count()
        present_section_marks = section_attendance_records.filter(status=AttendanceRecord.Status.PRESENT).count()

        # Compute attendance percentage if classes have taken place
        if total_section_marks > 0:
            section_attendance_pct = round((present_section_marks / total_section_marks * 100), 2)
        else:
            section_attendance_pct = None

        # Resolve assigned counsellor name safely
        if section.counsellor:
            counsellor_display_name = section.counsellor.user.get_full_name()
        else:
            counsellor_display_name = 'Unassigned'

        section_breakdown_list.append({
            'section_id': section.id,
            'section_name': section.name,
            'student_count': section.students.count(),
            'current_semester': section.current_semester,
            'attendance_percentage': section_attendance_pct,
            'has_sessions': total_section_marks > 0,
            'counsellor_id': section.counsellor_id,
            'counsellor_name': counsellor_display_name
        })

    # Fetch recent attendance modifications within this department
    recent_audit_corrections = AttendanceCorrectionLog.objects.filter(
        record__session__allocation__subject__department=department
    ).select_related(
        'record__student__user',
        'record__session__allocation__subject',
        'record__session__allocation__section',
        'corrected_by'
    )[:15]

    return {
        'today_date': current_date.isoformat(),
        'department_code': department.code,
        'department_name': department.name,
        'total_students': total_students_in_dept,
        'total_faculty': total_faculty_in_dept,
        'total_sections': department_sections.count(),
        'threshold': warning_threshold,
        'today_sessions': {
            'total': total_sessions_today,
            'taken': completed_sessions_today,
            'pending': pending_sessions_today
        },
        'faculty_attendance_summary': {
            'present_count': len(present_faculty_ids),
            'late_count': len(late_faculty_ids),
            'absent_count': len(absent_faculty_ids),
            'not_logged_count': max(0, total_faculty_in_dept - len(present_faculty_ids) - len(late_faculty_ids) - len(absent_faculty_ids)),
            'absent_or_late_faculty': flagged_faculty_exceptions
        },
        'missing_sessions_count': overdue_unmarked_sessions.count(),
        'missing_sessions_sample': [
            {
                'session_id': session.id,
                'date': session.session_date,
                'time': f"{session.start_time.strftime('%H:%M')} - {session.end_time.strftime('%H:%M')}",
                'faculty_id': session.allocation.faculty.faculty_id,
                'faculty_name': session.allocation.faculty.user.get_full_name(),
                'subject_code': session.allocation.subject.code,
                'section_name': session.allocation.section.name,
            }
            for session in overdue_unmarked_sessions
        ],
        'sections': section_breakdown_list,
        'recent_corrections': [
            {
                'id': log.id,
                'student_id': log.record.student.student_id,
                'student_name': log.record.student.user.get_full_name(),
                'subject_code': log.record.session.allocation.subject.code,
                'section_name': log.record.session.allocation.section.name,
                'original_status': log.original_status,
                'new_status': log.new_status,
                'reason': log.reason,
                'corrected_by': log.corrected_by.get_full_name(),
                'timestamp': log.timestamp
            }
            for log in recent_audit_corrections
        ]
    }


def get_low_attendance_students(department_id=None, section_id=None, threshold=None) -> List[Dict[str, Any]]:
    """
    Scans the student body to identify individuals whose attendance percentage falls below
    the institutionally mandated threshold. Supports optional filtering by department and section.
    """
    # Fall back to global system threshold if not specified
    if threshold is None:
        threshold = SystemSetting.get_float('LOW_ATTENDANCE_THRESHOLD', 75.0)

    # Base student query pre-loading relational models
    students_query = StudentProfile.objects.select_related('user', 'department', 'section')

    # Apply department filter if supplied
    if department_id:
        students_query = students_query.filter(department_id=department_id)

    # Apply section filter if supplied
    if section_id:
        students_query = students_query.filter(section_id=section_id)

    defaulters_list = []

    # Optimize database queries by batch calculating attendance counts using GROUP BY
    student_records_summary = AttendanceRecord.objects.values('student_id').annotate(
        total_sessions=Count('id'),
        present_sessions=Count('id', filter=Q(status=AttendanceRecord.Status.PRESENT))
    )
    records_lookup_map = {item['student_id']: item for item in student_records_summary}

    for student in students_query:
        record_summary = records_lookup_map.get(student.id)

        # Check if the student has any recorded sessions
        if record_summary and record_summary['total_sessions'] > 0:
            total_classes = record_summary['total_sessions']
            attended_classes = record_summary['present_sessions']
            attendance_pct = round((attended_classes / total_classes * 100), 2)

            # Evaluate against threshold constraint
            if attendance_pct < threshold:
                defaulters_list.append({
                    'student_profile_id': student.id,
                    'student_id': student.student_id,
                    'student_name': student.user.get_full_name(),
                    'department_code': student.department.code,
                    'section_name': student.section.name,
                    'semester': student.semester,
                    'email': student.user.email,
                    'phone': student.user.phone,
                    'total_classes': total_classes,
                    'present_classes': attended_classes,
                    'absent_classes': total_classes - attended_classes,
                    'attendance_percentage': attendance_pct,
                    'threshold': threshold
                })

    # Sort list with lowest attendance percentage at top for urgent intervention
    defaulters_list.sort(key=lambda item: item['attendance_percentage'])
    return defaulters_list
