"""
Bulk CSV Processing and Validation Engine
=========================================
This module implements the two-phase bulk onboarding pipeline:
Phase 1: Stream parsing, header normalization, format checks, duplicate detection,
         and staging of verified entries.
Phase 2: Atomic database transactions, automated username/roll number generation,
         and credential initialization.
"""

import csv
import io
import re
from datetime import datetime
from typing import Dict, Any, List, Optional
from django.db import transaction
from django.utils import timezone
from django.core.exceptions import ValidationError
from django.contrib.auth import get_user_model
from apps.academic.models import Department, Section, AcademicYear, StudentProfile, FacultyProfile
from apps.imports.models import BulkImportBatch, BulkImportRowError

User = get_user_model()

# Standard RFC-compliant email validation regular expression
EMAIL_REGEX = re.compile(r'^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$')


def parse_date_flexibly(date_str: str) -> Optional[datetime.date]:
    """
    Parses date strings robustly across standard date representations:
    Supports YYYY-MM-DD, DD-MM-YYYY, DD/MM/YYYY, YYYY/MM/DD, and MM/DD/YYYY.
    Returns None if the format does not match any recognized pattern.
    """
    # Guard against empty or None input
    if not date_str:
        return None

    cleaned_str = date_str.strip()
    candidate_formats = ['%Y-%m-%d', '%d-%m-%Y', '%d/%m/%Y', '%Y/%m/%d', '%m/%d/%Y']

    # Iterate through potential date formatting patterns
    for date_format in candidate_formats:
        try:
            return datetime.strptime(cleaned_str, date_format).date()
        except ValueError:
            # Continue trying subsequent formats
            continue

    # Return None if string fails all parsing strategies
    return None


