from rest_framework import serializers
from django.db import transaction
from django.contrib.auth import get_user_model
from apps.academic.models import (
    Department, AcademicYear, Semester, Section, Subject,
    AdminProfile, FacultyProfile, StudentProfile, FacultyAllocation, ClassSession
)

User = get_user_model()


class DepartmentSerializer(serializers.ModelSerializer):
    """
    Serializes academic department entities alongside live computed statistics
    (total enrolled students, faculty count, and active sections).
    """
    hod_name = serializers.CharField(source='hod.get_full_name', read_only=True)
    hod_institutional_id = serializers.CharField(source='hod.institutional_id', read_only=True)
    total_students = serializers.IntegerField(source='students.count', read_only=True)
    total_faculty = serializers.IntegerField(source='faculty_members.count', read_only=True)
    total_sections = serializers.IntegerField(source='sections.count', read_only=True)

    class Meta:
        model = Department
        fields = [
            'id', 'code', 'name', 'hod', 'hod_name',
            'hod_institutional_id', 'total_students', 'total_faculty',
            'total_sections', 'created_at', 'updated_at'
        ]


class AcademicYearSerializer(serializers.ModelSerializer):
    """
    Serializes institutional academic years and active calendar windows.
    """
    class Meta:
        model = AcademicYear
        fields = ['id', 'year_label', 'start_date', 'end_date', 'is_current']


class SemesterSerializer(serializers.ModelSerializer):
    """
    Serializes semester definitions within an academic year.
    """
    academic_year_label = serializers.CharField(source='academic_year.year_label', read_only=True)

    class Meta:
        model = Semester
        fields = ['id', 'number', 'academic_year', 'academic_year_label', 'is_active']


class SectionSerializer(serializers.ModelSerializer):
    """
    Serializes classroom sections, including counsellor / proctor faculty details
    and live enrolled student headcount.
    """
    department_code = serializers.CharField(source='department.code', read_only=True)
    academic_year_label = serializers.CharField(source='academic_year.year_label', read_only=True)
    student_count = serializers.IntegerField(source='students.count', read_only=True)
    counsellor_name = serializers.CharField(source='counsellor.user.get_full_name', read_only=True)
    counsellor_faculty_id = serializers.CharField(source='counsellor.faculty_id', read_only=True)

    class Meta:
        model = Section
        fields = [
            'id', 'department', 'department_code', 'name',
            'academic_year', 'academic_year_label', 'current_semester', 'student_count',
            'counsellor', 'counsellor_name', 'counsellor_faculty_id'
        ]


class SubjectSerializer(serializers.ModelSerializer):
    """
    Serializes academic subjects with course codes, departmental ownership, and credit values.
    """
    department_code = serializers.CharField(source='department.code', read_only=True)

    class Meta:
        model = Subject
        fields = ['id', 'code', 'name', 'department', 'department_code', 'semester', 'credits']


class FacultyProfileSerializer(serializers.ModelSerializer):
    """
    Read-only serializer providing full faculty directory details, including
    associated user account information and total assigned subjects.
    """
    user_id = serializers.IntegerField(source='user.id', read_only=True)
    full_name = serializers.CharField(source='user.get_full_name', read_only=True)
    email = serializers.EmailField(source='user.email', read_only=True)
    phone = serializers.CharField(source='user.phone', read_only=True)
    date_of_birth = serializers.DateField(source='user.date_of_birth', read_only=True)
    department_code = serializers.CharField(source='department.code', read_only=True)
    department_name = serializers.CharField(source='department.name', read_only=True)
    allocated_subjects_count = serializers.IntegerField(source='allocations.count', read_only=True)

    class Meta:
        model = FacultyProfile
        fields = [
            'id', 'user_id', 'faculty_id', 'full_name', 'email',
            'phone', 'date_of_birth', 'department', 'department_code',
            'department_name', 'designation', 'is_hod', 'allocated_subjects_count'
        ]


