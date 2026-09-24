"""
Institutional Master Data Seeding Command
=========================================
Management command to provision initial master reference records and demonstration fixtures:
1. Core system settings and statutory thresholds.
2. Academic year cycles, active semesters, and departments.
3. Department sections, curriculum courses, and subject allocations.
4. Executive roles (Principal, Vice Principal, Central Administration, Department Heads).
5. Teaching faculty profiles and representative student cohorts across sections.
6. Sample timetable sessions, attendance logs, and biometric arrival records.
"""

import random
from datetime import date, timedelta, time
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone
from apps.core.models import User, SystemSetting
from apps.academic.models import (
    Department, AcademicYear, Semester, Section, Subject,
    AdminProfile, FacultyProfile, StudentProfile, FacultyAllocation, ClassSession
)
from apps.attendance.models import AttendanceRecord, FacultyBiometricLog


class Command(BaseCommand):
    """
    Django management command for populating the database with consistent demo data.
    """

    help = "Seeds institutional master tables, departmental structures, and demo accounts for all six roles."

    def handle(self, *args, **options):
        """
        Executes the institutional provisioning workflow within an ACID transaction.
        """
        self.stdout.write("============================================================")
        self.stdout.write("STARTING INSTITUTIONAL MASTER DATA PROVISIONING")
        self.stdout.write("============================================================")

        with transaction.atomic():
            # 1. System-wide configuration settings
            self.stdout.write("1. Configuring system parameters and thresholds...")
            SystemSetting.objects.update_or_create(
                key='LOW_ATTENDANCE_THRESHOLD',
                defaults={'value': '75.0', 'description': 'Institutional minimum attendance percentage.'}
            )
            SystemSetting.objects.update_or_create(
                key='COLLEGE_NAME',
                defaults={'value': 'Apex Institute of Technology & Engineering', 'description': 'College Name'}
            )
            SystemSetting.objects.update_or_create(
                key='ACADEMIC_YEAR',
                defaults={'value': '2026-2027', 'description': 'Current Academic Year'}
            )

            # 2. Academic calendar year and semester records
            self.stdout.write("2. Initializing academic calendar cycle...")
            academic_year_instance, _ = AcademicYear.objects.update_or_create(
                year_label='2026-2027',
                defaults={
                    'start_date': date(2026, 7, 1),
                    'end_date': date(2027, 5, 31),
                    'is_current': True
                }
            )

            # Create semesters 1 through 8
            for semester_index in range(1, 9):
                # Odd semesters are currently active in the monsoon cycle
                is_active_semester = semester_index in [3, 5, 7]
                Semester.objects.get_or_create(
                    academic_year=academic_year_instance,
                    number=semester_index,
                    defaults={'is_active': is_active_semester}
                )

            # 3. Academic Departments
            self.stdout.write("3. Initializing academic departments...")
            department_definitions = [
                ("CSE", "Computer Science and Engineering"),
                ("CSM", "Computer Science and Machine Learning"),
                ("ECE", "Electronics and Communication Engineering"),
                ("EEE", "Electrical and Electronics Engineering"),
                ("MECH", "Mechanical Engineering"),
                ("CAD", "Computer Aided Design and Engineering"),
            ]
            departments_map = {}
            for dept_code, dept_name in department_definitions:
                department_record, _ = Department.objects.update_or_create(
                    code=dept_code,
                    defaults={'name': dept_name}
                )
                departments_map[dept_code] = department_record

            # 4. Department Class Sections
            self.stdout.write("4. Initializing departmental class sections...")
            section_hierarchy = {
                "CSE": ["CSE-1", "CSE-2", "CSE-3"],
                "CSM": ["CSM-1", "CSM-2"],
                "ECE": ["ECE-1", "ECE-2"],
                "EEE": ["EEE-1", "EEE-2"],
                "MECH": ["MECH-1", "MECH-2"],
                "CAD": ["CAD-1", "CAD-2"],
            }
            sections_map = {}
            for dept_code, section_names in section_hierarchy.items():
                department_instance = departments_map[dept_code]
                for section_name in section_names:
                    section_record, _ = Section.objects.update_or_create(
                        department=department_instance,
                        name=section_name,
                        academic_year=academic_year_instance,
                        defaults={'current_semester': 5}
                    )
                    sections_map[section_name] = section_record

            # 5. Core Curriculum Subjects
            self.stdout.write("5. Initializing curriculum subjects...")
            curriculum_subjects = [
                ("CS301", "Database Management Systems", "CSE", 5, 4),
                ("CS302", "Operating Systems", "CSE", 5, 4),
                ("CS303", "Computer Networks", "CSE", 5, 3),
                ("CS304", "Design & Analysis of Algorithms", "CSE", 5, 4),

                ("CM301", "Machine Learning Foundations", "CSM", 5, 4),
                ("CM302", "Deep Neural Networks", "CSM", 5, 4),
                ("CM303", "Data Engineering & Pipelines", "CSM", 5, 3),

                ("EC301", "Signals and Systems", "ECE", 5, 4),
                ("EC302", "Digital Signal Processing", "ECE", 5, 4),
                ("EC303", "VLSI Design & Architecture", "ECE", 5, 3),

                ("EE301", "Power System Analysis", "EEE", 5, 4),
                ("EE302", "Control Systems Engineering", "EEE", 5, 4),
                ("EE303", "Electrical Machines II", "EEE", 5, 3),

                ("ME301", "Applied Thermodynamics", "MECH", 5, 4),
                ("ME302", "Fluid Mechanics & Turbomachinery", "MECH", 5, 4),
                ("ME303", "Advanced Manufacturing Technology", "MECH", 5, 3),

                ("CD301", "Computational CAD & Modeling", "CAD", 5, 4),
                ("CD302", "Structural Analysis & FEA", "CAD", 5, 4),
                ("CD303", "Parametric Modeling & Dynamics", "CAD", 5, 3),
            ]
            subjects_map = {}
            for subj_code, subj_name, dept_code, sem_num, credits_val in curriculum_subjects:
                subject_record, _ = Subject.objects.update_or_create(
                    code=subj_code,
                    defaults={
                        'name': subj_name,
                        'department': departments_map[dept_code],
                        'semester': sem_num,
                        'credits': credits_val
                    }
                )
                subjects_map[subj_code] = subject_record

            # 6. Leadership and Administrative Accounts
            self.stdout.write("6. Creating leadership and administration accounts...")

            # Central Administrators
            admin_user_primary, _ = User.objects.update_or_create(
                institutional_id='ADM-001',
                defaults={
                    'username': 'adm-001',
                    'email': 'admin1@smartcampus.edu',
                    'first_name': 'Ramesh',
                    'last_name': 'Chandra',
                    'role': User.Role.ADMIN,
                    'is_staff': True,
                    'is_superuser': True,
                    'phone': '9845011111'
                }
            )
            admin_user_primary.set_password('Admin@123')
            admin_user_primary.save()
            AdminProfile.objects.update_or_create(
                user=admin_user_primary,
                defaults={'employee_id': 'ADM-001', 'designation': 'Student Records Administrator'}
            )

            admin_user_secondary, _ = User.objects.update_or_create(
                institutional_id='ADM-002',
                defaults={
                    'username': 'adm-002',
                    'email': 'admin2@smartcampus.edu',
                    'first_name': 'Sneha',
                    'last_name': 'Gupta',
                    'role': User.Role.ADMIN,
                    'is_staff': True,
                    'phone': '9845022222'
                }
            )
            admin_user_secondary.set_password('Admin@123')
            admin_user_secondary.save()
            AdminProfile.objects.update_or_create(
                user=admin_user_secondary,
                defaults={'employee_id': 'ADM-002', 'designation': 'Academic Administration Officer'}
            )

            # Principal Account
            principal_account, _ = User.objects.update_or_create(
                institutional_id='PR001',
                defaults={
                    'username': 'pr001',
                    'email': 'principal@smartcampus.edu',
                    'first_name': 'Dr. K. S.',
                    'last_name': 'Ramanathan',
                    'role': User.Role.PRINCIPAL,
                    'is_staff': True,
                    'phone': '9845033333'
                }
            )
            principal_account.set_password('Principal@123')
            principal_account.save()

            # Vice Principal Account
            vp_account, _ = User.objects.update_or_create(
                institutional_id='VP001',
                defaults={
                    'username': 'vp001',
                    'email': 'vp@smartcampus.edu',
                    'first_name': 'Dr. Meenakshi',
                    'last_name': 'Sundaram',
                    'role': User.Role.VICE_PRINCIPAL,
                    'is_staff': True,
                    'phone': '9845044444'
                }
            )
            vp_account.set_password('VP@123')
            vp_account.save()

            # Department Heads (HODs)
            hod_credentials = [
                ("HOD-CSE-001", "Dr. Rajesh", "Sharma", "CSE", "rajesh.sharma@smartcampus.edu"),
                ("HOD-CSM-001", "Dr. Ananya", "Mukherjee", "CSM", "ananya.m@smartcampus.edu"),
                ("HOD-ECE-001", "Dr. Suresh", "Reddy", "ECE", "suresh.reddy@smartcampus.edu"),
                ("HOD-EEE-001", "Dr. B. K.", "Patel", "EEE", "bk.patel@smartcampus.edu"),
                ("HOD-MECH-001", "Dr. Arvind", "Deshmukh", "MECH", "arvind.d@smartcampus.edu"),
                ("HOD-CAD-001", "Dr. Sanjeev", "Bose", "CAD", "sanjeev.bose@smartcampus.edu"),
            ]
            hod_faculty_profiles_map = {}
            for hod_id, first_name, last_name, dept_code, email_address in hod_credentials:
                hod_user, _ = User.objects.update_or_create(
                    institutional_id=hod_id,
                    defaults={
                        'username': hod_id.lower(),
                        'email': email_address,
                        'first_name': first_name,
                        'last_name': last_name,
                        'role': User.Role.HOD,
                        'phone': '9845055555'
                    }
                )
                hod_user.set_password("Hod@123")
                hod_user.save()

                dept_inst = departments_map[dept_code]
                dept_inst.hod = hod_user
                dept_inst.save()

                faculty_profile_inst, _ = FacultyProfile.objects.update_or_create(
                    user=hod_user,
                    defaults={
                        'faculty_id': hod_id,
                        'department': dept_inst,
                        'designation': 'Professor & Head of Department',
                        'is_hod': True
                    }
                )
                hod_faculty_profiles_map[dept_code] = faculty_profile_inst

            # 7. Operational Faculty Staff
            self.stdout.write("7. Seeding instructional faculty members...")
            faculty_members_data = [
                ("FAC-CSE-001", "Dr. Vikram", "Singhania", "CSE", "Assistant Professor", "vikram.s@smartcampus.edu"),
                ("FAC-CSE-002", "Prof. Sunita", "Rao", "CSE", "Associate Professor", "sunita.rao@smartcampus.edu"),
                ("FAC-CSE-003", "Prof. Amit", "Kumar", "CSE", "Assistant Professor", "amit.k@smartcampus.edu"),
                ("FAC-CSM-001", "Dr. Rohini", "Nair", "CSM", "Associate Professor", "rohini.n@smartcampus.edu"),
                ("FAC-CSM-002", "Prof. Deepak", "Verma", "CSM", "Assistant Professor", "deepak.v@smartcampus.edu"),
                ("FAC-ECE-001", "Dr. Manoj", "Bhat", "ECE", "Associate Professor", "manoj.b@smartcampus.edu"),
                ("FAC-ECE-002", "Prof. Neha", "Kulkarni", "ECE", "Assistant Professor", "neha.k@smartcampus.edu"),
                ("FAC-EEE-001", "Dr. Alok", "Joshi", "EEE", "Professor", "alok.j@smartcampus.edu"),
                ("FAC-MECH-001", "Prof. Harish", "Patil", "MECH", "Assistant Professor", "harish.p@smartcampus.edu"),
                ("FAC-CAD-001", "Prof. Gautam", "Shah", "CAD", "Assistant Professor", "gautam.s@smartcampus.edu"),
            ]

            faculty_profiles_map = {}
            for fac_id, f_name, l_name, dept_code, designation_str, email_str in faculty_members_data:
                faculty_user_record, _ = User.objects.update_or_create(
                    institutional_id=fac_id,
                    defaults={
                        'username': fac_id.lower(),
                        'email': email_str,
                        'first_name': f_name,
                        'last_name': l_name,
                        'role': User.Role.FACULTY,
                        'phone': f"98{random.randint(10000000, 99999999)}"
                    }
                )
                faculty_user_record.set_password("Faculty@123")
                faculty_user_record.save()

                faculty_profile_record, _ = FacultyProfile.objects.update_or_create(
                    user=faculty_user_record,
                    defaults={
                        'faculty_id': fac_id,
                        'department': departments_map[dept_code],
                        'designation': designation_str,
                        'is_hod': False
                    }
                )
                faculty_profiles_map[fac_id] = faculty_profile_record

            # Assign designated section counsellors
            sections_map["CSE-1"].counsellor = faculty_profiles_map["FAC-CSE-001"]
            sections_map["CSE-1"].save()
            sections_map["CSE-2"].counsellor = faculty_profiles_map["FAC-CSE-002"]
            sections_map["CSE-2"].save()
            sections_map["CSE-3"].counsellor = faculty_profiles_map["FAC-CSE-003"]
            sections_map["CSE-3"].save()

            # 8. Teaching Allocations (Faculty -> Course -> Section)
            self.stdout.write("8. Creating faculty timetable allocations...")
            allocations_list = [
                (faculty_profiles_map["FAC-CSE-001"], subjects_map["CS301"], sections_map["CSE-1"]),
                (faculty_profiles_map["FAC-CSE-001"], subjects_map["CS301"], sections_map["CSE-2"]),
                (faculty_profiles_map["FAC-CSE-002"], subjects_map["CS302"], sections_map["CSE-1"]),
                (faculty_profiles_map["FAC-CSE-003"], subjects_map["CS303"], sections_map["CSE-1"]),
                (hod_faculty_profiles_map["CSE"], subjects_map["CS304"], sections_map["CSE-1"]),
                (faculty_profiles_map["FAC-CSM-001"], subjects_map["CM301"], sections_map["CSM-1"]),
                (faculty_profiles_map["FAC-CSM-002"], subjects_map["CM302"], sections_map["CSM-1"]),
                (faculty_profiles_map["FAC-ECE-001"], subjects_map["EC301"], sections_map["ECE-1"]),
                (faculty_profiles_map["FAC-ECE-002"], subjects_map["EC302"], sections_map["ECE-1"]),
            ]

            active_allocations = []
            for faculty_obj, subject_obj, section_obj in allocations_list:
                allocation_record, _ = FacultyAllocation.objects.update_or_create(
                    faculty=faculty_obj,
                    subject=subject_obj,
                    section=section_obj,
                    academic_year=academic_year_instance,
                    semester=5,
                    defaults={'is_active': True}
                )
                active_allocations.append(allocation_record)

            # 9. Representative Students
            self.stdout.write("9. Provisioning representative student cohorts...")
            sample_student_names = [
                "Aarav", "Aditya", "Vihaan", "Arjun", "Sai", "Krishna", "Dhruv", "Kabir", "Pranav", "Advik",
                "Ananya", "Diya", "Gauri", "Ishita", "Kavya", "Meera", "Navya", "Riya", "Saanvi", "Sneha",
                "Rohan", "Rahul", "Varun", "Deepak", "Pooja", "Divya", "Swati", "Anjali", "Tanvi", "Zoya"
            ]

            provisioned_students = []
            for target_section_name in ["CSE-1", "CSE-2", "CSM-1", "ECE-1"]:
                target_section = sections_map[target_section_name]
                target_department = target_section.department
                clean_section_slug = target_section_name.replace('-', '').replace(' ', '')

                for student_index, first_name_token in enumerate(sample_student_names[:15], start=1):
                    # Deterministic alternating surname
                    if student_index % 2 == 0:
                        surname_token = "Sharma"
                    else:
                        surname_token = "Reddy"

                    student_roll_number = f"STU-{clean_section_slug}-{student_index:04d}"
                    student_email = f"{first_name_token.lower()}.{surname_token.lower()}.{student_roll_number.lower()}@smartcampus.edu"

                    student_user_account, _ = User.objects.update_or_create(
                        institutional_id=student_roll_number,
                        defaults={
                            'username': student_roll_number.lower(),
                            'email': student_email,
                            'first_name': first_name_token,
                            'last_name': surname_token,
                            'role': User.Role.STUDENT,
                            'phone': f"91{random.randint(10000000, 99999999)}"
                        }
                    )
                    student_user_account.set_password("Student@123")
                    student_user_account.save()

                    student_profile_record, _ = StudentProfile.objects.update_or_create(
                        user=student_user_account,
                        defaults={
                            'student_id': student_roll_number,
                            'department': target_department,
                            'section': target_section,
                            'academic_year': academic_year_instance,
                            'semester': 5
                        }
                    )
                    provisioned_students.append(student_profile_record)

            # 10. Simulate Sessions and Attendance Records
            self.stdout.write("10. Generating simulated historical class sessions and attendance marks...")
            current_calendar_date = timezone.localdate()
            cse1_cohort = [st for st in provisioned_students if st.section.name == "CSE-1"]

            # Loop backward across the last 10 days
            for day_offset in range(10, -1, -1):
                session_calendar_date = current_calendar_date - timedelta(days=day_offset)
                
                # Omit weekend days
                if session_calendar_date.weekday() >= 5:
                    continue

                for allocation_item in active_allocations[:4]:
                    # Determine period schedule
                    if "301" in allocation_item.subject.code:
                        period_start = time(9, 0)
                        period_end = time(10, 0)
                    else:
                        period_start = time(11, 0)
                        period_end = time(12, 0)

                    # Determine if session attendance should be marked
                    should_mark_attendance = (day_offset > 0 or allocation_item.subject.code == "CS301")
                    
                    class_session_record, _ = ClassSession.objects.update_or_create(
                        allocation=allocation_item,
                        session_date=session_calendar_date,
                        start_time=period_start,
                        defaults={
                            'end_time': period_end,
                            'topic': f"Lecture {10 - day_offset}: {allocation_item.subject.name} Module {((10 - day_offset)//3) + 1}",
                            'is_attendance_taken': should_mark_attendance,
                            'attendance_taken_at': timezone.now() if should_mark_attendance else None,
                            'attendance_taken_by': allocation_item.faculty.user if should_mark_attendance else None
                        }
                    )

                    # Insert individual student attendance records for completed sessions
                    if class_session_record.is_attendance_taken:
                        for student_entity in cse1_cohort:
                            # Generate varied attendance patterns
                            if student_entity.student_id == "STU-CSE1-0005":
                                # Chronic defaulter pattern (~60% attendance)
                                attendance_status = AttendanceRecord.Status.ABSENT if random.random() < 0.40 else AttendanceRecord.Status.PRESENT
                            elif student_entity.student_id == "STU-CSE1-0001":
                                # Exemplary attendance pattern (~90% attendance)
                                attendance_status = AttendanceRecord.Status.PRESENT if random.random() < 0.90 else AttendanceRecord.Status.ABSENT
                            else:
                                # Normal student attendance distribution (~82% attendance)
                                attendance_status = AttendanceRecord.Status.PRESENT if random.random() < 0.82 else AttendanceRecord.Status.ABSENT

                            AttendanceRecord.objects.update_or_create(
                                session=class_session_record,
                                student=student_entity,
                                defaults={'status': attendance_status}
                            )

            # 11. Faculty Biometric Check-in Events
            self.stdout.write("11. Generating faculty biometric terminal arrival logs...")
            all_faculty_profiles = list(faculty_profiles_map.values()) + list(hod_faculty_profiles_map.values())

            for faculty_item in all_faculty_profiles:
                # Distribute check-in statuses realistically
                if faculty_item.faculty_id == "FAC-CSE-003":
                    biometric_status = FacultyBiometricLog.PunchStatus.ABSENT
                    punch_datetime = None
                elif faculty_item.faculty_id == "FAC-CSM-002":
                    biometric_status = FacultyBiometricLog.PunchStatus.LATE
                    punch_datetime = timezone.now().replace(hour=9, minute=25)
                else:
                    biometric_status = FacultyBiometricLog.PunchStatus.PRESENT
                    punch_datetime = timezone.now().replace(hour=8, minute=45)

                FacultyBiometricLog.objects.update_or_create(
                    faculty=faculty_item,
                    date=current_calendar_date,
                    defaults={
                        'punch_time': punch_datetime,
                        'status': biometric_status,
                        'device_id': 'BIO-GATE-MAIN'
                    }
                )

        self.stdout.write(self.style.SUCCESS("\nINSTITUTIONAL MASTER DATA PROVISIONED SUCCESSFULLY!"))
        self.stdout.write("------------------------------------------------------------")
        self.stdout.write("UNIFORM DEMO CREDENTIALS:")
        self.stdout.write("1. Central Admin:   ADM-001       / Admin@123")
        self.stdout.write("2. Principal:       PR001         / Principal@123")
        self.stdout.write("3. Vice Principal:  VP001         / VP@123")
        self.stdout.write("4. HOD (CSE):       HOD-CSE-001   / Hod@123")
        self.stdout.write("5. Faculty (CSE):   FAC-CSE-001   / Faculty@123")
        self.stdout.write("6. Student (CSE):   STU-CSE1-0001 / Student@123")
        self.stdout.write("------------------------------------------------------------")
