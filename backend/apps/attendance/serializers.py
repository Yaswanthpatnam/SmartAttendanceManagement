"""
Attendance API Serializers
==========================
Defines serializers for reading attendance records, submitting batch session rosters,
requesting manual corrections with audit rationale, and viewing biometric logs.
"""

from rest_framework import serializers
from apps.attendance.models import AttendanceRecord, AttendanceCorrectionLog, FacultyBiometricLog


class AttendanceRecordSerializer(serializers.ModelSerializer):
    """
    Detailed read serializer for an individual student attendance record.
    Flattens related metadata (student identifier, full name, session date, subject code).
    """

    student_id_code = serializers.CharField(source='student.student_id', read_only=True)
    student_name = serializers.CharField(source='student.user.get_full_name', read_only=True)
    session_topic = serializers.CharField(source='session.topic', read_only=True)
    session_date = serializers.DateField(source='session.session_date', read_only=True)
    subject_code = serializers.CharField(source='session.allocation.subject.code', read_only=True)

    class Meta:
        model = AttendanceRecord
        fields = [
            'id',
            'session',
            'student',
            'student_id_code',
            'student_name',
            'status',
            'recorded_at',
            'updated_at',
            'session_topic',
            'session_date',
            'subject_code'
        ]


class AttendanceRecordSubmitItemSerializer(serializers.Serializer):
    """
    Validates a single student entry within a batch attendance submission payload.
    """

    student_id = serializers.IntegerField(
        help_text="Database primary key (ID) of the StudentProfile"
    )
    status = serializers.ChoiceField(
        choices=AttendanceRecord.Status.choices,
        help_text="Attendance status to set: PRESENT, ABSENT, or EXCUSED"
    )


class SubmitSessionAttendanceSerializer(serializers.Serializer):
    """
    Validates the entire batch attendance submission payload for a scheduled class session.
    """

    records = AttendanceRecordSubmitItemSerializer(
        many=True,
        help_text="List of individual student attendance status objects"
    )


class AttendanceCorrectionSerializer(serializers.Serializer):
    """
    Validates payload for requesting an attendance status correction.
    Requires a valid new status and an audit rationale with a minimum of 5 characters.
    """

    new_status = serializers.ChoiceField(
        choices=AttendanceRecord.Status.choices,
        help_text="Target attendance status"
    )
    reason = serializers.CharField(
        min_length=5,
        max_length=500,
        help_text="Explicit justification explaining why this record is being modified"
    )


class AttendanceCorrectionLogSerializer(serializers.ModelSerializer):
    """
    Read serializer for displaying historical audit log entries of attendance modifications.
    """

    student_id = serializers.CharField(source='record.student.student_id', read_only=True)
    student_name = serializers.CharField(source='record.student.user.get_full_name', read_only=True)
    subject_code = serializers.CharField(source='record.session.allocation.subject.code', read_only=True)
    section_name = serializers.CharField(source='record.session.allocation.section.name', read_only=True)
    corrected_by_name = serializers.CharField(source='corrected_by.get_full_name', read_only=True)

    class Meta:
        model = AttendanceCorrectionLog
        fields = [
            'id',
            'record',
            'student_id',
            'student_name',
            'subject_code',
            'section_name',
            'original_status',
            'new_status',
            'reason',
            'corrected_by',
            'corrected_by_name',
            'timestamp'
        ]


class FacultyBiometricLogSerializer(serializers.ModelSerializer):
    """
    Serializer for displaying daily biometric gate punches recorded for faculty members.
    """

    faculty_id_code = serializers.CharField(source='faculty.faculty_id', read_only=True)
    faculty_name = serializers.CharField(source='faculty.user.get_full_name', read_only=True)
    department_code = serializers.CharField(source='faculty.department.code', read_only=True)

    class Meta:
        model = FacultyBiometricLog
        fields = [
            'id',
            'faculty',
            'faculty_id_code',
            'faculty_name',
            'department_code',
            'punch_time',
            'date',
            'status',
            'device_id'
        ]
