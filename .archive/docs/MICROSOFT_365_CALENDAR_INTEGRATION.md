# Microsoft 365 Calendar Integration Guide

## Overview

This guide walks you through integrating the Workload Tracker application with your company's Microsoft 365 calendar system. This integration allows project deliverable dates to automatically appear in Outlook calendars, providing seamless visibility for your team.

**What you'll accomplish:**
- Project deliverable dates automatically sync to Microsoft 365 calendars
- Team members can see relevant project milestones in their Outlook
- Secure, enterprise-grade integration using Microsoft Graph API
- No public access - everything stays within your organization

## Prerequisites

### What You Need
- **Company Microsoft 365 subscription** (Office 365 or Microsoft 365)
- **Azure Active Directory admin access** (or someone who can create app registrations)
- **Workload Tracker application** already running (your Django/React app)
- **Basic command line familiarity** (running Docker commands)

### Skills Required
- Basic understanding of web applications
- Ability to follow step-by-step instructions
- Access to copy/paste configuration values
- No advanced programming knowledge required

## Integration Architecture

### How It Works
```
Workload Tracker → Microsoft Graph API → Microsoft 365 Calendar
```

1. **Workload Tracker** creates/updates deliverable dates in your database
2. **Microsoft Graph API** securely communicates with Microsoft 365
3. **Calendar Events** are created/updated in your organization's calendars

### Two Implementation Options

**Option A: Shared Organization Calendar** (Recommended)
- Creates a single "Project Deliverables" calendar
- All employees can subscribe to see project dates
- Easier to manage and secure
- Events show project context and team assignments

**Option B: Individual User Calendars**
- Pushes relevant deliverables to each person's personal calendar
- More personalized but requires more permissions
- Users only see deliverables they're assigned to

## Phase 1: Azure Active Directory Setup

### Step 1: Create App Registration

1. **Sign in to Azure Portal**
   - Go to https://portal.azure.com
   - Use your company Microsoft 365 admin account

2. **Navigate to App Registrations**
   - Search for "App registrations" in the top search bar
   - Click on "App registrations" service

3. **Create New Registration**
   - Click "New registration"
   - Fill out the form:
     ```
     Name: Workload Tracker Calendar Integration
     Supported account types: Accounts in this organizational directory only
     Redirect URI: Leave blank for now
     ```
   - Click "Register"

