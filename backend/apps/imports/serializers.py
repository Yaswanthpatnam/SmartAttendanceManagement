"""
Bulk Import API Serializers
===========================
Defines serializers for reporting onboarding batch statuses, previewing staged rows,
and returning row-level validation errors.
"""

from rest_framework import serializers
from apps.imports.models import BulkImportBatch, BulkImportRowError


class BulkImportRowErrorSerializer(serializers.ModelSerializer):
    """
    Serializes a single line error diagnostic for display in the admin error report table.
    """

    class Meta:
        model = BulkImportRowError
        fields = [
            'id',
            'row_number',
            'field_name',
            'raw_value',
            'error_reason'
        ]


class BulkImportBatchSerializer(serializers.ModelSerializer):
    """
    Summary view of an import batch for listing within the historical admin audit log.
    """

    created_by_name = serializers.CharField(source='created_by.get_full_name', read_only=True)
    import_type_display = serializers.CharField(source='get_import_type_display', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)

    class Meta:
        model = BulkImportBatch
        fields = [
            'id',
            'batch_id',
            'import_type',
            'import_type_display',
            'file_name',
            'total_rows',
            'valid_rows',
            'invalid_rows',
            'duplicate_rows',
            'imported_rows',
            'status',
            'status_display',
            'created_by_name',
            'created_at',
            'completed_at'
        ]


class BatchDetailPreviewSerializer(serializers.ModelSerializer):
    """
    Detailed serializer returned immediately following file upload.
    Contains processing metrics, row-level error breakdown, and a preview slice of valid rows.
    """

    row_errors = BulkImportRowErrorSerializer(many=True, read_only=True)
    preview_valid_rows = serializers.SerializerMethodField()

    class Meta:
        model = BulkImportBatch
        fields = [
            'id',
            'batch_id',
            'import_type',
            'file_name',
            'total_rows',
            'valid_rows',
            'invalid_rows',
            'duplicate_rows',
            'imported_rows',
            'status',
            'preview_valid_rows',
            'row_errors',
            'created_at',
            'completed_at'
        ]

    def get_preview_valid_rows(self, obj):
        """
        Returns a sample of the first 50 staged rows for client-side table rendering.
        Prevents oversized network payloads when files contain thousands of records.
        """
        # Return first 50 staged records for UI table preview
        return obj.staged_data[:50]