def validate_and_stage_student_csv(file_obj, user) -> BulkImportBatch:
    """
    Parses and semantically validates a student roster CSV.
    Stages valid rows in the database and records actionable error logs for invalid rows.
    Does NOT write to active StudentProfile or User tables.
    """
    # Read and decode CSV content with UTF-8 BOM tolerance
    try:
        raw_content = file_obj.read().decode('utf-8-sig')
    except Exception:
        raise ValidationError("Unable to read file content. Please verify the CSV is encoded using UTF-8.")

    csv_reader = csv.reader(io.StringIO(raw_content))

    # Read column header line
    try:
        header_tokens = [token.strip().lower() for token in next(csv_reader)]
    except StopIteration:
        raise ValidationError("The provided CSV file is completely empty.")

    # Initialize column index mapping
    header_indices = {
        'name': -1,
        'date of birth': -1,
        'department': -1,
        'section': -1,
        'academic year': -1,
        'semester': -1,
        'email': -1,
        'phone': -1
    }

    # Map headers tolerating space variations
    for column_index, column_name in enumerate(header_tokens):
        for expected_key in header_indices:
            # Check direct match or stripped-space match
            if column_name == expected_key or expected_key.replace(' ', '') == column_name.replace(' ', ''):
                header_indices[expected_key] = column_index

    # Check for missing mandatory headers (phone is optional)
    missing_columns = [
        column for column, idx in header_indices.items()
        if idx == -1 and column != 'phone'
    ]
    if missing_columns:
        raise ValidationError(f"Mandatory CSV columns missing from header row: {', '.join(missing_columns)}")

    # Pre-fetch master reference tables into memory to avoid repeated DB queries
    departments_map = {d.code.upper(): d for d in Department.objects.all()}
    academic_years_map = {y.year_label.strip(): y for y in AcademicYear.objects.all()}
    
    sections_map = {}
    for section in Section.objects.select_related('department').all():
        composite_key = f"{section.department.code.upper()}:{section.name.upper()}"
        sections_map[composite_key] = section

    # Pre-load existing user emails for collision detection
    registered_emails = set(User.objects.values_list('email', flat=True))
    file_seen_emails = set()

    staged_records = []
    validation_errors = []
    total_data_rows = 0
    duplicate_rows_count = 0
    invalid_rows_count = 0

    # Process data rows starting from row 2 (header is row 1)
    for physical_row_index, row_values in enumerate(csv_reader, start=2):
        # Skip completely blank lines
        if not any(row_values):
            continue

        total_data_rows += 1
        has_error = False

        # Helper lambda to extract cell content safely
        def fetch_column_value(col_key: str) -> str:
            idx = header_indices.get(col_key, -1)
            if idx != -1 and idx < len(row_values):
                return row_values[idx].strip()
            return ''

        name_val = fetch_column_value('name')
        dob_val = fetch_column_value('date of birth')
        dept_val = fetch_column_value('department').upper()
        sec_val = fetch_column_value('section').upper()
        acad_val = fetch_column_value('academic year')
        sem_val = fetch_column_value('semester')
        email_val = fetch_column_value('email').lower()
        phone_val = fetch_column_value('phone')

        # 1. Validate full name presence
        if not name_val:
            validation_errors.append(BulkImportRowError(
                row_number=physical_row_index,
                field_name='Name',
                raw_value='',
                error_reason='Student full name is mandatory.'
            ))
            has_error = True

        # 2. Validate date of birth parsing
        parsed_dob = parse_date_flexibly(dob_val)
        if not parsed_dob:
            validation_errors.append(BulkImportRowError(
                row_number=physical_row_index,
                field_name='Date of Birth',
                raw_value=dob_val,
                error_reason='Invalid date format. Expected standard formats: YYYY-MM-DD or DD-MM-YYYY.'
            ))
            has_error = True

        # 3. Validate department code against master records
        target_department = departments_map.get(dept_val)
        if not target_department:
            validation_errors.append(BulkImportRowError(
                row_number=physical_row_index,
                field_name='Department',
                raw_value=dept_val,
                error_reason=f"Unrecognized department code '{dept_val}'."
            ))
            has_error = True

        # 4. Validate section belonging to department
        section_lookup_key = f"{dept_val}:{sec_val}"
        target_section = sections_map.get(section_lookup_key)
        if not target_section:
            validation_errors.append(BulkImportRowError(
                row_number=physical_row_index,
                field_name='Section',
                raw_value=sec_val,
                error_reason=f"Section '{sec_val}' does not belong to department '{dept_val}'."
            ))
            has_error = True

        # 5. Validate academic year
        target_academic_year = academic_years_map.get(acad_val)
        if not target_academic_year:
            # Fall back to currently active academic year if unmentioned
            target_academic_year = next((year for year in academic_years_map.values() if year.is_current), None)
            if not target_academic_year:
                validation_errors.append(BulkImportRowError(
                    row_number=physical_row_index,
                    field_name='Academic Year',
                    raw_value=acad_val,
                    error_reason=f"Academic year '{acad_val}' not recognized."
                ))
                has_error = True

        # 6. Validate semester integer bounds
        try:
            semester_integer = int(sem_val)
            if not (1 <= semester_integer <= 8):
                raise ValueError()
        except (ValueError, TypeError):
            validation_errors.append(BulkImportRowError(
                row_number=physical_row_index,
                field_name='Semester',
                raw_value=sem_val,
                error_reason='Semester must be an integer between 1 and 8.'
            ))
            has_error = True
            semester_integer = 1

        # 7. Validate email format and check for duplicates
        is_duplicate_entry = False
        if not email_val or not EMAIL_REGEX.match(email_val):
            validation_errors.append(BulkImportRowError(
                row_number=physical_row_index,
                field_name='Email',
                raw_value=email_val,
                error_reason='Invalid email syntax.'
            ))
            has_error = True
        elif email_val in file_seen_emails:
            validation_errors.append(BulkImportRowError(
                row_number=physical_row_index,
                field_name='Email',
                raw_value=email_val,
                error_reason='Duplicate email repeated within uploaded file.'
            ))
            is_duplicate_entry = True
            has_error = True
        elif email_val in registered_emails:
            validation_errors.append(BulkImportRowError(
                row_number=physical_row_index,
                field_name='Email',
                raw_value=email_val,
                error_reason='A user account with this email address already exists in the system.'
            ))
            is_duplicate_entry = True
            has_error = True

        # Categorize row outcome
        if has_error:
            if is_duplicate_entry:
                duplicate_rows_count += 1
            else:
                invalid_rows_count += 1
        else:
            file_seen_emails.add(email_val)
            staged_records.append({
                'row_number': physical_row_index,
                'name': name_val,
                'dob': str(parsed_dob),
                'department_id': target_department.id,
                'department_code': target_department.code,
                'section_id': target_section.id,
                'section_name': target_section.name,
                'academic_year_id': target_academic_year.id,
                'semester': semester_integer,
                'email': email_val,
                'phone': phone_val
            })

    # Persist batch header record
    import_batch = BulkImportBatch.objects.create(
        import_type=BulkImportBatch.ImportType.STUDENT,
        file_name=getattr(file_obj, 'name', 'students.csv'),
        total_rows=total_data_rows,
        valid_rows=len(staged_records),
        invalid_rows=invalid_rows_count,
        duplicate_rows=duplicate_rows_count,
        status=BulkImportBatch.Status.PREVIEW_READY,
        staged_data=staged_records,
        created_by=user
    )

    # Attach batch foreign key to error items and bulk persist
    for error_record in validation_errors:
        error_record.batch = import_batch
    BulkImportRowError.objects.bulk_create(validation_errors)

    return import_batch


