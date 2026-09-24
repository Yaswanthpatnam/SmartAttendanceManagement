"""
Attendance Domain Services
==========================
This module encapsulates core transactional logic for:
1. Recording batch student attendance for academic class sessions.
2. Handling manual attendance corrections with mandatory audit logging.
3. Generating granular student attendance summaries, threshold alerts, and monthly trends.
"""

from typing import List, Dict, Any
from django.db import transaction
from django.utils import timezone
from django.core.exceptions import PermissionDenied, ValidationError
from collections import defaultdict
from apps.academic.models import ClassSession, StudentProfile
from apps.attendance.models import AttendanceRecord, AttendanceCorrectionLog
from apps.core.models import User, SystemSetting


def submit_session_attendance(session_id: int, records: List[Dict[str, Any]], user: User) -> Dict[str, Any]:
    """
    Submits student attendance records for a scheduled class session within an atomic transaction.
    
    Security & Business Rules:
    - Only the assigned faculty, designated substitute, department HOD, or system administrator can submit.
    - Updates existing records if already marked or creates new records.
    - Stamps the class session as attendance taken with user attribution and timestamp.
    """
    # Attempt to locate the session along with allocation dependencies
    try:
        session = ClassSession.objects.select_related(
            'allocation__faculty__user',
            'allocation__subject__department',
            'allocation__section',
            'substitute_faculty__user'
        ).get(pk=session_id)
    except ClassSession.DoesNotExist:
        # Halt execution if session primary key is invalid
        raise ValidationError(f"Class session with ID {session_id} does not exist.")

    # Evaluate authorization permissions
    is_allocated_faculty = (session.allocation.faculty.user == user)
    is_substitute_faculty = bool(session.substitute_faculty and session.substitute_faculty.user == user)
    is_system_administrator = (user.role == User.Role.ADMIN)

    # Determine whether user is the department HOD
    is_department_hod = False
    if user.role == User.Role.HOD:
        hod_department = getattr(user, 'managed_department', None)
        if not hod_department and hasattr(user, 'faculty_profile'):
            hod_department = user.faculty_profile.department
        
        # Check if HOD manages the subject's department
        is_department_hod = (hod_department == session.allocation.subject.department)
    else:
        is_department_hod = False

    # Check overall permission grants
    has_permission = (
        is_allocated_faculty or
        is_substitute_faculty or
        is_system_administrator or
        is_department_hod or
        user.role in [User.Role.PRINCIPAL, User.Role.VICE_PRINCIPAL]
    )
    if not has_permission:
        # Reject unauthorized caller
        raise PermissionDenied("You are not authorized to record attendance for this class session.")

    # Fetch valid enrolled students for the session's section to safeguard against foreign student entries
    target_section = session.allocation.section
    valid_students_lookup = {
        student.id: student
        for student in StudentProfile.objects.filter(section=target_section)
    }

    # Execute database writes in a single ACID transaction
    with transaction.atomic():
        created_count = 0
        updated_count = 0

        # Iterate over submitted student status payloads
        for item in records:
            student_profile_id = item.get('student_id')
            status = item.get('status', AttendanceRecord.Status.PRESENT)

            # Ignore entries where student does not belong to the target class section
            if student_profile_id not in valid_students_lookup:
                continue

            target_student = valid_students_lookup[student_profile_id]

            # Upsert attendance record for the student and session combination
            record, created = AttendanceRecord.objects.update_or_create(
                session=session,
                student=target_student,
                defaults={'status': status}
            )

            # Track metrics for response reporting
            if created:
                created_count += 1
            else:
                updated_count += 1

        # Mark session as completed and record authoring metadata
        session.is_attendance_taken = True
        session.attendance_taken_at = timezone.now()
        session.attendance_taken_by = user
        session.save()

    return {
        "session_id": session.id,
        "total_records": len(records),
        "created_count": created_count,
        "updated_count": updated_count,
        "is_attendance_taken": True
    }


