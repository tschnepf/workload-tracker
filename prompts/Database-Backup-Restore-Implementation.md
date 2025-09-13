# Database Backup and Restore Implementation Plan

## Overview
This document provides step-by-step prompts for implementing comprehensive database backup and restore functionality in the Workload Tracker application. Each step is designed to be fed to an AI agent as an individual task to ensure manageable implementation and avoid breaking changes.

## Implementation Phases

### Phase 1: Backend Infrastructure Setup

#### Step 1.1: Create Database Backup Service
**Prompt for AI Agent:**
```
Create a new Django management command in backend/core/management/commands/backup_database.py that:
- Uses pg_dump to create a complete PostgreSQL backup
- Accepts optional filename parameter (defaults to timestamp-based name)
- Stores backups in backend/backups/ directory (create if not exists)
- Includes all data, schema, and constraints
- Returns the full path of created backup file
- Handles errors gracefully with proper logging
- Uses Django's database settings to get connection parameters
- Compresses output using gzip for space efficiency
```

#### Step 1.2: Create Database Restore Service  
**Prompt for AI Agent:**
```
Create a new Django management command in backend/core/management/commands/restore_database.py that:
- Uses pg_restore or psql to restore from backup file
- Accepts backup file path as required parameter
- Validates backup file exists and is readable
- Drops existing database content before restore (with confirmation)
- Recreates all tables, data, and constraints
- Handles errors gracefully with detailed logging
- Uses Django's database settings for target database
- Supports both .sql and .gz backup formats
```

#### Step 1.3: Create Backup Management Service
**Prompt for AI Agent:**
```
Create backend/core/services/backup_service.py with a BackupService class that:
- Lists available backup files in backend/backups/ directory
- Provides file metadata (size, creation date, description)
- Validates backup file integrity
- Handles backup file deletion with safety checks
- Provides methods for both creating and restoring backups
- Integrates with Django management commands
- Returns structured data suitable for API responses
- Includes proper error handling and logging
```

### Phase 2: API Endpoints

#### Step 2.1: Create Backup API Views
**Prompt for AI Agent:**
```
Create backup API endpoints in backend/core/views/backup_views.py:
- POST /api/backups/ - Creates new backup with optional description
- GET /api/backups/ - Lists all available backups with metadata
- DELETE /api/backups/{id}/ - Deletes specific backup file
- Include proper authentication/permission checks (admin only)
- Return structured JSON responses with backup metadata
- Handle file operations asynchronously where possible
- Include proper error responses for common scenarios
- Add request logging for audit trail
```

#### Step 2.2: Create Restore API Views
**Prompt for AI Agent:**
```
Create restore API endpoints in backend/core/views/backup_views.py:
- POST /api/backups/{id}/restore/ - Restores from specific backup
- POST /api/backups/upload-restore/ - Accepts uploaded backup file for restore
- Include confirmation parameter to prevent accidental restores
- Validate backup files before attempting restore
- Return progress/status information during restore process
- Handle large file uploads efficiently
- Include proper error handling for corrupted backups
- Add comprehensive logging for restore operations
```

#### Step 2.3: Add Backup URLs to Django Configuration
**Prompt for AI Agent:**
```
Update backend/config/urls.py to include backup endpoints:
- Add backup URL patterns to main urlpatterns
- Ensure proper URL namespacing for backup operations
- Include appropriate URL names for reverse lookup
- Maintain existing URL structure and patterns
- Test that all URLs resolve correctly
```

### Phase 3: Frontend Infrastructure

#### Step 3.1: Create Backup API Service
**Prompt for AI Agent:**
```
Create frontend/src/services/backupApi.ts with methods for:
- createBackup(description?: string) - Creates new database backup
- getBackups() - Fetches list of available backups
- deleteBackup(backupId: string) - Deletes specific backup
- restoreBackup(backupId: string, confirm: boolean) - Restores from backup
- uploadAndRestore(file: File, confirm: boolean) - Uploads and restores backup
- Include proper TypeScript interfaces for all request/response types
- Use existing API client patterns and error handling
- Add progress tracking for long-running operations
```

#### Step 3.2: Create Backup TypeScript Interfaces
**Prompt for AI Agent:**
```
Create frontend/src/types/backup.ts with TypeScript interfaces:
- Backup interface with id, filename, size, createdAt, description fields
- BackupCreateRequest interface for backup creation
- BackupRestoreRequest interface for restore operations  
- BackupListResponse interface for API responses
- Upload-related interfaces for file handling
- Follow existing type patterns in the codebase
- Export all interfaces for use across components
```

### Phase 4: UI Components

#### Step 4.1: Create Backup Management Component
**Prompt for AI Agent:**
```
Create frontend/src/components/settings/BackupManagement.tsx that:
- Displays list of available backups in a table format
- Shows backup metadata (date, size, description)
- Includes "Create Backup" button with optional description input
- Provides download links for backup files
- Includes delete buttons with confirmation dialogs
- Uses existing Card, Button, and Table components
- Follows VSCode dark theme color patterns (#2d2d30, #cccccc, etc.)
- Handles loading states and error messages appropriately
```

