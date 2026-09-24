from django.db import models
from django.contrib.auth.models import AbstractUser


class User(AbstractUser):
    """
    Core institutional account model representing students, faculty, HODs, 
    principals, vice principals, and system administrators.
    
    Acts as the single authentication identity across the campus system, with
    role-based profile relations storing academic-specific metadata.
    """
    
    # Institutional roles recognized by the college governance system
    class Role(models.TextChoices):
        ADMIN = 'ADMIN', 'Administration'
        PRINCIPAL = 'PRINCIPAL', 'Principal'
        VICE_PRINCIPAL = 'VICE_PRINCIPAL', 'Vice Principal'
        HOD = 'HOD', 'Head of Department'
        FACULTY = 'FACULTY', 'Faculty Member'
        STUDENT = 'STUDENT', 'Student'

    # Role designation drives sidebar navigation, API permissions, and dashboard views
    role = models.CharField(
        max_length=20,
        choices=Role.choices,
        default=Role.STUDENT,
        help_text="Primary institutional role determining permissions and dashboard views."
    )
    
    # Official college registration ID (e.g., FAC-CSE-001, STU-CSE1-0001, HOD-CSE-001)
    institutional_id = models.CharField(
        max_length=50,
        unique=True,
        db_index=True,
        help_text="College-issued ID used as the primary login identifier."
    )
    
    # Contact & demographic fields
    phone = models.CharField(max_length=20, blank=True, null=True)
    date_of_birth = models.DateField(null=True, blank=True)

    class Meta:
        verbose_name = 'User'
        verbose_name_plural = 'Users'
        indexes = [
            # Compound index for lightning-fast credential lookup by role and institutional ID
            models.Index(fields=['role', 'institutional_id']),
        ]

    def __str__(self):
        """Human-readable representation showing institutional ID, name, and role."""
        name_display = self.get_full_name()
        # If user full name is empty, fall back to username
        if not name_display:
            name_display = self.username
        return f"{self.institutional_id} - {name_display} ({self.get_role_display()})"


class SystemSetting(models.Model):
    """
    Campus-wide configuration repository (e.g., minimum attendance percentage threshold).
    Eliminates hardcoded business constants and enables administrative tuning at runtime.
    """
    key = models.CharField(max_length=64, unique=True, db_index=True)
    value = models.TextField(help_text="Stored string/numeric/JSON setting value.")
    description = models.TextField(blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    @classmethod
    def get_setting(cls, key: str, default: str = "") -> str:
        """
        Safely retrieves a configuration value by key with fallback default.
        """
        try:
            setting_obj = cls.objects.get(key=key)
            return setting_obj.value
        except cls.DoesNotExist:
            # When the key hasn't been configured in the DB yet, return the default
            return default

    @classmethod
    def get_float(cls, key: str, default: float = 75.0) -> float:
        """
        Retrieves a numeric setting value (e.g. attendance percentage threshold)
        with robust error handling for missing keys or malformed floats.
        """
        try:
            setting_obj = cls.objects.get(key=key)
            return float(setting_obj.value)
        except (cls.DoesNotExist, ValueError):
            # If key does not exist or value cannot be parsed as a float, safely fallback
            return default

    def __str__(self):
        return f"{self.key} = {self.value}"