class CreateFacultySerializer(serializers.Serializer):
    """
    Validates and provisions a new faculty member, automatically generating
    their user credentials, official faculty identifier, and departmental link.
    """
    full_name = serializers.CharField(max_length=150)
    date_of_birth = serializers.DateField()
    department = serializers.PrimaryKeyRelatedField(queryset=Department.objects.all())
    designation = serializers.CharField(max_length=100, default='Assistant Professor')
    email = serializers.EmailField()
    phone = serializers.CharField(max_length=20, required=False, allow_blank=True)
    is_hod = serializers.BooleanField(default=False)

    def validate_email(self, value):
        """Ensures email is unique across the campus user directory."""
        # Case-insensitive duplicate email check
        if User.objects.filter(email__iexact=value.strip()).exists():
            raise serializers.ValidationError("An account with this email address already exists.")
        return value.strip()

    def create(self, validated_data):
        """
        Creates User account and FacultyProfile record inside an atomic transaction.
        Generates deterministic ID format: FAC-{DEPT_CODE}-{COUNT:03d}.
        """
        with transaction.atomic():
            dept = validated_data['department']
            
            # Compute next sequential faculty ID for this department
            existing_count = FacultyProfile.objects.filter(department=dept).count() + 1
            faculty_id = f"FAC-{dept.code}-{existing_count:03d}"
            
            # Collision prevention loop in case an earlier ID was preserved
            while FacultyProfile.objects.filter(faculty_id=faculty_id).exists():
                existing_count += 1
                faculty_id = f"FAC-{dept.code}-{existing_count:03d}"

            # Split full name into first and last components
            name_parts = validated_data['full_name'].strip().split(' ', 1)
            first_name = name_parts[0]
            # Check if last name was provided
            if len(name_parts) > 1:
                last_name = name_parts[1]
            else:
                last_name = ''

            # Determine whether role is HOD or standard Faculty
            if validated_data.get('is_hod'):
                assigned_role = User.Role.HOD
            else:
                assigned_role = User.Role.FACULTY

            # Create base user authentication record
            user = User.objects.create(
                username=faculty_id.lower(),
                email=validated_data['email'],
                first_name=first_name,
                last_name=last_name,
                role=assigned_role,
                institutional_id=faculty_id,
                phone=validated_data.get('phone', ''),
                date_of_birth=validated_data['date_of_birth']
            )
            # Apply institutional uniform password standard for faculty
            user.set_password("Faculty@123")
            user.save()

            # Create linked faculty domain profile
            faculty_profile = FacultyProfile.objects.create(
                user=user,
                faculty_id=faculty_id,
                department=dept,
                designation=validated_data.get('designation', 'Assistant Professor'),
                is_hod=validated_data.get('is_hod', False)
            )

            # If registered as HOD, link as department head
            if validated_data.get('is_hod'):
                dept.hod = user
                dept.save(update_fields=['hod'])

            return faculty_profile


class StudentProfileSerializer(serializers.ModelSerializer):
    """
    Detailed read serializer for student profiles, flattening user details,
    department name, section, and semester status.
    """
    user_id = serializers.IntegerField(source='user.id', read_only=True)
    full_name = serializers.CharField(source='user.get_full_name', read_only=True)
    email = serializers.EmailField(source='user.email', read_only=True)
    phone = serializers.CharField(source='user.phone', read_only=True)
    date_of_birth = serializers.DateField(source='user.date_of_birth', read_only=True)
    department_code = serializers.CharField(source='department.code', read_only=True)
    department_name = serializers.CharField(source='department.name', read_only=True)
    section_name = serializers.CharField(source='section.name', read_only=True)
    academic_year_label = serializers.CharField(source='academic_year.year_label', read_only=True)

    class Meta:
        model = StudentProfile
        fields = [
            'id', 'user_id', 'student_id', 'full_name', 'email',
            'phone', 'date_of_birth', 'department', 'department_code',
            'department_name', 'section', 'section_name', 'academic_year',
            'academic_year_label', 'semester'
        ]


