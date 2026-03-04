from django.urls import path
from .views import PersonalWorkView, PersonalLeadProjectGridView

urlpatterns = [
    path('work/', PersonalWorkView.as_view(), name='personal-work'),
    path('lead_project_grid/', PersonalLeadProjectGridView.as_view(), name='personal-lead-project-grid'),
]