def commit_student_import(batch: BulkImportBatch) -> Dict[str, Any]:
    """
    Executes database insertion for validated student rows in an ACID transaction.
    Generates deterministic roll numbers (STU-{SECTION}-{0001}), student credentials,
    and academic profile links.
    """
    # Guard against repeat commit execution
    if batch.status == BulkImportBatch.Status.COMPLETED:
        raise ValidationError("This onboarding batch has already been finalized and committed.")

    staged_records = batch.staged_data

    # Handle scenario where file had 0 valid records
    if not staged_records:
        batch.status = BulkImportBatch.Status.COMPLETED
        batch.imported_rows = 0
        batch.completed_at = timezone.now()
        batch.save()
        return {'imported_count': 0, 'status': batch.status}

    # Cache academic entity lookups
    sections_map = {sec.id: sec for sec in Section.objects.all()}
    departments_map = {dept.id: dept for dept in Department.objects.all()}
    academic_years_map = {yr.id: yr for yr in AcademicYear.objects.all()}

    # Compute starting sequential counter for each section
    section_counter_map = {}
    for section_id in set(row['section_id'] for row in staged_records):
        section_counter_map[section_id] = StudentProfile.objects.filter(section_id=section_id).count()

    existing_student_ids = set(StudentProfile.objects.values_list('student_id', flat=True))
    profiles_to_insert = []

    # Execute transactional writes
    with transaction.atomic():
        for row in staged_records:
            section_id = row['section_id']
            section_instance = sections_map[section_id]
            department_instance = departments_map[row['department_id']]
            academic_year_instance = academic_years_map[row['academic_year_id']]

            # Increment counter for section
            section_counter_map[section_id] += 1
            cleaned_section_name = section_instance.name.replace('-', '').replace(' ', '')
            roll_number = f"STU-{cleaned_section_name}-{section_counter_map[section_id]:04d}"

            # Ensure roll number collision avoidance
            while roll_number in existing_student_ids:
                section_counter_map[section_id] += 1
                roll_number = f"STU-{cleaned_section_name}-{section_counter_map[section_id]:04d}"
            existing_student_ids.add(roll_number)

            # Split name components
            name_tokens = row['name'].strip().split(' ', 1)
            first_name = name_tokens[0]
            if len(name_tokens) > 1:
                last_name = name_tokens[1]
            else:
                last_name = ''

            # Instantiate user account
            user_account = User(
                username=roll_number.lower(),
                email=row['email'],
                first_name=first_name,
                last_name=last_name,
                role=User.Role.STUDENT,
                institutional_id=roll_number,
                phone=row.get('phone', ''),
                date_of_birth=parse_date_flexibly(row['dob'])
            )
            # Enforce uniform institutional default password
            user_account.set_password("Student@123")
            user_account.save()

            # Instantiate student profile linked to user
            student_profile = StudentProfile(
                user=user_account,
                student_id=roll_number,
                department=department_instance,
                section=section_instance,
                academic_year=academic_year_instance,
                semester=row['semester']
            )
            profiles_to_insert.append(student_profile)

        # Batch insert all created student profiles
        StudentProfile.objects.bulk_create(profiles_to_insert)

        # Update batch completion status
        batch.status = BulkImportBatch.Status.COMPLETED
        batch.imported_rows = len(profiles_to_insert)
        batch.completed_at = timezone.now()
        batch.save()

    return {
        'batch_id': str(batch.batch_id),
        'total_rows': batch.total_rows,
        'imported_rows': batch.imported_rows,
        'status': batch.status
    }


