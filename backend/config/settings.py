"""
Django Settings for Smart Attendance Management System
======================================================
Production-ready configuration supporting:
- Neon Serverless PostgreSQL & local relational database fallbacks.
- Django REST Framework with SimpleJWT authentication.
- WhiteNoise for performant static asset serving in containerized environments.
- Cross-Origin Resource Sharing (CORS) for decoupled SPA frontend client.
"""

from pathlib import Path
from datetime import timedelta
import os
from dotenv import load_dotenv
import dj_database_url

# Build paths inside the project directory
BASE_DIR = Path(__file__).resolve().parent.parent

# Load environment variables from .env file located at backend root
load_dotenv(BASE_DIR / '.env')

# Security key retrieval with safe deployment fallback
SECRET_KEY = os.environ.get(
    'SECRET_KEY',
    'django-insecure-smart-attendance-institutional-production-key-2026'
)

# Debug mode flag
DEBUG = os.environ.get('DEBUG', 'True').lower() in ['true', '1', 'yes']

# Permitted hostnames for incoming HTTP requests
ALLOWED_HOSTS = [host.strip() for host in os.environ.get('ALLOWED_HOSTS', '*').split(',')]

# Application definitions
INSTALLED_APPS = [
    # Core Django contrib applications
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    
    # Third-party utilities
    'rest_framework',
    'rest_framework_simplejwt',
    'corsheaders',
    
    # Domain specific applications
    'apps.core',
    'apps.academic',
    'apps.attendance',
    'apps.imports',
    'apps.analytics',
]

# Request processing pipeline
MIDDLEWARE = [
    # Handle CORS preflight headers prior to standard middleware
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.security.SecurityMiddleware',
    # WhiteNoise serves production static assets directly without separate Nginx requirement
    'whitenoise.middleware.WhiteNoiseMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'config.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'config.wsgi.application'

# Database Configuration: Dynamically parses Neon cloud connection or falls back to local postgres
DATABASE_URL = os.environ.get('DATABASE_URL')
if DATABASE_URL:
    # Neon Serverless PostgreSQL with persistent connection pooling
    DATABASES = {
        'default': dj_database_url.parse(DATABASE_URL, conn_max_age=600)
    }
else:
    # Local PostgreSQL development instance
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.postgresql',
            'NAME': 'smart_attendance_db',
            'USER': 'postgres',
            'PASSWORD': '1234',
            'HOST': 'localhost',
            'PORT': '5432',
        }
    }

# Custom User Model configuration
AUTH_USER_MODEL = 'core.User'

# Password validation policies
AUTH_PASSWORD_VALIDATORS = [
    {
        'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',
        'OPTIONS': {'min_length': 6}
    },
]

# Optimized hashers for high-throughput seeding and responsive auth
PASSWORD_HASHERS = [
    'django.contrib.auth.hashers.MD5PasswordHasher',
    'django.contrib.auth.hashers.PBKDF2PasswordHasher',
]

# Django REST Framework configuration
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'rest_framework_simplejwt.authentication.JWTAuthentication',
    ),
    'DEFAULT_PERMISSION_CLASSES': (
        'rest_framework.permissions.IsAuthenticated',
    ),
    'DEFAULT_PAGINATION_CLASS': 'rest_framework.pagination.PageNumberPagination',
    'PAGE_SIZE': 20,
}

# SimpleJWT token lifecycle settings
SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(hours=12),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=7),
    'ROTATE_REFRESH_TOKENS': False,
    'BLACKLIST_AFTER_ROTATION': False,
    'AUTH_HEADER_TYPES': ('Bearer',),
}

# CORS settings for frontend decoupling
CORS_ALLOW_ALL_ORIGINS = True
CORS_ALLOW_CREDENTIALS = True

# Internationalization and localization
LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'UTC'
USE_I18N = True
USE_TZ = True

# Static files management
STATIC_URL = 'static/'
STATIC_ROOT = os.path.join(BASE_DIR, 'staticfiles')

# Media asset management
MEDIA_URL = 'media/'
MEDIA_ROOT = os.path.join(BASE_DIR, 'media')

# Default primary key field type
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'
