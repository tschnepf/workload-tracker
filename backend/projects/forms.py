"""
Projects import form validation.
Handles file upload and validation for Projects Excel/CSV import.
"""

from django import forms
from django.core.exceptions import ValidationError
import os


class ProjectsImportForm(forms.Form):
    """Form for importing projects from Excel or CSV files."""
    
    file = forms.FileField(
        label="Import File",
        help_text="Upload Excel (.xlsx) or CSV file with projects data. Download template for proper format.",
        widget=forms.ClearableFileInput(attrs={
            'accept': '.xlsx,.xls,.csv',
            'class': 'form-control'
        })
    )
    
    update_existing = forms.BooleanField(
        label="Update Existing Projects",
        help_text="Update existing projects if they match by project number or name. Uncheck to only create new projects.",
        required=False,
        initial=True,
        widget=forms.CheckboxInput(attrs={'class': 'form-check-input'})
    )
    
    include_assignments = forms.BooleanField(
        label="Import Assignments",
        help_text="Process assignments from Assignments sheet (Excel only). Links people to projects.",
        required=False,
        initial=True,
        widget=forms.CheckboxInput(attrs={'class': 'form-check-input'})
    )
    
    include_deliverables = forms.BooleanField(
        label="Import Deliverables",
        help_text="Process deliverables from Deliverables sheet (Excel only). Creates project milestones.",
        required=False,
        initial=True,
        widget=forms.CheckboxInput(attrs={'class': 'form-check-input'})
    )
    
    dry_run = forms.BooleanField(
        label="Dry Run (Preview Only)",
        help_text="Preview import results without making changes. Recommended for first-time imports.",
        required=False,
        initial=True,
        widget=forms.CheckboxInput(attrs={'class': 'form-check-input'})
    )
    
    def clean_file(self):
        """Validate uploaded file."""
        file = self.cleaned_data.get('file')
        
        if not file:
            raise ValidationError("Please select a file to import.")
        
        # Check file extension
        file_name = file.name.lower()
        valid_extensions = ['.xlsx', '.xls', '.csv']
        
        if not any(file_name.endswith(ext) for ext in valid_extensions):
            raise ValidationError(
                f"Invalid file type. Please upload Excel (.xlsx, .xls) or CSV (.csv) files only. "
                f"Received: {os.path.splitext(file_name)[1]}"
            )
        
        # Check file size (10MB limit)
        max_size = 10 * 1024 * 1024  # 10MB
        if file.size > max_size:
            raise ValidationError(
                f"File too large. Maximum size is 10MB. "
                f"Your file is {file.size / (1024 * 1024):.1f}MB."
            )
        
        return file
    
    def clean(self):
        """Cross-field validation."""
        cleaned_data = super().clean()
        file = cleaned_data.get('file')
        include_assignments = cleaned_data.get('include_assignments')
        include_deliverables = cleaned_data.get('include_deliverables')
        
        if file and file.name.lower().endswith('.csv'):
            # CSV files don't support multi-sheet features
            if include_assignments:
                cleaned_data['include_assignments'] = False
                self.add_error('include_assignments', 
                    'Assignments import not available for CSV files. Use Excel format for multi-sheet import.')
            
            if include_deliverables:
                cleaned_data['include_deliverables'] = False
                self.add_error('include_deliverables', 
                    'Deliverables import not available for CSV files. Use Excel format for multi-sheet import.')
        
        return cleaned_data