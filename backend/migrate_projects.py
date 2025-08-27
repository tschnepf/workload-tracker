#!/usr/bin/env python
"""
Migration script for Chunk 5: Convert project_name strings to Project objects.

This script:
1. Finds all assignments with project_name but no project FK
2. Creates Project objects from unique project_name values
3. Links assignments to the new Project objects
4. Preserves project_name as backup during migration

Run with: docker-compose exec backend python migrate_projects.py
"""

import os
import django

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from django.db import transaction
from assignments.models import Assignment
from projects.models import Project

def migrate_string_projects():
    """Convert project_name strings to Project objects"""
    
    print("🔄 Starting project migration...")
    
    # Find assignments that need migration
    assignments_to_migrate = Assignment.objects.filter(
        project__isnull=True,  # No project FK yet
        project_name__isnull=False,  # Has project_name
        project_name__gt='',  # Non-empty project_name
        is_active=True
    )
    
    print(f"📊 Found {assignments_to_migrate.count()} assignments to migrate")
    
    if not assignments_to_migrate.exists():
        print("✅ No assignments need migration")
        return
    
    # Get unique project names
    unique_project_names = set(assignments_to_migrate.values_list('project_name', flat=True))
    print(f"🏗️  Creating {len(unique_project_names)} project objects...")
    
    # Track migration stats
    created_projects = []
    migrated_assignments = 0
    
    try:
        with transaction.atomic():
            # Create Project objects for unique names
            for project_name in unique_project_names:
                project, created = Project.objects.get_or_create(
                    name=project_name,
                    defaults={
                        'status': 'active',
                        'client': 'Internal',  # Default for migrated projects
                        'description': f'Migrated from assignment: {project_name}',
                    }
                )
                
                if created:
                    created_projects.append(project)
                    print(f"   ➕ Created project: '{project.name}'")
                else:
                    print(f"   ♻️  Found existing project: '{project.name}'")
            
            # Link assignments to projects
            for assignment in assignments_to_migrate:
                project = Project.objects.get(name=assignment.project_name)
                assignment.project = project
                assignment.save()
                migrated_assignments += 1
                print(f"   🔗 Linked assignment {assignment.id} ({assignment.person.name}) to '{project.name}'")
            
            print("✅ Migration completed successfully!")
            print(f"📈 Summary:")
            print(f"   - Created {len(created_projects)} new projects")
            print(f"   - Migrated {migrated_assignments} assignments")
            print(f"   - All assignments now have project FK links")
            
    except Exception as e:
        print(f"❌ Migration failed: {e}")
        raise

def verify_migration():
    """Verify the migration was successful"""
    print("\n🔍 Verifying migration...")
    
    # Check for assignments without project FK
    orphaned_assignments = Assignment.objects.filter(
        is_active=True,
        project__isnull=True,
        project_name__isnull=False,
        project_name__gt=''
    )
    
    if orphaned_assignments.exists():
        print(f"⚠️  Found {orphaned_assignments.count()} assignments still without project FK")
        for assignment in orphaned_assignments:
            print(f"   - Assignment {assignment.id}: '{assignment.project_name}'")
        return False
    
    # Check assignment count
    total_assignments = Assignment.objects.filter(is_active=True).count()
    assignments_with_project = Assignment.objects.filter(is_active=True, project__isnull=False).count()
    assignments_with_name = Assignment.objects.filter(
        is_active=True, 
        project_name__isnull=False,
        project_name__gt=''
    ).count()
    
    print(f"📊 Migration verification:")
    print(f"   - Total active assignments: {total_assignments}")
    print(f"   - Assignments with project FK: {assignments_with_project}")
    print(f"   - Assignments with project_name: {assignments_with_name}")
    
    if assignments_with_name > 0 and assignments_with_project >= assignments_with_name:
        print("✅ Migration verification passed!")
        return True
    else:
        print("⚠️  Migration verification failed - some assignments may be missing project links")
        return False

def main():
    """Main migration function"""
    print("🚀 Project Migration Script - Chunk 5")
    print("=" * 50)
    
    # Run migration
    migrate_string_projects()
    
    # Verify results
    verification_passed = verify_migration()
    
    if verification_passed:
        print("\n🎉 Project migration completed successfully!")
        print("   All assignments now use structured Project objects.")
        print("   Original project_name fields preserved as backup.")
    else:
        print("\n❌ Migration completed with issues - manual review required")

if __name__ == "__main__":
    main()