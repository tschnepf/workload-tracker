from django.contrib import admin
from .models import UserProfile


@admin.register(UserProfile)
class UserProfileAdmin(admin.ModelAdmin):
    list_display = ('id', 'user', 'person', 'created_at')
    search_fields = ('user__username', 'user__email', 'person__name')
    list_select_related = ('user', 'person')