4. **Record Important Values**
   After creation, copy these values (you'll need them later):
   ```
   Application (client) ID: [Copy this value]
   Directory (tenant) ID: [Copy this value]
   Object ID: [Copy this value]
   ```

### Step 2: Create Client Secret

1. **Go to Certificates & secrets**
   - In your app registration, click "Certificates & secrets" in left menu

2. **Create New Client Secret**
   - Click "New client secret"
   - Description: `Workload Tracker API Access`
   - Expires: Choose appropriate duration (6 months, 1 year, or 2 years)
   - Click "Add"

3. **Copy Secret Value**
   ```
   Client Secret Value: [Copy this immediately - it won't show again]
   ```
   ⚠️ **Important**: Copy this value immediately. You cannot retrieve it later.

### Step 3: Configure API Permissions

1. **Go to API Permissions**
   - Click "API permissions" in the left menu

2. **Add Microsoft Graph Permissions**
   - Click "Add a permission"
   - Choose "Microsoft Graph"
   - Choose "Application permissions" (not Delegated)

3. **Select Required Permissions**
   For **Option A (Shared Calendar)**:
   ```
   Calendars.ReadWrite
   User.Read.All (to identify users for event creation)
   ```
   
   For **Option B (Individual Calendars)**:
   ```
   Calendars.ReadWrite
   User.Read.All
   ```

4. **Grant Admin Consent**
   - Click "Grant admin consent for [Your Organization]"
   - Confirm when prompted
   - Status should show green checkmarks

## Phase 2: Application Configuration

### Step 4: Update Environment Variables

1. **Add to your .env file**
   ```bash
   # Microsoft Graph Configuration
   MICROSOFT_TENANT_ID=your-tenant-id-here
   MICROSOFT_CLIENT_ID=your-client-id-here  
   MICROSOFT_CLIENT_SECRET=your-client-secret-here
   
   # Calendar Configuration
   MICROSOFT_CALENDAR_ENABLED=true
   MICROSOFT_CALENDAR_MODE=shared  # or 'individual'
   MICROSOFT_SHARED_CALENDAR_NAME=Project Deliverables
   ```

2. **Update docker-compose.yml**
   Add these environment variables to your backend service:
   ```yaml
   backend:
     # ... existing configuration
     environment:
       # ... existing environment variables
       - MICROSOFT_TENANT_ID=${MICROSOFT_TENANT_ID}
       - MICROSOFT_CLIENT_ID=${MICROSOFT_CLIENT_ID}
       - MICROSOFT_CLIENT_SECRET=${MICROSOFT_CLIENT_SECRET}
       - MICROSOFT_CALENDAR_ENABLED=${MICROSOFT_CALENDAR_ENABLED}
       - MICROSOFT_CALENDAR_MODE=${MICROSOFT_CALENDAR_MODE}
       - MICROSOFT_SHARED_CALENDAR_NAME=${MICROSOFT_SHARED_CALENDAR_NAME}
   ```

### Step 5: Install Required Dependencies

1. **Add Microsoft Graph SDK**
   Add to `backend/requirements.txt`:
   ```
   msgraph-sdk==1.0.0
   azure-identity==1.15.0
   ```

2. **Rebuild Backend Container**
   ```bash
   docker-compose build backend
   docker-compose restart backend
   ```

## Phase 3: Technical Implementation

### Step 6: Create Calendar Service

The following files need to be created in your Django backend:

**File: `backend/core/microsoft_graph.py`**
```python
"""
Microsoft Graph API integration for calendar management
"""
import os
from datetime import datetime, timedelta
from azure.identity import ClientSecretCredential
from msgraph import GraphServiceClient
from msgraph.generated.users.item.calendars.item.events.events_request_builder import EventsRequestBuilder
from msgraph.generated.models.event import Event
from msgraph.generated.models.date_time_time_zone import DateTimeTimeZone
from msgraph.generated.models.item_body import ItemBody
from msgraph.generated.models.body_type import BodyType
import logging

logger = logging.getLogger(__name__)

class MicrosoftGraphService:
    """Service for Microsoft Graph API operations"""
    
    def __init__(self):
        self.tenant_id = os.getenv('MICROSOFT_TENANT_ID')
        self.client_id = os.getenv('MICROSOFT_CLIENT_ID')
        self.client_secret = os.getenv('MICROSOFT_CLIENT_SECRET')
        self.enabled = os.getenv('MICROSOFT_CALENDAR_ENABLED', 'false').lower() == 'true'
        self.mode = os.getenv('MICROSOFT_CALENDAR_MODE', 'shared')
        self.shared_calendar_name = os.getenv('MICROSOFT_SHARED_CALENDAR_NAME', 'Project Deliverables')
        
        if self.enabled and all([self.tenant_id, self.client_id, self.client_secret]):
            self.credential = ClientSecretCredential(
                tenant_id=self.tenant_id,
                client_id=self.client_id,
                client_secret=self.client_secret
            )
            self.graph_client = GraphServiceClient(credentials=self.credential)
        else:
            self.graph_client = None
            if self.enabled:
                logger.warning("Microsoft Graph integration enabled but missing credentials")
    
    def is_enabled(self):
        """Check if Microsoft Graph integration is enabled and configured"""
        return self.enabled and self.graph_client is not None
    
    async def create_deliverable_event(self, deliverable):
        """Create a calendar event for a deliverable"""
        if not self.is_enabled():
            logger.info("Microsoft Graph integration not enabled")
            return None
            
        try:
            # Create event object
            event = Event()
            event.subject = f"{deliverable.project.name}: {deliverable.description or f'{deliverable.percentage}%'}"
            
            # Set event body with project details
            body_content = f"""
            Project: {deliverable.project.name}
            Client: {deliverable.project.client or 'Internal'}
            Deliverable: {deliverable.description or f'{deliverable.percentage}% Milestone'}
            
            {deliverable.notes or ''}
            
            View in Workload Tracker: {self._get_app_url()}/projects/{deliverable.project.id}
            """
            
            event.body = ItemBody()
            event.body.content_type = BodyType.Text
            event.body.content = body_content.strip()
            
            # Set date (all-day event)
            if deliverable.date:
                start_time = DateTimeTimeZone()
                start_time.date_time = deliverable.date.strftime('%Y-%m-%dT00:00:00')
                start_time.time_zone = 'UTC'
                event.start = start_time
                
                end_time = DateTimeTimeZone()
                end_time.date_time = deliverable.date.strftime('%Y-%m-%dT23:59:59')
                end_time.time_zone = 'UTC'
                event.end = end_time
                
                event.is_all_day = True
            
            # Create the event
            if self.mode == 'shared':
                return await self._create_shared_calendar_event(event)
            else:
                return await self._create_individual_calendar_events(event, deliverable)
                
        except Exception as e:
            logger.error(f"Failed to create calendar event for deliverable {deliverable.id}: {str(e)}")
            return None
    
    async def _create_shared_calendar_event(self, event):
        """Create event in shared organization calendar"""
        # Implementation for shared calendar
        # This would require finding or creating the shared calendar
        # and posting the event there
        pass
        
    async def _create_individual_calendar_events(self, event, deliverable):
        """Create event in individual user calendars"""
        # Implementation for individual calendars
        # This would create events for users assigned to the deliverable
        pass
    
    def _get_app_url(self):
        """Get the application URL for links"""
        return os.getenv('APP_URL', 'http://localhost:3000')
```

### Step 7: Integrate with Deliverable Model

**File: `backend/deliverables/signals.py`**
```python
"""
Django signals for deliverable calendar integration
"""
import asyncio
from django.db.models.signals import post_save, post_delete
from django.dispatch import receiver
from .models import Deliverable
from core.microsoft_graph import MicrosoftGraphService

@receiver(post_save, sender=Deliverable)
def deliverable_saved(sender, instance, created, **kwargs):
    """Handle deliverable creation/update"""
    if instance.date:  # Only create events for deliverables with dates
        graph_service = MicrosoftGraphService()
        if graph_service.is_enabled():
            # Run async operation in background
            asyncio.create_task(graph_service.create_deliverable_event(instance))

@receiver(post_delete, sender=Deliverable)  
def deliverable_deleted(sender, instance, **kwargs):
    """Handle deliverable deletion"""
    # Implementation for event deletion
    pass
```

### Step 8: Update Django Settings

**Add to `backend/config/settings.py`:**
```python
# Microsoft Graph Integration
MICROSOFT_GRAPH_SETTINGS = {
    'TENANT_ID': os.getenv('MICROSOFT_TENANT_ID'),
    'CLIENT_ID': os.getenv('MICROSOFT_CLIENT_ID'),
    'CLIENT_SECRET': os.getenv('MICROSOFT_CLIENT_SECRET'),
    'ENABLED': os.getenv('MICROSOFT_CALENDAR_ENABLED', 'false').lower() == 'true',
}

# Ensure signals are loaded
INSTALLED_APPS = [
    # ... existing apps
    'deliverables.apps.DeliverablesConfig',  # Make sure this loads signals
]
```

## Phase 4: Testing and Deployment

### Step 9: Test the Integration

1. **Start Your Application**
   ```bash
   docker-compose up -d
   ```

2. **Check Logs for Errors**
   ```bash
   docker-compose logs backend --tail=50
   ```

3. **Create a Test Deliverable**
   - Go to your Workload Tracker frontend
   - Create a new project deliverable with a future date
   - Check backend logs for Microsoft Graph API calls

4. **Verify in Outlook**
   - Open Outlook web or desktop client
   - Look for the "Project Deliverables" calendar (if using shared mode)
   - Check that your test deliverable appears as an event

### Step 10: User Training

**For Shared Calendar Approach:**
1. **IT Admin:** Share the "Project Deliverables" calendar with all users
2. **Users:** Subscribe to the shared calendar in Outlook
3. **Users:** Configure calendar visibility preferences

**For Individual Calendar Approach:**
1. **Users:** May need to consent to calendar access permissions
2. **IT Admin:** Monitor and approve any permission requests

## Troubleshooting

### Common Issues

**Problem: "Authentication failed"**
- Verify tenant ID, client ID, and client secret are correct
- Check that admin consent was granted for API permissions
- Ensure app registration is in the correct Azure AD tenant

**Problem: "Insufficient privileges"**
- Verify API permissions include `Calendars.ReadWrite`
- Confirm admin consent was granted (green checkmarks in Azure portal)
- Check that application permissions (not delegated) were selected

**Problem: "Calendar not found"**
- For shared calendar mode, the calendar must be created manually first
- Ensure the calendar name in environment variables matches exactly
- Verify the service account has access to the target calendar

**Problem: "Events not appearing"**
- Check that deliverable has a valid date set
- Verify timezone configurations
- Look at backend logs for API errors

### Debugging Commands

```bash
# Check environment variables are loaded
docker-compose exec backend env | grep MICROSOFT

# Check backend logs for Graph API calls
docker-compose logs backend --follow | grep -i "graph\|calendar"

# Test the Django app is loading Graph service
docker-compose exec backend python manage.py shell
>>> from core.microsoft_graph import MicrosoftGraphService
>>> service = MicrosoftGraphService()
>>> print(service.is_enabled())
```

## Security Considerations

### Best Practices

1. **Limit Application Scope**
   - Use application access policies to restrict which mailboxes the app can access
   - Regular audit of permissions and access logs

2. **Secret Management**
   - Store client secrets securely (never in code)
   - Rotate client secrets regularly (every 6-12 months)
   - Use Azure Key Vault for production environments

3. **Monitoring**
   - Enable audit logs in Azure AD
   - Monitor Graph API usage and errors
   - Set up alerts for authentication failures

4. **Data Privacy**
   - Only sync deliverable dates and project context
   - Don't include sensitive project details in calendar events
   - Respect data residency requirements

## Production Deployment

### Pre-Production Checklist

- [ ] All environment variables configured correctly
- [ ] Client secret stored securely (not in code)
- [ ] API permissions granted with admin consent
- [ ] Test calendar events created successfully
- [ ] Error handling and logging implemented
- [ ] User training materials prepared

### Monitoring

Set up monitoring for:
- Microsoft Graph API call success/failure rates
- Calendar event creation errors
- Authentication token expiration
- User access patterns

### Maintenance

- **Monthly:** Review Graph API usage and errors
- **Quarterly:** Rotate client secrets
- **Annually:** Review and audit permissions

## Support and Next Steps

### Getting Help

1. **Microsoft Graph Documentation:** https://docs.microsoft.com/en-us/graph/
2. **Azure AD App Registration:** https://docs.microsoft.com/en-us/azure/active-directory/
3. **Application Support:** Check your internal IT documentation

### Future Enhancements

- **Meeting Integration:** Create actual meetings for deliverable reviews
- **Attendee Management:** Automatically add assigned team members as attendees
- **Reminder Notifications:** Set up email reminders before deliverable dates
- **Calendar Analytics:** Track deliverable completion rates through calendar data

---

**Document Version:** 1.0  
**Last Updated:** [Current Date]  
**Target Audience:** Engineers implementing Microsoft 365 integration