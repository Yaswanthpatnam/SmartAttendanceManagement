from django.db import models
from django.conf import settings


class Department(models.Model):
    """
    Academic Department (e.g., CSE, CSM, ECE, EEE, Mechanical, CAD).
    Serves as the organizational boundary for students, faculty, sections, and subjects.
    Every department is overseen by an appointed Head of Department (HOD).
    """
    code = models.CharField(max_length=20, unique=True, db_index=True)
    name = models.CharField(max_length=150)
    hod = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='managed_department',
        help_text="Assigned Head of Department user"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['code']

    def __str__(self):
        """Format: CODE - Full Name (e.g. CSE - Computer Science & Engineering)."""
        return f"{self.code} - {self.name}"


class AcademicYear(models.Model):
    """
    Institutional Academic Year representation (e.g., 2026-2027).
    Maintains start and end calendar boundaries and designates the active academic period.
    """
    year_label = models.CharField(max_length=20, unique=True, help_text="e.g. 2026-2027")
    start_date = models.DateField()
    end_date = models.DateField()
    is_current = models.BooleanField(default=False)

    class Meta:
        ordering = ['-start_date']

    def __str__(self):
        # Indicate if this academic year is currently active
        status_suffix = ' (Current)' if self.is_current else ''
        return f"{self.year_label}{status_suffix}"

    def save(self, *args, **kwargs):
        """
        Enforces singleton behavior for the active academic year:
        if this instance is flagged as current, demote all other years.
        """
        # When setting this academic year as current, clear the flag on all other records
        if self.is_current:
            AcademicYear.objects.filter(is_current=True).exclude(pk=self.pk).update(is_current=False)
        super().save(*args, **kwargs)


class Semester(models.Model):
    """
    Semester definition within an Academic Year (Semesters 1 through 8).
    Curriculum subjects and student enrollments map to specific semester numbers.
    """
    number = models.PositiveSmallIntegerField(help_text="1 to 8")
    academic_year = models.ForeignKey(AcademicYear, on_delete=models.CASCADE, related_name='semesters')
    is_active = models.BooleanField(default=True)

    class Meta:
        unique_together = ('academic_year', 'number')
        ordering = ['academic_year', 'number']

    def __str__(self):
        return f"{self.academic_year.year_label} - Semester {self.number}"


class Section(models.Model):
    """
    Classroom Section within an Academic Department (e.g. CSE-1, CSE-2, ECE-1).
    Groups student cohorts for scheduled classes, roll-calls, and attendance accounting.
    A section can have an assigned Faculty Counsellor / Proctor designated by the HOD.
    """
    department = models.ForeignKey(Department, on_delete=models.CASCADE, related_name='sections')
    name = models.CharField(max_length=50, help_text="e.g. CSE-1, CSE-2")
    academic_year = models.ForeignKey(AcademicYear, on_delete=models.CASCADE, related_name='sections')
    current_semester = models.PositiveSmallIntegerField(default=1)
    counsellor = models.ForeignKey(
        'FacultyProfile',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='counselled_sections',
        help_text="Faculty member designated as the Section Counsellor / Proctor"
    )

    class Meta:
        unique_together = ('department', 'name', 'academic_year')
        ordering = ['department', 'name']

    def __str__(self):
        return f"{self.name} ({self.department.code})"

    def advance_semester(self):
        """
        Dynamically increments the section's semester by 1 (capping at 8)
        and atomically synchronizes all enrolled students to the new semester.
        """
        # Ensure semester does not advance beyond standard 8-semester engineering program
        if self.current_semester < 8:
            self.current_semester += 1
            self.save(update_fields=['current_semester'])
            
            # Synchronize all enrolled students in this section to the new semester
            self.students.update(semester=self.current_semester)
            return self.current_semester
        else:
            # Already at maximum semester 8
            return self.current_semester


class Subject(models.Model):
    """
    Curriculum Subject offering with unique institutional course code (e.g. CS301, CS302).
    Maps to an academic department, applicable semester, and assigned credit units.
    """
    code = models.CharField(max_length=30, unique=True, db_index=True)
    name = models.CharField(max_length=200)
    department = models.ForeignKey(Department, on_delete=models.CASCADE, related_name='subjects')
    semester = models.PositiveSmallIntegerField(help_text="Applicable semester number (1-8)")
    credits = models.PositiveSmallIntegerField(default=3)

    class Meta:
        ordering = ['code']

    def __str__(self):
        return f"{self.code} - {self.name} ({self.department.code})"


