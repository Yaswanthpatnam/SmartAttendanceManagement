from rest_framework import viewsets, permissions, views, response, status
from rest_framework_simplejwt.views import TokenObtainPairView
from apps.core.models import User, SystemSetting
from apps.core.serializers import (
    CustomTokenObtainPairSerializer, 
    UserProfileDetailsSerializer, 
    SystemSettingSerializer
)
from apps.core.permissions import IsAdminRole


class CustomTokenObtainPairView(TokenObtainPairView):
    """
    Main authentication endpoint issuing JWT access and refresh tokens.
    Accepts institutional ID or username with password, returning the user's
    role and institutional details directly in the response payload.
    """
    serializer_class = CustomTokenObtainPairSerializer


class CurrentUserView(views.APIView):
    """
    Returns the profile and operational scope of the currently authenticated session.
    Used by frontend clients on reload to populate active context and navigation permissions.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        # Serialize the authenticated user instance
        serializer = UserProfileDetailsSerializer(request.user)
        return response.Response(serializer.data)


class SystemSettingViewSet(viewsets.ModelViewSet):
    """
    CRUD endpoint for institutional configuration variables (e.g. low attendance threshold).
    Read access is open to all authenticated users, while write/update operations
    are strictly restricted to the Administration role.
    """
    queryset = SystemSetting.objects.all().order_by('key')
    serializer_class = SystemSettingSerializer

    def get_permissions(self):
        """
        Dynamically applies strict administrative permissions on mutations,
        while permitting read-only lookups for any authenticated user.
        """
        # If the requested action modifies data, enforce admin authorization
        if self.action in ['create', 'update', 'partial_update', 'destroy']:
            return [IsAdminRole()]
            
        # For safe GET requests (list, retrieve), any authenticated user is allowed
        return [permissions.IsAuthenticated()]
