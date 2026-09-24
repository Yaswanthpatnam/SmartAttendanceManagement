"""
Bulk Onboarding API Controllers
===============================
This module exposes administrative endpoints for managing bulk CSV uploads:
1. Student roster CSV upload, parsing, and validation preview.
2. Faculty roster CSV upload, parsing, and validation preview.
3. Detailed inspection of staged rows and validation errors.
4. Transactional confirmation and database commit.
5. Historical import batch audit log.
"""

from rest_framework import viewsets, views, permissions, status, response
from rest_framework.parsers import MultiPartParser, FormParser
from django.shortcuts import get_object_or_404
from django.core.exceptions import ValidationError
from apps.core.permissions import IsAdminRole
from apps.imports.models import BulkImportBatch
from apps.imports.serializers import BulkImportBatchSerializer, BatchDetailPreviewSerializer
from apps.imports.services.csv_import_service import (
    validate_and_stage_student_csv,
    commit_student_import,
    validate_and_stage_faculty_csv,
    commit_faculty_import
)


class UploadStudentCSVView(views.APIView):
    """
    Onboarding Phase 1: Accepts student CSV upload, parses rows, validates structure and data,
    and returns a staging preview with counts of valid, invalid, and duplicate rows.
    """

    permission_classes = [IsAdminRole]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        """
        Receives multipart form upload of student CSV and triggers validation service.
        """
        uploaded_file = request.FILES.get('file')

        # Verify file existence in request payload
        if not uploaded_file:
            return response.Response(
                {'error': 'No file payload was detected in the request.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Enforce CSV file extension check
        if not uploaded_file.name.lower().endswith('.csv'):
            return response.Response(
                {'error': 'Unsupported file format. Please upload a valid CSV file (.csv extension).'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            # Delegate parsing and semantic validation to business service
            staged_batch = validate_and_stage_student_csv(uploaded_file, request.user)
            serializer = BatchDetailPreviewSerializer(staged_batch)
            return response.Response(serializer.data, status=status.HTTP_201_CREATED)
        except ValidationError as validation_err:
            # Return validation failure message
            return response.Response({'error': str(validation_err)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as system_err:
            # Handle unexpected runtime parsing errors
            return response.Response(
                {'error': f"Failed to process CSV file: {str(system_err)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class UploadFacultyCSVView(views.APIView):
    """
    Onboarding Phase 1: Accepts faculty CSV upload, validates records,
    and returns staged preview metrics without altering user databases.
    """

    permission_classes = [IsAdminRole]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        """
        Receives multipart form upload of faculty CSV and executes validation.
        """
        uploaded_file = request.FILES.get('file')

        # Verify file presence
        if not uploaded_file:
            return response.Response(
                {'error': 'No file payload was detected in the request.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Enforce CSV extension
        if not uploaded_file.name.lower().endswith('.csv'):
            return response.Response(
                {'error': 'Unsupported file format. Please provide a standard .csv spreadsheet.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            # Execute parsing and staging logic
            staged_batch = validate_and_stage_faculty_csv(uploaded_file, request.user)
            serializer = BatchDetailPreviewSerializer(staged_batch)
            return response.Response(serializer.data, status=status.HTTP_201_CREATED)
        except ValidationError as validation_err:
            return response.Response({'error': str(validation_err)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as system_err:
            return response.Response(
                {'error': f"Failed to process faculty CSV: {str(system_err)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class BatchPreviewDetailView(views.APIView):
    """
    Retrieves full preview metrics, sample staged rows, and row-level diagnostic errors
    for a specific import batch identifier.
    """

    permission_classes = [IsAdminRole]

    def get(self, request, batch_id):
        """
        Looks up batch by UUID and serializes preview response.
        """
        # Retrieve target batch record or respond 404
        import_batch = get_object_or_404(BulkImportBatch, batch_id=batch_id)
        serializer = BatchDetailPreviewSerializer(import_batch)
        return response.Response(serializer.data)


class ConfirmImportBatchView(views.APIView):
    """
    Onboarding Phase 2: Administrative confirmation trigger.
    Reads staged valid rows and executes atomic creation of user records,
    credential assignment, and institutional roll number allocation.
    """

    permission_classes = [IsAdminRole]

    def post(self, request, batch_id):
        """
        Commits validated batch records to the database within an ACID transaction.
        """
        import_batch = get_object_or_404(BulkImportBatch, batch_id=batch_id)

        try:
            # Branch according to batch entity type
            if import_batch.import_type == BulkImportBatch.ImportType.STUDENT:
                # Commit student accounts and academic profiles
                commit_summary = commit_student_import(import_batch)
            elif import_batch.import_type == BulkImportBatch.ImportType.FACULTY:
                # Commit faculty accounts and department associations
                commit_summary = commit_faculty_import(import_batch)
            else:
                # Unrecognized batch type safety check
                return response.Response(
                    {'error': 'Unrecognized or unsupported import batch category.'},
                    status=status.HTTP_400_BAD_REQUEST
                )

            return response.Response(commit_summary, status=status.HTTP_200_OK)
        except ValidationError as validation_err:
            return response.Response({'error': str(validation_err)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as system_err:
            return response.Response(
                {'error': f"Batch database transaction failed: {str(system_err)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class ImportHistoryViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Audit Viewset: Provides a chronological audit trail of all bulk import transactions
    executed by system administrators.
    """

    queryset = BulkImportBatch.objects.all().order_by('-created_at')
    serializer_class = BulkImportBatchSerializer
    permission_classes = [IsAdminRole]