class AdminProfile(models.Model):
    """
    Operational profile extension for college administrative staff.
    Stores institutional employee ID and administrative designation.
    """
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='admin_profile')
    employee_id = models.CharField(max_length=50, unique=True, db_index=True)
    designation = models.CharField(max_length=100, help_text="e.g. Student Records Administrator")

    def __str__(self):
        return f"{self.employee_id} - {self.user.get_full_name()} ({self.designation})"


class FacultyProfile(models.Model):
    """
    Profile extension for faculty members, bound to their primary academic department.
    Captures official faculty identifier, designation, and whether they serve as HOD.
    """
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='faculty_profile')
    faculty_id = models.CharField(max_length=50, unique=True, db_index=True, help_text="e.g. FAC-CSE-001")
    department = models.ForeignKey(Department, on_delete=models.CASCADE, related_name='faculty_members')
    designation = models.CharField(max_length=100, default='Assistant Professor')
    is_hod = models.BooleanField(default=False)

    class Meta:
        ordering = ['faculty_id']

    def __str__(self):
        return f"{self.faculty_id} - {self.user.get_full_name()} ({self.department.code})"


class StudentProfile(models.Model):
    """
    Profile extension for enrolled students.
    Maintains roll number / student ID, departmental affiliation, section placement,
    academic year, and current semester number.
    """
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='student_profile')
    student_id = models.CharField(max_length=50, unique=True, db_index=True, help_text="e.g. STU-CSE1-0001")
    department = models.ForeignKey(Department, on_delete=models.CASCADE, related_name='students')
    section = models.ForeignKey(Section, on_delete=models.CASCADE, related_name='students')
    academic_year = models.ForeignKey(AcademicYear, on_delete=models.CASCADE, related_name='students')
    semester = models.PositiveSmallIntegerField(default=1)

    class Meta:
        ordering = ['student_id']
        indexes = [
            # Composite indexes for section queries and departmental batch operations
            models.Index(fields=['department', 'section']),
            models.Index(fields=['department', 'semester']),
        ]

    def __str__(self):
        return f"{self.student_id} - {self.user.get_full_name()} ({self.section.name})"


class FacultyAllocation(models.Model):
    """
    Workload mapping connecting a faculty member to a specific (Subject, Section) pair.
    Serves as the authorization gate: faculty may only conduct and record attendance
    for sessions corresponding to their active allocations.
    """
    faculty = models.ForeignKey(FacultyProfile, on_delete=models.CASCADE, related_name='allocations')
    subject = models.ForeignKey(Subject, on_delete=models.CASCADE, related_name='allocations')
    section = models.ForeignKey(Section, on_delete=models.CASCADE, related_name='allocations')
    academic_year = models.ForeignKey(AcademicYear, on_delete=models.CASCADE, related_name='allocations')
    semester = models.PositiveSmallIntegerField()
    is_active = models.BooleanField(default=True)
    allocated_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('faculty', 'subject', 'section', 'academic_year', 'semester')
        ordering = ['faculty', 'subject']

    def __str__(self):
        return f"{self.faculty.faculty_id} -> {self.subject.code} ({self.section.name})"


class ClassSession(models.Model):
    """
    Represents an individual scheduled or conducted class period.
    Tracks timetable slot, lecture topic, whether attendance was completed,
    and who submitted the roll-call (including designated substitute faculty).
    """
    allocation = models.ForeignKey(FacultyAllocation, on_delete=models.CASCADE, related_name='sessions')
    substitute_faculty = models.ForeignKey(
        FacultyProfile,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='substituted_sessions',
        help_text="Assigned substitute if the primary faculty is on leave"
    )
    session_date = models.DateField(db_index=True)
    start_time = models.TimeField()
    end_time = models.TimeField()
    topic = models.CharField(max_length=255, blank=True)
    is_attendance_taken = models.BooleanField(default=False, db_index=True)
    attendance_taken_at = models.DateTimeField(null=True, blank=True)
    attendance_taken_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='submitted_sessions'
    )

    class Meta:
        ordering = ['-session_date', '-start_time']
        indexes = [
            # Compound index for querying pending vs completed attendance on specific dates
            models.Index(fields=['session_date', 'is_attendance_taken']),
        ]

    def __str__(self):
        return f"{self.allocation.subject.code} on {self.session_date} ({self.allocation.section.name})"