#### Step 4.2: Create Restore Functionality Component  
**Prompt for AI Agent:**
```
Create frontend/src/components/settings/RestoreManagement.tsx that:
- Provides restore buttons for each backup in the list
- Includes file upload area for external backup files
- Shows prominent warning about data loss during restore
- Requires explicit confirmation checkbox before restore
- Displays progress indicator during restore operations
- Shows success/error messages after restore completion
- Uses existing modal/dialog patterns for confirmations
- Follows VSCode dark theme styling consistently
```

#### Step 4.3: Create Confirmation Dialog Component
**Prompt for AI Agent:**
```
Create frontend/src/components/ui/ConfirmationDialog.tsx that:
- Accepts title, message, and confirmation text as props
- Shows clear warning about destructive operations
- Requires typing specific confirmation text to enable action
- Includes cancel and confirm buttons with appropriate styling
- Uses existing modal/dialog patterns from the codebase
- Follows VSCode dark theme color scheme
- Returns promise that resolves when user confirms or cancels
- Can be reused for other destructive operations
```

### Phase 5: Settings Integration

#### Step 5.1: Integrate Backup Components into Settings Page
**Prompt for AI Agent:**
```
Update frontend/src/pages/Settings/Settings.tsx to include backup functionality:
- Add new "Backup & Restore" section to existing settings tabs/sections
- Import and render BackupManagement and RestoreManagement components
- Maintain existing settings page layout and styling
- Add appropriate section headers and descriptions
- Ensure components are properly spaced and organized
- Keep existing settings sections unchanged
- Test that navigation and layout remain functional
```

#### Step 5.2: Add Backup Section Navigation
**Prompt for AI Agent:**
```
Update settings navigation in frontend/src/pages/Settings/ to include:
- "Backup & Restore" option in settings menu/tabs
- Appropriate icon for backup section (database or save icon)
- Maintain existing navigation patterns and styling
- Ensure proper active state highlighting
- Keep existing navigation structure intact
- Test that all navigation links work correctly
```

### Phase 6: Security and Validation

#### Step 6.1: Add Backend Security Measures
**Prompt for AI Agent:**
```
Enhance backup/restore endpoints with security measures:
- Restrict backup/restore operations to admin users only
- Add rate limiting to prevent abuse of backup creation
- Validate uploaded backup files for security threats
- Sanitize backup filenames to prevent directory traversal
- Add audit logging for all backup/restore operations
- Include CSRF protection for all endpoints
- Validate file sizes to prevent disk space issues
- Add timeout protection for long-running operations
```

#### Step 6.2: Add Frontend Validation and Safety
**Prompt for AI Agent:**  
```
Add client-side validation and safety measures:
- Validate backup file types and sizes before upload
- Show clear warnings about restore operation consequences
- Add progress indicators with cancel options
- Implement client-side timeout handling
- Show confirmation dialogs for all destructive operations
- Add form validation for backup descriptions
- Include proper error boundary handling
- Test all user interaction scenarios thoroughly
```

### Phase 7: Testing and Documentation

#### Step 7.1: Create Backend Tests
**Prompt for AI Agent:**
```
Create comprehensive tests in backend/core/tests/test_backup.py:
- Test backup creation with various scenarios
- Test backup restoration functionality  
- Test error handling for corrupted files
- Test permission restrictions work correctly
- Test file cleanup and validation
- Use Django's test database for safety
- Mock file system operations where appropriate
- Include edge cases and error conditions
```

#### Step 7.2: Create Frontend Tests
**Prompt for AI Agent:**
```
Create frontend tests for backup components:
- Test backup list display and interactions
- Test restore confirmation flows
- Test file upload functionality
- Test error handling and user feedback
- Test responsive design and accessibility
- Use existing testing patterns from the codebase
- Include user interaction testing with appropriate libraries
- Test integration with settings page
```

### Phase 8: Documentation and Deployment

#### Step 8.1: Update Docker Configuration
**Prompt for AI Agent:**
```
Update docker-compose.yml to support backup functionality:
- Add volume mount for backup storage directory
- Ensure backend container can execute pg_dump/pg_restore
- Add necessary PostgreSQL client tools to backend container
- Update environment variables if needed
- Test that backup/restore works in Docker environment
- Document any new volumes or configuration requirements
```

#### Step 8.2: Create User Documentation
**Prompt for AI Agent:**
```
Update CLAUDE.md with backup/restore usage instructions:
- Document new backup management commands
- Explain backup file locations and formats
- Provide restore procedure and safety warnings
- Include troubleshooting common issues
- Add backup best practices recommendations
- Document new settings page functionality
- Include Docker-specific backup considerations
```

## Implementation Notes

### Key Principles:
1. **Safety First**: All restore operations must require explicit confirmation
2. **Data Integrity**: Validate backup files before restoration attempts  
3. **User Experience**: Provide clear feedback during long-running operations
4. **Security**: Restrict access to admin users only
5. **Maintainability**: Follow existing code patterns and architecture
6. **Docker Compatibility**: Ensure functionality works within containerized environment

### Error Handling Strategy:
- Graceful degradation for file system errors
- Clear user messages for common failure scenarios
- Comprehensive logging for debugging
- Rollback capabilities where possible

### Performance Considerations:
- Async operations for large backup/restore processes
- Progress tracking for user feedback
- File size limits to prevent system overload
- Cleanup of temporary files

This implementation plan ensures a robust, secure, and user-friendly backup and restore system while maintaining code quality and following Django/React best practices.