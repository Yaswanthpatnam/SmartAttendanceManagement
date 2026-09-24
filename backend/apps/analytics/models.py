"""
Institutional Analytics and Exception Tracking Models
=====================================================
This module defines models that record operational exceptions in attendance,
faculty emergency substitutions, and administrative escalation logs.
"""

from django.db import models
from django.conf import settings
from apps.academic.models import ClassSession, FacultyProfile


class FacultySubstitution(models.Model):
    """
    Records planned or emergency substitutions when an instructor cannot conduct a scheduled class session.
    
    Provides academic continuity tracking and ensures substitution records are visible on
    departmental dashboards and faculty timetables.
    """

    # Link to the scheduled session requiring substitute coverage
    session = models.OneToOneField(
        ClassSession,
        on_delete=models.CASCADE,
        related_name='substitution_record',
        help_text="The specific class session being covered"
    )

    # Primary instructor who is on leave or absent
    absent_faculty = models.ForeignKey(
        FacultyProfile,
        on_delete=models.CASCADE,
        related_name='substitutions_as_absent',
        help_text="The originally allocated instructor who is unavailable"
    )

    # Substitute instructor assigned to teach the period
    substitute_faculty = models.ForeignKey(
        FacultyProfile,
        on_delete=models.CASCADE,
        related_name='substitutions_as_substitute',
        help_text="The replacement faculty assigned to conduct the session"
    )

    # Administrative author who authorized the substitution
    assigned_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        help_text="HOD or administrative user who approved the arrangement"
    )

    # Contextual notes or pedagogical instructions
    notes = models.TextField(
        blank=True,
        help_text="Optional remarks regarding syllabus coverage or substitution rationale"
    )

    # Creation timestamp
    created_at = models.DateTimeField(
        auto_now_add=True,
        help_text="Timestamp when the substitution was formally recorded"
    )

    def __str__(self):
        """
        Readable description showing session details and faculty substitution pairing.
        """
        # Compose descriptive string indicating substitution transaction
        return f"Substitution for {self.session} ({self.absent_faculty.faculty_id} -> {self.substitute_faculty.faculty_id})"


class AttendanceExceptionLog(models.Model):
    """
    Automated and manual alerts highlighting operational risks across departments:
    - Missing attendance submissions past timetable completion
    - Critical student attendance drops below statutory threshold
    - Instructor absenteeism without timely substitution
    - Anomalous spikes in post-submission attendance corrections
    """

    class ExceptionType(models.TextChoices):
        MISSING_ATTENDANCE = 'MISSING_ATTENDANCE', 'Missing Class Attendance'
        LOW_ATTENDANCE = 'LOW_ATTENDANCE', 'Low Student Attendance (< Threshold)'
        FACULTY_ABSENT = 'FACULTY_ABSENT', 'Assigned Faculty Absent from Campus'
        UNAUTHORIZED_CORRECTION = 'UNAUTHORIZED_CORRECTION', 'Anomalous Correction Spike'

    exception_type = models.CharField(
        max_length=40,
        choices=ExceptionType.choices,
        help_text="Category of academic exception identified"
    )
    department = models.ForeignKey(
        'academic.Department',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        help_text="Department within which the exception originated"
    )
    description = models.TextField(
        help_text="Detailed diagnostic narrative explaining the detected anomaly"
    )
    is_acknowledged = models.BooleanField(
        default=False,
        help_text="Indicates whether the HOD or Dean has formally acknowledged this alert"
    )
    acknowledged_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        help_text="User who marked this exception as acknowledged"
    )
    created_at = models.DateTimeField(
        auto_now_add=True,
        db_index=True,
        help_text="Detection timestamp"
    )

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        """
        Formatted label displaying exception category and detection timestamp.
        """
        # Format human-readable event headline
        formatted_date = self.created_at.strftime('%Y-%m-%d %H:%M')
        return f"{self.get_exception_type_display()} - {formatted_date}"
