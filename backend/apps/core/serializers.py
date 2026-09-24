from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from apps.core.models import User, SystemSetting


class UserProfileDetailsSerializer(serializers.ModelSerializer):
    """
    Serializes comprehensive user information alongside role-specific operational context.
    Returns tailored metadata depending on whether the user is a student, faculty member,
    section counsellor, HOD, or campus executive.
    """
    role_display = serializers.CharField(source='get_role_display', read_only=True)
    profile_details = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            'id', 'username', 'institutional_id', 'email',
            'first_name', 'last_name', 'phone', 'role',
            'role_display', 'profile_details'
        ]

    def get_profile_details(self, obj):
        """
        Dynamically extracts domain metadata matching the authenticated user's role.
        """
        details = {}
        
        # Scenario 1: Administration staff profile details
        if obj.role == User.Role.ADMIN and hasattr(obj, 'admin_profile'):
            details = {
                'employee_id': obj.admin_profile.employee_id,
                'designation': obj.admin_profile.designation,
            }
            
        # Scenario 2: Faculty / HOD profile details, including counsellor assignments
        elif obj.role in [User.Role.FACULTY, User.Role.HOD] and hasattr(obj, 'faculty_profile'):
            profile = obj.faculty_profile
            
            # Iterate through all sections this faculty member is designated to proctor/counsel
            counselled_list = []
            for sec in profile.counselled_sections.select_related('department').all():
                counselled_list.append({
                    'id': sec.id,
                    'name': sec.name,
                    'department_code': sec.department.code,
                    'current_semester': sec.current_semester,
                    'student_count': sec.students.count()
                })
                
            details = {
                'faculty_id': profile.faculty_id,
                'department_id': profile.department.id,
                'department_code': profile.department.code,
                'department_name': profile.department.name,
                'designation': profile.designation,
                'is_hod': profile.is_hod,
                # Explicit boolean flag denoting whether this faculty is an assigned section proctor
                'is_counsellor': len(counselled_list) > 0,
                'counselled_sections': counselled_list,
            }
            
        # Scenario 3: Student profile details with current enrollment scope
        elif obj.role == User.Role.STUDENT and hasattr(obj, 'student_profile'):
            stu_profile = obj.student_profile
            details = {
                'student_id': stu_profile.student_id,
                'department_id': stu_profile.department.id,
                'department_code': stu_profile.department.code,
                'department_name': stu_profile.department.name,
                'section_id': stu_profile.section.id,
                'section_name': stu_profile.section.name,
                'semester': stu_profile.semester,
                'academic_year': stu_profile.academic_year.year_label,
            }
            
        # Scenario 4: Campus leadership (Principal & Vice Principal)
        elif obj.role in [User.Role.PRINCIPAL, User.Role.VICE_PRINCIPAL]:
            # Principal Office vs Vice Principal Office title distinction
            if obj.role == User.Role.PRINCIPAL:
                office_title = 'Principal Office'
            else:
                office_title = 'Vice Principal Office'
                
            details = {
                'institutional_title': office_title,
                'scope': 'INSTITUTION_WIDE'
            }
            
        return details


class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    """
    Enhanced SimpleJWT login serializer that enables users to sign in using
    either their traditional username OR official institutional ID (e.g. FAC-CSE-001, STU-CSE1-0001).
    Embeds the full user profile details into the login token response payload.
    """
    def validate(self, attrs):
        username_or_id = attrs.get('username')
        
        # Check if the user entered their institutional ID instead of username
        if username_or_id:
            # Perform case-insensitive search on institutional_id field
            user_candidate = User.objects.filter(institutional_id__iexact=username_or_id.strip()).first()
            if user_candidate:
                # Map to standard username so underlying Django authentication succeeds
                attrs['username'] = user_candidate.username

        # Authenticate credentials and generate JWT tokens
        token_data = super().validate(attrs)
        
        # Attach complete user profile details directly in the response
        user_serializer = UserProfileDetailsSerializer(self.user)
        token_data['user'] = user_serializer.data
        
        return token_data


class SystemSettingSerializer(serializers.ModelSerializer):
    """
    Serializes institutional system settings for administrative maintenance.
    """
    class Meta:
        model = SystemSetting
        fields = ['id', 'key', 'value', 'description', 'updated_at']
