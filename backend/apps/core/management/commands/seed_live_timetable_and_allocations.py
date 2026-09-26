"""
Live Timetable, Allocations, and Active Class Session Seeder
===========================================================
High-performance bulk seeder that provisions:
1. Active teaching allocations for all faculty roles across departments, specifically
   ensuring FAC-CSE-005 (Dr. Kunal Nair) and colleagues have active subject allocations.
2. Live timetable class sessions for TODAY (timezone.localdate()), yesterday,
   and upcoming days, ensuring faculty dashboards always display active lectures.
3. Realistic student attendance records and biometric gate punches for current dates.
"""

from datetime import timedelta, time
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone
from apps.core.models import User
from apps.academic.models import (
    Department, AcademicYear, Section, Subject,
    FacultyProfile, StudentProfile, FacultyAllocation, ClassSession
)
from apps.attendance.models import AttendanceRecord, FacultyBiometricLog


class Command(BaseCommand):
    help = "Provisions active allocations and class sessions for current dates across all academic departments."

    def handle(self, *args, **options):
        self.stdout.write("============================================================")
        self.stdout.write("PROVISIONING LIVE TIMETABLE ALLOCATIONS & SESSIONS")
        self.stdout.write("============================================================")

        today = timezone.localdate()
        yesterday = today - timedelta(days=1)
        tomorrow = today + timedelta(days=1)
        day_after = today + timedelta(days=2)

        self.stdout.write(f"Target Anchor Dates: Yesterday={yesterday}, Today={today}, Upcoming={tomorrow}, {day_after}")

        acad_year = AcademicYear.objects.filter(is_current=True).first() or AcademicYear.objects.first()
        if not acad_year:
            self.stdout.write(self.style.ERROR("No active academic year found in database."))
            return

        with transaction.atomic():
            # ----------------------------------------------------
            # 1. PROVISION ALLOCATIONS FOR EVERY DEPARTMENT
            # ----------------------------------------------------
            allocation_configs = [
                # CSE Department
                {'dept': 'CSE', 'fid': 'FAC-CSE-001', 'code': 'CS301', 'sec': 'CSE-1', 'sem': 5},
                {'dept': 'CSE', 'fid': 'FAC-CSE-001', 'code': 'CS301', 'sec': 'CSE-2', 'sem': 5},
                {'dept': 'CSE', 'fid': 'FAC-CSE-001', 'code': 'CS301', 'sec': 'CSE-3', 'sem': 5},
                {'dept': 'CSE', 'fid': 'FAC-CSE-002', 'code': 'CS302', 'sec': 'CSE-1', 'sem': 5},
                {'dept': 'CSE', 'fid': 'FAC-CSE-002', 'code': 'CS302', 'sec': 'CSE-3', 'sem': 5},
                {'dept': 'CSE', 'fid': 'FAC-CSE-003', 'code': 'CS303', 'sec': 'CSE-1', 'sem': 5},
                {'dept': 'CSE', 'fid': 'FAC-CSE-003', 'code': 'CS303', 'sec': 'CSE-3', 'sem': 5},
                # Crucial saved demo account: FAC-CSE-005 (Dr. Kunal Nair)
                {'dept': 'CSE', 'fid': 'FAC-CSE-005', 'code': 'CS304', 'sec': 'CSE-2', 'sem': 5},
                {'dept': 'CSE', 'fid': 'FAC-CSE-005', 'code': 'CS304', 'sec': 'CSE-3', 'sem': 5},
                {'dept': 'CSE', 'fid': 'FAC-CSE-005', 'code': 'CS302', 'sec': 'CSE-2', 'sem': 5},
                {'dept': 'CSE', 'fid': 'HOD-CSE-001', 'code': 'CS304', 'sec': 'CSE-1', 'sem': 5},

                # CSM Department
                {'dept': 'CSM', 'fid': 'FAC-CSM-001', 'code': 'CM301', 'sec': 'CSM-1', 'sem': 5},
                {'dept': 'CSM', 'fid': 'FAC-CSM-001', 'code': 'CM301', 'sec': 'CSM-2', 'sem': 5},
                {'dept': 'CSM', 'fid': 'FAC-CSM-002', 'code': 'CM302', 'sec': 'CSM-1', 'sem': 5},
                {'dept': 'CSM', 'fid': 'FAC-CSM-002', 'code': 'CM302', 'sec': 'CSM-2', 'sem': 5},
                {'dept': 'CSM', 'fid': 'FAC-CSM-004', 'code': 'CM303', 'sec': 'CSM-1', 'sem': 5},
                {'dept': 'CSM', 'fid': 'FAC-CSM-004', 'code': 'CM303', 'sec': 'CSM-2', 'sem': 5},

                # ECE Department
                {'dept': 'ECE', 'fid': 'FAC-ECE-001', 'code': 'EC301', 'sec': 'ECE-1', 'sem': 5},
                {'dept': 'ECE', 'fid': 'FAC-ECE-001', 'code': 'EC301', 'sec': 'ECE-2', 'sem': 5},
                {'dept': 'ECE', 'fid': 'FAC-ECE-002', 'code': 'EC302', 'sec': 'ECE-1', 'sem': 5},
                {'dept': 'ECE', 'fid': 'FAC-ECE-002', 'code': 'EC302', 'sec': 'ECE-2', 'sem': 5},
                {'dept': 'ECE', 'fid': 'FAC-ECE-030', 'code': 'EC303', 'sec': 'ECE-1', 'sem': 5},
                {'dept': 'ECE', 'fid': 'FAC-ECE-030', 'code': 'EC303', 'sec': 'ECE-2', 'sem': 5},

                # EEE Department
                {'dept': 'EEE', 'fid': 'FAC-EEE-001', 'code': 'EE301', 'sec': 'EEE-1', 'sem': 5},
                {'dept': 'EEE', 'fid': 'FAC-EEE-001', 'code': 'EE301', 'sec': 'EEE-2', 'sem': 5},
                {'dept': 'EEE', 'fid': 'FAC-EEE-002', 'code': 'EE302', 'sec': 'EEE-1', 'sem': 5},
                {'dept': 'EEE', 'fid': 'FAC-EEE-002', 'code': 'EE302', 'sec': 'EEE-2', 'sem': 5},
                {'dept': 'EEE', 'fid': 'FAC-EEE-003', 'code': 'EE303', 'sec': 'EEE-1', 'sem': 5},
                {'dept': 'EEE', 'fid': 'FAC-EEE-003', 'code': 'EE303', 'sec': 'EEE-2', 'sem': 5},

                # MECH Department
                {'dept': 'MECH', 'fid': 'FAC-MECH-001', 'code': 'ME301', 'sec': 'MECH-1', 'sem': 5},
                {'dept': 'MECH', 'fid': 'FAC-MECH-001', 'code': 'ME301', 'sec': 'MECH-2', 'sem': 5},
                {'dept': 'MECH', 'fid': 'FAC-MECH-013', 'code': 'ME302', 'sec': 'MECH-1', 'sem': 5},
                {'dept': 'MECH', 'fid': 'FAC-MECH-013', 'code': 'ME302', 'sec': 'MECH-2', 'sem': 5},
                {'dept': 'MECH', 'fid': 'FAC-MECH-017', 'code': 'ME303', 'sec': 'MECH-1', 'sem': 5},
                {'dept': 'MECH', 'fid': 'FAC-MECH-017', 'code': 'ME303', 'sec': 'MECH-2', 'sem': 5},

                # CAD Department
                {'dept': 'CAD', 'fid': 'FAC-CAD-001', 'code': 'CD301', 'sec': 'CAD-1', 'sem': 5},
                {'dept': 'CAD', 'fid': 'FAC-CAD-001', 'code': 'CD301', 'sec': 'CAD-2', 'sem': 5},
                {'dept': 'CAD', 'fid': 'FAC-CAD-005', 'code': 'CD302', 'sec': 'CAD-1', 'sem': 5},
                {'dept': 'CAD', 'fid': 'FAC-CAD-005', 'code': 'CD302', 'sec': 'CAD-2', 'sem': 5},
                {'dept': 'CAD', 'fid': 'FAC-CAD-015', 'code': 'CD303', 'sec': 'CAD-1', 'sem': 5},
                {'dept': 'CAD', 'fid': 'FAC-CAD-015', 'code': 'CD303', 'sec': 'CAD-2', 'sem': 5},
            ]

            created_allocs = []
            for cfg in allocation_configs:
                fac = FacultyProfile.objects.filter(faculty_id=cfg['fid']).first()
                if not fac:
                    u = User.objects.filter(institutional_id=cfg['fid']).first()
                    fac = getattr(u, 'faculty_profile', None) if u else None

                subj = Subject.objects.filter(code=cfg['code']).first()
                sec = Section.objects.filter(name=cfg['sec'], department__code=cfg['dept']).first()

                if fac and subj and sec:
                    alloc, _ = FacultyAllocation.objects.get_or_create(
                        faculty=fac,
                        subject=subj,
                        section=sec,
                        academic_year=acad_year,
                        semester=cfg['sem'],
                        defaults={'is_active': True}
                    )
                    created_allocs.append(alloc)

            self.stdout.write(self.style.SUCCESS(f"Total active allocations configured: {len(created_allocs)}"))

            # ----------------------------------------------------
            # 2. PROVISION TIMETABLE CLASS SESSIONS
            # ----------------------------------------------------
            time_slots = [
                {'start': time(9, 0), 'end': time(10, 0), 'label': 'Morning Period 1'},
                {'start': time(10, 15), 'end': time(11, 15), 'label': 'Morning Period 2'},
                {'start': time(11, 30), 'end': time(12, 30), 'label': 'Midday Period 3'},
                {'start': time(13, 30), 'end': time(14, 30), 'label': 'Afternoon Period 4'},
                {'start': time(14, 45), 'end': time(15, 45), 'label': 'Afternoon Period 5'},
            ]

            # Days plan:
            # Yesterday: Completed sessions
            # Today: Alternate between Pending (False) and Completed (True) so faculty can TAKE ATTENDANCE immediately!
            # Tomorrow & Day After: Upcoming Pending sessions
            days_plan = [
                {'date': yesterday, 'status': 'COMPLETED'},
                {'date': today, 'status': 'MIXED'},
                {'date': tomorrow, 'status': 'PENDING'},
                {'date': day_after, 'status': 'PENDING'},
            ]

            # Fetch existing class sessions to avoid duplicates
            target_dates = [p['date'] for p in days_plan]
            existing_sessions = set(
                ClassSession.objects.filter(session_date__in=target_dates).values_list('allocation_id', 'session_date', 'start_time')
            )

            sessions_to_create = []
            for plan in days_plan:
                s_date = plan['date']
                s_mode = plan['status']

                for idx, alloc in enumerate(created_allocs):
                    slot = time_slots[idx % len(time_slots)]
                    key = (alloc.id, s_date, slot['start'])
                    if key in existing_sessions:
                        continue

                    topic_text = f"{alloc.subject.name} - Unit {(idx % 4) + 1} Lecture"
                    if s_mode == 'COMPLETED':
                        is_taken = True
                    elif s_mode == 'PENDING':
                        is_taken = False
                    else:
                        # For today: Alternate! Even index = Pending (Attendance NOT taken yet -> can take now!)
                        # Odd index = Completed (Attendance already taken -> can view/correct!)
                        is_taken = (idx % 2 == 1)

                    sessions_to_create.append(
                        ClassSession(
                            allocation=alloc,
                            session_date=s_date,
                            start_time=slot['start'],
                            end_time=slot['end'],
                            topic=topic_text,
                            is_attendance_taken=is_taken,
                            attendance_taken_at=timezone.now() if is_taken else None,
                            attendance_taken_by=alloc.faculty.user if is_taken else None,
                        )
                    )

            if sessions_to_create:
                ClassSession.objects.bulk_create(sessions_to_create)
                self.stdout.write(self.style.SUCCESS(f"Created {len(sessions_to_create)} new class sessions."))
            else:
                self.stdout.write("All required class sessions already exist.")

            # ----------------------------------------------------
            # 3. FAST BATCH PROVISION OF COMPLETED ATTENDANCE MARKS
            # ----------------------------------------------------
            completed_sessions = list(ClassSession.objects.filter(
                session_date__in=[yesterday, today],
                is_attendance_taken=True
            ).select_related('allocation__section'))

            if completed_sessions:
                # Cache students by section
                sec_ids = set(s.allocation.section_id for s in completed_sessions)
                students_by_sec = {}
                all_students = StudentProfile.objects.filter(section_id__in=sec_ids).select_related('user')
                for stu in all_students:
                    students_by_sec.setdefault(stu.section_id, []).append(stu)

                existing_records = set(
                    AttendanceRecord.objects.filter(
                        session__in=completed_sessions
                    ).values_list('session_id', 'student_id')
                )

                records_to_create = []
                for s_idx, session in enumerate(completed_sessions):
                    section_students = students_by_sec.get(session.allocation.section_id, [])
                    for st_idx, stu in enumerate(section_students):
                        if (session.id, stu.id) in existing_records:
                            continue
                        mark_status = 'ABSENT' if (st_idx + s_idx) % 7 == 0 else 'PRESENT'
                        records_to_create.append(
                            AttendanceRecord(
                                session=session,
                                student=stu,
                                status=mark_status
                            )
                        )

                if records_to_create:
                    AttendanceRecord.objects.bulk_create(records_to_create, batch_size=1000)
                    self.stdout.write(self.style.SUCCESS(f"Created {len(records_to_create)} attendance marks in bulk."))

            # ----------------------------------------------------
            # 4. PROVISION BIOMETRIC PUNCHES FOR ALL FACULTY TODAY
            # ----------------------------------------------------
            all_faculties = FacultyProfile.objects.all().select_related('user')
            existing_punches = set(
                FacultyBiometricLog.objects.filter(date=today).values_list('faculty_id', flat=True)
            )

            punches_to_create = []
            punch_time_val = timezone.now().replace(hour=8, minute=45, second=0, microsecond=0)
            for fac in all_faculties:
                if fac.id not in existing_punches:
                    punches_to_create.append(
                        FacultyBiometricLog(
                            faculty=fac,
                            date=today,
                            punch_time=punch_time_val,
                            device_id='BIO-GATE-MAIN-01',
                            status='PRESENT'
                        )
                    )

            if punches_to_create:
                FacultyBiometricLog.objects.bulk_create(punches_to_create, batch_size=500)
                self.stdout.write(self.style.SUCCESS(f"Created {len(punches_to_create)} faculty biometric entries for {today}."))

        self.stdout.write("============================================================")
        self.stdout.write(self.style.SUCCESS("TIMETABLE & ALLOCATIONS SEEDING COMPLETED SUCCESSFULLY!"))
        self.stdout.write("============================================================")
