"""
Core Attendance Data Models
===========================
This module defines the database models responsible for tracking student attendance,
preserving an immutable audit log of manual corrections, and recording faculty biometric
punch-in events.
"""

from django.db import models
from django.conf import settings
from apps.academic.models import ClassSession, StudentProfile, FacultyProfile


class AttendanceRecord(models.Model):
    """
    Tracks an individual student's attendance status for a scheduled class session.
    
    Database constraints:
    - Unique together on ('session', 'student') to prevent duplicate records for the same period.
    - Composite indexes on (student, status) and (session, status) to optimize aggregate reporting.
    """

    class Status(models.TextChoices):
        PRESENT = 'PRESENT', 'Present'
        ABSENT = 'ABSENT', 'Absent'
        EXCUSED = 'EXCUSED', 'Excused'

    # Foreign key relations
    session = models.ForeignKey(
        ClassSession,
        on_delete=models.CASCADE,
        related_name='attendance_records',
        help_text="The specific timetable class session being marked"
    )
    student = models.ForeignKey(
        StudentProfile,
        on_delete=models.CASCADE,
        related_name='attendance_records',
        help_text="The enrolled student whose presence is recorded"
    )

    # Attendance state
    status = models.CharField(
        max_length=15,
        choices=Status.choices,
        default=Status.PRESENT,
        help_text="Current attendance state: PRESENT, ABSENT, or EXCUSED"
    )

    # Auditing timestamps
    recorded_at = models.DateTimeField(
        auto_now_add=True,
        help_text="Timestamp when the attendance was initially recorded"
    )
    updated_at = models.DateTimeField(
        auto_now=True,
        help_text="Timestamp when the record was last modified"
    )

    class Meta:
        unique_together = ('session', 'student')
        indexes = [
            models.Index(fields=['student', 'status']),
            models.Index(fields=['session', 'status']),
        ]

    def __str__(self):
        """
        Human-readable representation combining student ID, course code, and attendance status.
        """
        # Build descriptive identification string for debugging and admin console
        return f"{self.student.student_id} - {self.session.allocation.subject.code} : {self.status}"


class AttendanceCorrectionLog(models.Model):
    """
    Immutable audit log entry for attendance modifications.
    
    Academic compliance mandates that whenever a student's attendance record is changed
    after initial submission, the system records:
    1. The target attendance record
    2. The previous status and the newly assigned status
    3. Mandatory written justification provided by the user
    4. The user account executing the modification
    5. An exact system timestamp
    """

    record = models.ForeignKey(
        AttendanceRecord,
        on_delete=models.CASCADE,
        related_name='corrections',
        help_text="The attendance record that underwent modification"
    )
    original_status = models.CharField(
        max_length=15,
        help_text="Previous status before the correction took place"
    )
    new_status = models.CharField(
        max_length=15,
        help_text="Newly updated status after correction"
    )
    reason = models.TextField(
        help_text="Mandatory audit justification provided by the modifier"
    )
    corrected_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='attendance_corrections',
        help_text="User (faculty, HOD, or admin) who performed the correction"
    )
    timestamp = models.DateTimeField(
        auto_now_add=True,
        db_index=True,
        help_text="Date and time when the correction was committed"
    )

    class Meta:
        ordering = ['-timestamp']

    def __str__(self):
        """
        Formatted description indicating who changed whose record and the status delta.
        """
        # Return informative log descriptor for audit viewsets
        return f"Correction for {self.record.student.student_id} by {self.corrected_by.username} ({self.original_status} -> {self.new_status})"


class FacultyBiometricLog(models.Model):
    """
    Captures physical biometric punch-in logs for faculty members.
    
    Used to track faculty presence on campus, supporting arrival time audits,
    late mark detection, and automated substitution workflows when an instructor is absent.
    """

    class PunchStatus(models.TextChoices):
        PRESENT = 'PRESENT', 'Present'
        LATE = 'LATE', 'Late'
        ABSENT = 'ABSENT', 'Absent'

    faculty = models.ForeignKey(
        FacultyProfile,
        on_delete=models.CASCADE,
        related_name='biometric_logs',
        help_text="Faculty member associated with this biometric event"
    )
    punch_time = models.DateTimeField(
        null=True,
        blank=True,
        db_index=True,
        help_text="Exact timestamp registered by the physical biometric sensor"
    )
    date = models.DateField(
        db_index=True,
        help_text="Calendar date of the punch event"
    )
    status = models.CharField(
        max_length=15,
        choices=PunchStatus.choices,
        default=PunchStatus.PRESENT,
        help_text="Evaluation status based on institutional reporting hours"
    )
    device_id = models.CharField(
        max_length=50,
        default='BIO-GATE-01',
        help_text="Hardware identifier of the biometric terminal"
    )
    created_at = models.DateTimeField(
        auto_now_add=True,
        help_text="System ingestion timestamp"
    )

    class Meta:
        unique_together = ('faculty', 'date')
        ordering = ['-date', 'faculty']
        indexes = [
            models.Index(fields=['date', 'status']),
        ]

    def __str__(self):
        """
        Human-readable summary of the faculty daily punch record.
        """
        # Formatted string for quick identification
        return f"{self.faculty.faculty_id} on {self.date}: {self.status}"
