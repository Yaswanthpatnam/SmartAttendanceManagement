"""
Custom REST Framework Pagination Controllers
============================================
Provides unified pagination classes with dynamic bypass capability ('all=true' or 'page_size=all')
for operational dropdown menus and comprehensive administration views.
"""

from rest_framework.pagination import PageNumberPagination


class FlexiblePagination(PageNumberPagination):
    """
    Standard institutional pagination class that supports on-demand bypass.
    When query parameter 'all=true' or 'page_size=all' is provided, results
    are returned unpaginated for master data dropdowns and form selectors.
    """
    page_size = 20
    page_size_query_param = 'page_size'
    max_page_size = 1000

    def paginate_queryset(self, queryset, request, view=None):
        """
        Conditionally disables pagination when full listings are requested for dropdown selectors.
        """
        all_param = request.query_params.get('all', '').strip().lower()
        page_size_param = request.query_params.get('page_size', '').strip().lower()

        # Disable pagination if client requests all records
        if all_param in ['true', '1', 'yes'] or page_size_param in ['all', 'none']:
            return None

        return super().paginate_queryset(queryset, request, view)