def correct_attendance_record(record_id: int, new_status: str, reason: str, user: User) -> AttendanceRecord:
    """
    Modifies an existing attendance record and logs an immutable audit trail entry.
    Requires an explicit justification reason from the requester.
    """
    # Enforce mandatory justification string
    if not reason or not reason.strip():
        raise ValidationError("A clear audit justification is required to modify attendance records.")

    # Retrieve target attendance record with related models for permission validation
    try:
        record = AttendanceRecord.objects.select_related(
            'session__allocation__faculty__user',
            'session__allocation__subject__department',
            'student__user'
        ).get(pk=record_id)
    except AttendanceRecord.DoesNotExist:
        raise ValidationError("Target attendance record not found.")

    # Verify authorization
    is_session_teacher = (record.session.allocation.faculty.user == user)
    is_administrator = (user.role == User.Role.ADMIN)

    # Check HOD authority
    is_department_hod = False
    if user.role == User.Role.HOD:
        hod_department = getattr(user, 'managed_department', None)
        if not hod_department and hasattr(user, 'faculty_profile'):
            hod_department = user.faculty_profile.department
        is_department_hod = (hod_department == record.session.allocation.subject.department)
    else:
        is_department_hod = False

    # Enforce permission boundary
    has_authority = (
        is_session_teacher or
        is_administrator or
        is_department_hod or
        user.role in [User.Role.PRINCIPAL, User.Role.VICE_PRINCIPAL]
    )
    if not has_authority:
        raise PermissionDenied("You do not have administrative authority to alter this attendance record.")

    # If status is unchanged, return record directly without logging redundant correction
    original_status = record.status
    if original_status == new_status:
        return record

    # Perform atomic audit log creation and status update
    with transaction.atomic():
        # Insert immutable correction audit record
        AttendanceCorrectionLog.objects.create(
            record=record,
            original_status=original_status,
            new_status=new_status,
            reason=reason.strip(),
            corrected_by=user
        )

        # Update record status in database
        record.status = new_status
        record.save()

    return record


