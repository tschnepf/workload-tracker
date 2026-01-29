"""
CSV handler for Projects import/export functionality.
Simplified export option focusing on main project data.
"""

import csv
import json
from django.http import HttpResponse
from datetime import datetime
from ..serializers import ProjectSerializer
from django.db.models import Prefetch
from assignments.models import Assignment


def export_projects_to_csv(queryset, filename=None):
    """Export projects queryset to CSV format (simplified)."""
    if not filename:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"projects_export_{timestamp}.csv"
    
    response = HttpResponse(content_type='text/csv')
    response['Content-Disposition'] = f'attachment; filename="{filename}"'
    
    writer = csv.writer(response)
    
    # CSV headers (camelCase to match API) - Main project data only
    headers = [
        'name', 'projectNumber', 'status', 'client', 'description',
        'startDate', 'endDate', 'estimatedHours', 'isActive',
        'assignedPeople', 'totalAssignments', 'deliverableCount'
    ]
    
    writer.writerow(headers)
    
    # Optimize relationships: prefetch assignments and deliverables once
    optimized_qs = queryset.prefetch_related(
        Prefetch('assignments', queryset=Assignment.objects.select_related('person', 'role_on_project_ref').only('person_id', 'notes', 'is_active', 'weekly_hours', 'role_on_project', 'role_on_project_ref_id')),
        'deliverables',
    )

    # Serialize data using ProjectSerializer
    serializer = ProjectSerializer(optimized_qs, many=True)
    serialized_data = serializer.data

    # Build a map of id -> project instance to avoid per-row .get() queries
    projects_by_id = {p.id: p for p in optimized_qs}

    # Write data rows with additional computed fields
    for project_data in serialized_data:
        # Get the actual project object for relationships without extra queries
        project = projects_by_id.get(project_data['id'])
        if project is None:
            continue
        
        # Compute additional fields
        assignments = project.assignments.all() if hasattr(project, 'assignments') else []
        assigned_people = ', '.join([
            (
                assignment.person.name
                if getattr(assignment, 'person', None)
                else (
                    assignment.role_on_project_ref.name
                    if getattr(assignment, 'role_on_project_ref', None) else (assignment.role_on_project or 'Unassigned')
                )
            )
            for assignment in assignments
        ])
        total_assignments = len(assignments)
        deliverable_count = project.deliverables.count() if hasattr(project, 'deliverables') else 0
        
        row = []
        for header in headers:
            if header == 'projectNumber':
                value = project_data.get('project_number', '')
            elif header == 'startDate':
                value = project_data.get('start_date', '')
            elif header == 'endDate':
                value = project_data.get('end_date', '')
            elif header == 'estimatedHours':
                value = project_data.get('estimated_hours', '')
            elif header == 'isActive':
                value = project_data.get('is_active', True)
            elif header == 'assignedPeople':
                value = assigned_people
            elif header == 'totalAssignments':
                value = total_assignments
            elif header == 'deliverableCount':
                value = deliverable_count
            else:
                value = project_data.get(header, '')
            
            # Handle None values
            if value is None:
                value = ''
            row.append(str(value))
        
        writer.writerow(row)
    
    return response


def export_projects_with_assignments_to_csv(queryset, filename=None):
    """Export projects with detailed assignments to CSV (flattened format)."""
    if not filename:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"projects_assignments_export_{timestamp}.csv"
    
    response = HttpResponse(content_type='text/csv')
    response['Content-Disposition'] = f'attachment; filename="{filename}"'
    
    writer = csv.writer(response)
    
    # CSV headers - Project + Assignment data flattened
    headers = [
        'projectName', 'projectNumber', 'projectStatus', 'client',
        'personName', 'personEmail', 'roleOnProject', 'weeklyHoursJson',
        'totalHours', 'assignmentNotes', 'assignmentActive'
    ]
    
    writer.writerow(headers)
    
    # Write flattened project-assignment data
    for project in queryset:
        assignments = project.assignments.all() if hasattr(project, 'assignments') else []
        
        if assignments:
            # Write one row per assignment
            for assignment in assignments:
                weekly_hours_json = json.dumps(assignment.weekly_hours) if assignment.weekly_hours else ""
                total_hours = assignment.total_hours if hasattr(assignment, 'total_hours') else 0
                
                person_name = assignment.person.name if getattr(assignment, 'person', None) else ''
                person_email = assignment.person.email if getattr(assignment, 'person', None) else ''
                role_label = assignment.role_on_project_ref.name if getattr(assignment, 'role_on_project_ref', None) else (assignment.role_on_project or '')
                row = [
                    project.name,                                   # projectName
                    project.project_number or '',                  # projectNumber
                    project.status,                                # projectStatus
                    project.client,                                # client
                    person_name,                                   # personName
                    person_email or '',                            # personEmail
                    role_label,                                    # roleOnProject
                    weekly_hours_json,                             # weeklyHoursJson
                    total_hours,                                   # totalHours
                    assignment.notes or '',                        # assignmentNotes
                    assignment.is_active                           # assignmentActive
                ]
                
                writer.writerow([str(value) for value in row])
        else:
            # Write project row even if no assignments
            row = [
                project.name,                                      # projectName
                project.project_number or '',                     # projectNumber
                project.status,                                   # projectStatus
                project.client,                                   # client
                '',                                               # personName
                '',                                               # personEmail
                '',                                               # roleOnProject
                '',                                               # weeklyHoursJson
                0,                                                # totalHours
                '',                                               # assignmentNotes
                ''                                                # assignmentActive
            ]
            
            writer.writerow([str(value) for value in row])
    
    return response


def export_projects_with_deliverables_to_csv(queryset, filename=None):
    """Export projects with detailed deliverables to CSV (flattened format)."""
    if not filename:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"projects_deliverables_export_{timestamp}.csv"
    
    response = HttpResponse(content_type='text/csv')
    response['Content-Disposition'] = f'attachment; filename="{filename}"'
    
    writer = csv.writer(response)
    
    # CSV headers - Project + Deliverable data flattened
    headers = [
        'projectName', 'projectNumber', 'projectStatus', 'client',
        'deliverableDescription', 'percentage', 'targetDate', 'sortOrder',
        'isCompleted', 'completedDate', 'deliverableNotes'
    ]
    
    writer.writerow(headers)
    
    # Write flattened project-deliverable data
    for project in queryset:
        deliverables = project.deliverables.all()
        
        if deliverables:
            # Write one row per deliverable
            for deliverable in deliverables:
                row = [
                    project.name,                                  # projectName
                    project.project_number or '',                 # projectNumber
                    project.status,                               # projectStatus
                    project.client,                               # client
                    deliverable.description or '',                # deliverableDescription
                    deliverable.percentage or '',                 # percentage
                    deliverable.date or '',                       # targetDate
                    deliverable.sort_order,                       # sortOrder
                    deliverable.is_completed,                     # isCompleted
                    deliverable.completed_date or '',             # completedDate
                    deliverable.notes or ''                       # deliverableNotes
                ]
                
                writer.writerow([str(value) for value in row])
        else:
            # Write project row even if no deliverables
            row = [
                project.name,                                     # projectName
                project.project_number or '',                    # projectNumber
                project.status,                                  # projectStatus
                project.client,                                  # client
                '',                                              # deliverableDescription
                '',                                              # percentage
                '',                                              # targetDate
                '',                                              # sortOrder
                '',                                              # isCompleted
                '',                                              # completedDate
                ''                                               # deliverableNotes
            ]
            
            writer.writerow([str(value) for value in row])
    
    return response
