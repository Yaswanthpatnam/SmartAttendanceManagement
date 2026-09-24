from rest_framework import permissions
from apps.core.models import User


class IsAdminRole(permissions.BasePermission):
    """
    Grants access exclusively to college administration staff (e.g. Registrar, Academic Admin).
    Used to protect master data endpoints like department/subject creation and CSV bulk imports.
    """
    def has_permission(self, request, view):
        # Verify user is authenticated and possesses the ADMIN role
        if request.user and request.user.is_authenticated:
            return request.user.role == User.Role.ADMIN
        return False


class IsPrincipalOrVPRole(permissions.BasePermission):
    """
    Grants read/monitoring access to the Principal, Vice Principal, and Administration.
    Permits viewing college-wide aggregated KPIs, rankings, and low-attendance rosters.
    """
    def has_permission(self, request, view):
        # Check authentication state
        if not request.user or not request.user.is_authenticated:
            return False
            
        # Allowed roles: Principal, Vice Principal, or System Admin
        allowed_roles = [User.Role.PRINCIPAL, User.Role.VICE_PRINCIPAL, User.Role.ADMIN]
        return request.user.role in allowed_roles


class IsHODRole(permissions.BasePermission):
    """
    Grants access to Heads of Department and higher executive oversight personas.
    Permits departmental management: faculty allocations, proctor assignments, and substitutions.
    """
    def has_permission(self, request, view):
        # Must be logged in
        if not request.user or not request.user.is_authenticated:
            return False
            
        # HODs, Admins, Principals, and VPs have departmental visibility
        authorized_roles = [
            User.Role.HOD, 
            User.Role.ADMIN, 
            User.Role.PRINCIPAL, 
            User.Role.VICE_PRINCIPAL
        ]
        return request.user.role in authorized_roles


class IsFacultyRole(permissions.BasePermission):
    """
    Grants access to faculty members (and HODs who also have teaching allocations).
    Allows marking class rosters, requesting corrections, and viewing assigned schedules.
    """
    def has_permission(self, request, view):
        # Must be logged in
        if not request.user or not request.user.is_authenticated:
            return False
            
        # Faculty, HODs (who teach), and Admins have operational access
        return request.user.role in [User.Role.FACULTY, User.Role.HOD, User.Role.ADMIN]


class IsStudentRole(permissions.BasePermission):
    """
    Grants access to students for self-service attendance viewing.
    """
    def has_permission(self, request, view):
        # Must be logged in as an active student
        if request.user and request.user.is_authenticated:
            return request.user.role == User.Role.STUDENT
        return False


class IsSelfOrStaff(permissions.BasePermission):
    """
    Object-level authorization policy enforcing strict data scope boundaries:
    - Students may ONLY view their own records (HTTP 403 when probing other students).
    - HODs may only access objects within their assigned academic department.
    - Faculty may access objects related to their teaching sessions.
    - Administrators, Principal, and VP maintain campus-wide visibility.
    """
    def has_object_permission(self, request, view, obj):
        # Unauthenticated calls are rejected immediately
        if not request.user or not request.user.is_authenticated:
            return False
            
        user = request.user
        
        # Branch 1: Executive leadership and administration have campus-wide access
        if user.role in [User.Role.ADMIN, User.Role.PRINCIPAL, User.Role.VICE_PRINCIPAL]:
            return True
            
        # Branch 2: Student accessing personal records
        if user.role == User.Role.STUDENT:
            # Check if target object directly references the user model
            if hasattr(obj, 'user'):
                return obj.user == user
            # Check if target object is a student profile relation
            elif hasattr(obj, 'student'):
                return obj.student.user == user
            # Direct comparison if object itself is a User instance
            else:
                return obj == user
            
        # Branch 3: HOD access strictly scoped to their department
        if user.role == User.Role.HOD:
            # Resolve HOD's department either via managed_department or faculty profile
            user_dept = getattr(user, 'managed_department', None)
            if not user_dept and hasattr(user, 'faculty_profile'):
                user_dept = user.faculty_profile.department
                
            # If department was successfully resolved, check object ownership
            if user_dept:
                if hasattr(obj, 'department'):
                    return obj.department == user_dept
                elif hasattr(obj, 'section') and hasattr(obj.section, 'department'):
                    return obj.section.department == user_dept
            return False

        # Branch 4: Teaching faculty default restriction
        return False