def validate_and_stage_faculty_csv(file_obj, user) -> BulkImportBatch:
    """
    Parses and validates faculty onboarding CSV.
    Expected headers: Name, Date of Birth, Department, Designation, Email, Phone
    """
    # Decode raw CSV content
    try:
        raw_content = file_obj.read().decode('utf-8-sig')
    except Exception:
        raise ValidationError("Unable to read file content. Please verify the CSV is encoded using UTF-8.")

    csv_reader = csv.reader(io.StringIO(raw_content))

    # Read column header
    try:
        header_tokens = [token.strip().lower() for token in next(csv_reader)]
    except StopIteration:
        raise ValidationError("The provided CSV file contains no content.")

    header_indices = {
        'name': -1,
        'date of birth': -1,
        'department': -1,
        'designation': -1,
        'email': -1,
        'phone': -1
    }

    # Match column positions
    for column_index, column_name in enumerate(header_tokens):
        for expected_key in header_indices:
            if column_name == expected_key or expected_key.replace(' ', '') == column_name.replace(' ', ''):
                header_indices[expected_key] = column_index

    # Check for missing required columns
    missing_columns = [
        column for column, idx in header_indices.items()
        if idx == -1 and column != 'phone'
    ]
    if missing_columns:
        raise ValidationError(f"Mandatory CSV columns missing from header row: {', '.join(missing_columns)}")

    # Pre-cache departments and email set
    departments_map = {dept.code.upper(): dept for dept in Department.objects.all()}
    registered_emails = set(User.objects.values_list('email', flat=True))
    file_seen_emails = set()

    staged_records = []
    validation_errors = []
    total_data_rows = 0
    duplicate_rows_count = 0
    invalid_rows_count = 0

    for physical_row_index, row_values in enumerate(csv_reader, start=2):
        if not any(row_values):
            continue

        total_data_rows += 1
        has_error = False

        def fetch_column_value(col_key: str) -> str:
            idx = header_indices.get(col_key, -1)
            if idx != -1 and idx < len(row_values):
                return row_values[idx].strip()
            return ''

        name_val = fetch_column_value('name')
        dob_val = fetch_column_value('date of birth')
        dept_val = fetch_column_value('department').upper()
        desig_val = fetch_column_value('designation')
        email_val = fetch_column_value('email').lower()
        phone_val = fetch_column_value('phone')

        # Default designation if not specified
        if not desig_val:
            desig_val = 'Assistant Professor'

        # 1. Full name validation
        if not name_val:
            validation_errors.append(BulkImportRowError(
                row_number=physical_row_index,
                field_name='Name',
                raw_value='',
                error_reason='Faculty member name is required.'
            ))
            has_error = True

        # 2. Date of birth validation
        parsed_dob = parse_date_flexibly(dob_val)
        if not parsed_dob:
            validation_errors.append(BulkImportRowError(
                row_number=physical_row_index,
                field_name='Date of Birth',
                raw_value=dob_val,
                error_reason='Invalid date of birth format. Use YYYY-MM-DD or DD-MM-YYYY.'
            ))
            has_error = True

        # 3. Department validation
        target_department = departments_map.get(dept_val)
        if not target_department:
            validation_errors.append(BulkImportRowError(
                row_number=physical_row_index,
                field_name='Department',
                raw_value=dept_val,
                error_reason=f"Unknown academic department code '{dept_val}'."
            ))
            has_error = True

        # 4. Email validation and duplicate checking
        is_duplicate_entry = False
        if not email_val or not EMAIL_REGEX.match(email_val):
            validation_errors.append(BulkImportRowError(
                row_number=physical_row_index,
                field_name='Email',
                raw_value=email_val,
                error_reason='Invalid email syntax.'
            ))
            has_error = True
        elif email_val in file_seen_emails:
            validation_errors.append(BulkImportRowError(
                row_number=physical_row_index,
                field_name='Email',
                raw_value=email_val,
                error_reason='Duplicate email address repeated within this CSV file.'
            ))
            is_duplicate_entry = True
            has_error = True
        elif email_val in registered_emails:
            validation_errors.append(BulkImportRowError(
                row_number=physical_row_index,
                field_name='Email',
                raw_value=email_val,
                error_reason='A user account with this email address already exists in the institution.'
            ))
            is_duplicate_entry = True
            has_error = True

        # Classify row outcome
        if has_error:
            if is_duplicate_entry:
                duplicate_rows_count += 1
            else:
                invalid_rows_count += 1
        else:
            file_seen_emails.add(email_val)
            staged_records.append({
                'row_number': physical_row_index,
                'name': name_val,
                'dob': str(parsed_dob),
                'department_id': target_department.id,
                'department_code': target_department.code,
                'designation': desig_val,
                'email': email_val,
                'phone': phone_val
            })

    # Persist batch record
    import_batch = BulkImportBatch.objects.create(
        import_type=BulkImportBatch.ImportType.FACULTY,
        file_name=getattr(file_obj, 'name', 'faculty.csv'),
        total_rows=total_data_rows,
        valid_rows=len(staged_records),
        invalid_rows=invalid_rows_count,
        duplicate_rows=duplicate_rows_count,
        status=BulkImportBatch.Status.PREVIEW_READY,
        staged_data=staged_records,
        created_by=user
    )

    # Attach batch reference to errors and bulk insert
    for error_record in validation_errors:
        error_record.batch = import_batch
    BulkImportRowError.objects.bulk_create(validation_errors)

    return import_batch


