from django.urls import path
from .views import PersonalWorkView

urlpatterns = [
    path('work/', PersonalWorkView.as_view(), name='personal-work'),
]

