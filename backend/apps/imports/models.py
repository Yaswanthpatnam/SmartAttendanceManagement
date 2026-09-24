"""
Bulk Onboarding Data Models
===========================
This module defines the database models for managing two-phase bulk imports
of students and faculty members from structured CSV data files.
"""

import uuid
from django.db import models
from django.conf import settings


class BulkImportBatch(models.Model):
    """
    Represents an institutional batch onboarding transaction.
    
    The onboarding workflow follows a strict two-phase pattern:
    Phase 1: CSV upload, syntax parsing, semantic schema validation, duplicate detection,
             and staging of validated records without committing to core user tables.
    Phase 2: Administrative review of validation stats and preview rows, followed by
             atomic batch insertion, password initialization, and sequential ID generation.
    """

    class ImportType(models.TextChoices):
        STUDENT = 'STUDENT', 'Student Onboarding'
        FACULTY = 'FACULTY', 'Faculty Onboarding'

    class Status(models.TextChoices):
        PREVIEW_READY = 'PREVIEW_READY', 'Validation Complete (Awaiting Confirmation)'
        COMPLETED = 'COMPLETED', 'Successfully Imported'
        FAILED = 'FAILED', 'Import Failed'

    # Globally unique batch tracking identifier
    batch_id = models.UUIDField(
        default=uuid.uuid4,
        unique=True,
        editable=False,
        db_index=True,
        help_text="Unique UUID assigned to this onboarding batch"
    )

    # Classification of data entities within this file
    import_type = models.CharField(
        max_length=20,
        choices=ImportType.choices,
        help_text="Entity type being imported (STUDENT or FACULTY)"
    )

    # Original filename uploaded by the administrator
    file_name = models.CharField(
        max_length=255,
        help_text="Original uploaded filename for audit references"
    )

    # Processing accounting metrics
    total_rows = models.PositiveIntegerField(
        default=0,
        help_text="Total number of data rows parsed from the source CSV file"
    )
    valid_rows = models.PositiveIntegerField(
        default=0,
        help_text="Number of parsed rows that satisfied all structural and semantic validation rules"
    )
    invalid_rows = models.PositiveIntegerField(
        default=0,
        help_text="Number of rows rejected due to missing values or format errors"
    )
    duplicate_rows = models.PositiveIntegerField(
        default=0,
        help_text="Number of rows rejected due to duplicate email addresses or identifiers"
    )
    imported_rows = models.PositiveIntegerField(
        default=0,
        help_text="Actual number of student/faculty records created upon batch confirmation"
    )

    # Lifecycle state
    status = models.CharField(
        max_length=30,
        choices=Status.choices,
        default=Status.PREVIEW_READY,
        help_text="Current processing phase of the batch"
    )

    # Staged payload stored as structured JSON until admin approval
    staged_data = models.JSONField(
        default=list,
        help_text="Validated rows staged for confirmation"
    )

    # User attribution
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='import_batches',
        help_text="Administrator who initiated this import"
    )

    # Timestamps
    created_at = models.DateTimeField(
        auto_now_add=True,
        help_text="Timestamp when the file was uploaded and validated"
    )
    completed_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Timestamp when the administrator finalized the database commit"
    )

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        """
        Formatted label identifying batch type, abbreviated UUID, and lifecycle state.
        """
        # Truncate UUID for clean log output
        abbreviated_uuid = str(self.batch_id)[:8]
        return f"{self.get_import_type_display()} Batch {abbreviated_uuid} ({self.status})"


class BulkImportRowError(models.Model):
    """
    Granular diagnostic log detailing specific cell or row validation errors.
    Allows administrators to diagnose why a row was rejected and rectify their CSV.
    """

    batch = models.ForeignKey(
        BulkImportBatch,
        on_delete=models.CASCADE,
        related_name='row_errors',
        help_text="Parent import batch containing this validation failure"
    )
    row_number = models.PositiveIntegerField(
        help_text="1-based physical line index in the source CSV file"
    )
    field_name = models.CharField(
        max_length=100,
        help_text="Specific column attribute that caused the validation failure"
    )
    raw_value = models.TextField(
        blank=True,
        null=True,
        help_text="Unprocessed cell value extracted from the file"
    )
    error_reason = models.TextField(
        help_text="Human-readable explanation of why the value is invalid"
    )

    class Meta:
        ordering = ['batch', 'row_number']

    def __str__(self):
        """
        Diagnostic summary line for audit tracking.
        """
        # Formatted log string specifying row, column, and reason
        abbreviated_uuid = str(self.batch.batch_id)[:8]
        return f"Batch {abbreviated_uuid} Row {self.row_number}: {self.field_name} - {self.error_reason}"