class CreateStudentSerializer(serializers.Serializer):
    """
    Validates and onboards an individual student with automatic student ID generation
    and relational consistency validation (section must belong to selected department).
    """
    full_name = serializers.CharField(max_length=150)
    date_of_birth = serializers.DateField()
    department = serializers.PrimaryKeyRelatedField(queryset=Department.objects.all())
    section = serializers.PrimaryKeyRelatedField(queryset=Section.objects.all())
    academic_year = serializers.PrimaryKeyRelatedField(queryset=AcademicYear.objects.all())
    semester = serializers.IntegerField(min_value=1, max_value=8)
    email = serializers.EmailField()
    phone = serializers.CharField(max_length=20, required=False, allow_blank=True)

    def validate(self, attrs):
        """
        Cross-field relational validation ensuring section integrity and unique email.
        """
        # Validate that the selected section belongs to the selected department
        if attrs['section'].department != attrs['department']:
            raise serializers.ValidationError({
                "section": f"Section '{attrs['section'].name}' belongs to department '{attrs['section'].department.code}', not '{attrs['department'].code}'."
            })
            
        # Verify email address is not already claimed
        if User.objects.filter(email__iexact=attrs['email'].strip()).exists():
            raise serializers.ValidationError({
                "email": "An account with this email address already exists."
            })
            
        return attrs

    def create(self, validated_data):
        """
        Creates student account and profile atomically.
        Format: STU-{CLEAN_SECTION}-{COUNT:04d} (e.g. STU-CSE1-0001).
        """
        with transaction.atomic():
            dept = validated_data['department']
            sec = validated_data['section']
            
            # Format section name (remove dashes/spaces: 'CSE-1' -> 'CSE1')
            sec_clean = sec.name.replace('-', '').replace(' ', '')
            
            # Determine starting sequence count for this section
            sequence_count = StudentProfile.objects.filter(section=sec).count() + 1
            student_id = f"STU-{sec_clean}-{sequence_count:04d}"
            
            # Ensure unique identifier
            while StudentProfile.objects.filter(student_id=student_id).exists():
                sequence_count += 1
                student_id = f"STU-{sec_clean}-{sequence_count:04d}"

            # Parse student name
            name_parts = validated_data['full_name'].strip().split(' ', 1)
            first_name = name_parts[0]
            # Handle single word vs multi-word names
            if len(name_parts) > 1:
                last_name = name_parts[1]
            else:
                last_name = ''

            # Create authentication user record
            user = User.objects.create(
                username=student_id.lower(),
                email=validated_data['email'].strip(),
                first_name=first_name,
                last_name=last_name,
                role=User.Role.STUDENT,
                institutional_id=student_id,
                phone=validated_data.get('phone', ''),
                date_of_birth=validated_data['date_of_birth']
            )
            # Uniform student password format
            user.set_password("Student@123")
            user.save()

            # Create student academic profile
            student_profile = StudentProfile.objects.create(
                user=user,
                student_id=student_id,
                department=dept,
                section=sec,
                academic_year=validated_data['academic_year'],
                semester=validated_data['semester']
            )
            return student_profile


class FacultyAllocationSerializer(serializers.ModelSerializer):
    """
    Serializes teaching allocations mapping faculty members to specific subjects and sections.
    """
    faculty_name = serializers.CharField(source='faculty.user.get_full_name', read_only=True)
    faculty_id_code = serializers.CharField(source='faculty.faculty_id', read_only=True)
    subject_code = serializers.CharField(source='subject.code', read_only=True)
    subject_name = serializers.CharField(source='subject.name', read_only=True)
    section_name = serializers.CharField(source='section.name', read_only=True)
    department_code = serializers.CharField(source='faculty.department.code', read_only=True)
    academic_year_label = serializers.CharField(source='academic_year.year_label', read_only=True)

    class Meta:
        model = FacultyAllocation
        fields = [
            'id', 'faculty', 'faculty_name', 'faculty_id_code',
            'subject', 'subject_code', 'subject_name', 'section',
            'section_name', 'department_code', 'academic_year',
            'academic_year_label', 'semester', 'is_active', 'allocated_at'
        ]


class ClassSessionSerializer(serializers.ModelSerializer):
    """
    Serializes scheduled and conducted class sessions, computing live roll-call
    metrics (present student count and section enrollment).
    """
    faculty_name = serializers.CharField(source='allocation.faculty.user.get_full_name', read_only=True)
    faculty_id = serializers.CharField(source='allocation.faculty.faculty_id', read_only=True)
    subject_code = serializers.CharField(source='allocation.subject.code', read_only=True)
    subject_name = serializers.CharField(source='allocation.subject.name', read_only=True)
    section_name = serializers.CharField(source='allocation.section.name', read_only=True)
    substitute_name = serializers.CharField(source='substitute_faculty.user.get_full_name', read_only=True)
    present_count = serializers.SerializerMethodField()
    total_students = serializers.SerializerMethodField()

    class Meta:
        model = ClassSession
        fields = [
            'id', 'allocation', 'faculty_name', 'faculty_id',
            'subject_code', 'subject_name', 'section_name',
            'substitute_faculty', 'substitute_name', 'session_date',
            'start_time', 'end_time', 'topic', 'is_attendance_taken',
            'attendance_taken_at', 'present_count', 'total_students'
        ]

    def get_present_count(self, obj):
        """Calculates total students marked present if attendance was submitted."""
        # Check if roll-call has already taken place for this lecture
        if not obj.is_attendance_taken:
            return 0
        return obj.attendance_records.filter(status='PRESENT').count()

    def get_total_students(self, obj):
        """Returns total students currently registered in this lecture's section."""
        return obj.allocation.section.students.count()