def commit_faculty_import(batch: BulkImportBatch) -> Dict[str, Any]:
    """
    Executes atomic database insertion for staged faculty members.
    Generates deterministic faculty codes (FAC-{DEPT}-{001}), credentials,
    and academic profile links.
    """
    if batch.status == BulkImportBatch.Status.COMPLETED:
        raise ValidationError("This faculty import batch has already been committed.")

    staged_records = batch.staged_data
    departments_map = {dept.id: dept for dept in Department.objects.all()}

    # Compute sequential counter for each department
    department_counter_map = {}
    for dept_id in set(row['department_id'] for row in staged_records):
        department_counter_map[dept_id] = FacultyProfile.objects.filter(department_id=dept_id).count()

    existing_faculty_ids = set(FacultyProfile.objects.values_list('faculty_id', flat=True))
    profiles_to_insert = []

    with transaction.atomic():
        for row in staged_records:
            dept_id = row['department_id']
            department_instance = departments_map[dept_id]
            department_counter_map[dept_id] += 1

            faculty_code = f"FAC-{department_instance.code}-{department_counter_map[dept_id]:03d}"

            # Collision avoidance check
            while faculty_code in existing_faculty_ids:
                department_counter_map[dept_id] += 1
                faculty_code = f"FAC-{department_instance.code}-{department_counter_map[dept_id]:03d}"
            existing_faculty_ids.add(faculty_code)

            name_tokens = row['name'].strip().split(' ', 1)
            first_name = name_tokens[0]
            if len(name_tokens) > 1:
                last_name = name_tokens[1]
            else:
                last_name = ''

            # Create faculty user account
            user_account = User(
                username=faculty_code.lower(),
                email=row['email'],
                first_name=first_name,
                last_name=last_name,
                role=User.Role.FACULTY,
                institutional_id=faculty_code,
                phone=row.get('phone', ''),
                date_of_birth=parse_date_flexibly(row['dob'])
            )
            # Standard institutional faculty password
            user_account.set_password("Faculty@123")
            user_account.save()

            # Create faculty academic profile
            faculty_profile = FacultyProfile(
                user=user_account,
                faculty_id=faculty_code,
                department=department_instance,
                designation=row.get('designation', 'Assistant Professor')
            )
            profiles_to_insert.append(faculty_profile)

        # Batch insert created profiles
        FacultyProfile.objects.bulk_create(profiles_to_insert)

        batch.status = BulkImportBatch.Status.COMPLETED
        batch.imported_rows = len(profiles_to_insert)
        batch.completed_at = timezone.now()
        batch.save()

    return {
        'batch_id': str(batch.batch_id),
        'total_rows': batch.total_rows,
        'imported_rows': batch.imported_rows,
        'status': batch.status
    }