def get_student_attendance_summary(student: StudentProfile) -> Dict[str, Any]:
    """
    Calculates dynamic attendance metrics and analytics for a given student profile:
    - Aggregate attendance percentage
    - Course-wise attendance breakdowns with warning indicators
    - Chronological monthly attendance rates
    - Assigned section counsellor details
    """
    # Retrieve system low-attendance warning threshold (default 75%)
    warning_threshold = SystemSetting.get_float('LOW_ATTENDANCE_THRESHOLD', 75.0)

    # Retrieve all conducted class sessions for this student's assigned section
    conducted_sessions = ClassSession.objects.filter(
        allocation__section=student.section,
        is_attendance_taken=True
    ).select_related(
        'allocation__subject',
        'allocation__faculty__user'
    ).order_by('session_date', 'start_time')

    # Build dictionary mapping session ID to recorded attendance status
    student_records_map = {
        record.session_id: record.status
        for record in AttendanceRecord.objects.filter(student=student)
    }

    # Aggregate attendance by academic subject
    subject_aggregation_map: Dict[int, Dict[str, Any]] = {}
    total_classes_conducted = 0
    total_classes_attended = 0

    for session in conducted_sessions:
        subject = session.allocation.subject
        
        # Initialize dictionary entry for course if not already present
        if subject.id not in subject_aggregation_map:
            subject_aggregation_map[subject.id] = {
                'subject_id': subject.id,
                'subject_code': subject.code,
                'subject_name': subject.name,
                'faculty_name': session.allocation.faculty.user.get_full_name(),
                'total_sessions': 0,
                'present_sessions': 0,
                'absent_sessions': 0,
                'percentage': 0.0,
                'is_low_attendance': False
            }

        subject_aggregation_map[subject.id]['total_sessions'] += 1
        total_classes_conducted += 1

        # Check recorded attendance status for this specific session
        recorded_status = student_records_map.get(session.id, AttendanceRecord.Status.ABSENT)
        if recorded_status == AttendanceRecord.Status.PRESENT:
            # Student was present
            subject_aggregation_map[subject.id]['present_sessions'] += 1
            total_classes_attended += 1
        else:
            # Student was absent or excused without full attendance credit
            subject_aggregation_map[subject.id]['absent_sessions'] += 1

    # Compute percentage and warning flags for each individual course
    subjects_summary_list = []
    low_attendance_subject_codes = []

    for item in subject_aggregation_map.values():
        total_sessions = item['total_sessions']
        present_sessions = item['present_sessions']

        # Calculate subject-level percentage safely avoiding division by zero
        if total_sessions > 0:
            percentage = round((present_sessions / total_sessions * 100), 2)
        else:
            percentage = 100.0

        item['percentage'] = percentage

        # Flag courses that fall below institutional threshold
        if percentage < warning_threshold:
            item['is_low_attendance'] = True
            low_attendance_subject_codes.append(item['subject_code'])
        else:
            item['is_low_attendance'] = False

        subjects_summary_list.append(item)

    # Compute aggregate college attendance percentage
    if total_classes_conducted > 0:
        overall_percentage = round((total_classes_attended / total_classes_conducted * 100), 2)
    else:
        overall_percentage = 100.0

    # Aggregate monthly breakdown
    monthly_data = defaultdict(lambda: {'total': 0, 'present': 0, 'absent': 0, 'month_name': ''})

    for session in conducted_sessions:
        month_key = session.session_date.strftime('%Y-%m')
        month_label = session.session_date.strftime('%B %Y')
        monthly_data[month_key]['month_name'] = month_label
        monthly_data[month_key]['total'] += 1

        recorded_status = student_records_map.get(session.id, AttendanceRecord.Status.ABSENT)
        if recorded_status == AttendanceRecord.Status.PRESENT:
            monthly_data[month_key]['present'] += 1
        else:
            monthly_data[month_key]['absent'] += 1

    # Format monthly summary list sorted chronologically descending
    monthly_breakdown = []
    for month_key in sorted(monthly_data.keys(), reverse=True):
        month_info = monthly_data[month_key]
        total_month = month_info['total']
        present_month = month_info['present']

        if total_month > 0:
            month_pct = round((present_month / total_month * 100), 1)
        else:
            month_pct = 0.0

        # Classify monthly health status
        if month_pct >= warning_threshold:
            status_label = 'Good'
        elif month_pct >= 65.0:
            status_label = 'Warning'
        else:
            status_label = 'Critical'

        monthly_breakdown.append({
            'month_key': month_key,
            'month_name': month_info['month_name'],
            'total': total_month,
            'present': present_month,
            'absent': month_info['absent'],
            'percentage': month_pct,
            'status': status_label
        })

    # Prepare counsellor contact card information
    counsellor_data = None
    if student.section and student.section.counsellor:
        counsellor = student.section.counsellor
        counsellor_phone = getattr(counsellor.user, 'phone', None)
        counsellor_data = {
            'id': counsellor.id,
            'name': counsellor.user.get_full_name(),
            'faculty_id': counsellor.faculty_id,
            'email': counsellor.user.email,
            'phone': counsellor_phone if counsellor_phone else 'N/A'
        }

    return {
        'student_id': student.student_id,
        'student_name': student.user.get_full_name(),
        'roll_number': student.student_id,
        'department_code': student.department.code,
        'section_name': student.section.name,
        'semester': student.semester,
        'threshold': warning_threshold,
        'today_date': timezone.localdate().isoformat(),
        'counsellor': counsellor_data,
        'total_classes': total_classes_conducted,
        'total_present': total_classes_attended,
        'total_absent': total_classes_conducted - total_classes_attended,
        'overall_percentage': overall_percentage,
        'is_low_attendance': overall_percentage < warning_threshold,
        'low_attendance_subjects': low_attendance_subject_codes,
        'subjects': subjects_summary_list,
        'monthly_breakdown': monthly_breakdown
    }
