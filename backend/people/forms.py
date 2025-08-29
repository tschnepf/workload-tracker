"""
Forms for People import functionality.
"""

from django import forms


class PeopleImportForm(forms.Form):
    """Form for uploading People import files."""
    
    file = forms.FileField(
        label='Import File',
        help_text='Upload Excel (.xlsx) or CSV file with people data',
        widget=forms.FileInput(attrs={
            'accept': '.xlsx,.xls,.csv',
            'class': 'form-control'
        })
    )
    
    update_existing = forms.BooleanField(
        label='Update existing people',
        help_text='Update existing people if email matches (otherwise skip)',
        required=False,
        initial=True,
        widget=forms.CheckboxInput(attrs={'class': 'form-check-input'})
    )
    
    dry_run = forms.BooleanField(
        label='Preview only (dry run)',
        help_text='Preview changes without saving to database',
        required=False,
        initial=False,
        widget=forms.CheckboxInput(attrs={'class': 'form-check-input'})
    )
    
    def clean_file(self):
        """Validate uploaded file."""
        file = self.cleaned_data.get('file')
        if not file:
            return file
            
        # Check file size (10MB limit)
        if file.size > 10 * 1024 * 1024:
            raise forms.ValidationError('File size must be less than 10MB')
            
        # Check file extension
        allowed_extensions = ['.xlsx', '.xls', '.csv']
        file_extension = None
        
        for ext in allowed_extensions:
            if file.name.lower().endswith(ext):
                file_extension = ext
                break
                
        if not file_extension:
            raise forms.ValidationError(
                'Invalid file format. Please upload Excel (.xlsx, .xls) or CSV (.csv) files only.'
            )
            
        return file