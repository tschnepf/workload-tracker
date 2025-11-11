# Excel Import/Export Implementation Plan

## 🎯 **Implementation Status: PHASES 1-3 COMPLETE**

✅ **Phase 1: Export Functionality** - COMPLETE  
✅ **Phase 2: Import Functionality** - COMPLETE  
✅ **Phase 3: Management Commands** - COMPLETE  
❌ **Phase 4: Frontend Integration** - DEFERRED (Future Feature)

**Current Functionality**: Full Excel/CSV import/export through Django Admin + Command Line

---

## Recommendation: Excel-First Import/Export with CSV Fallback

I recommend implementing Excel (.xlsx) import/export functionality for **both People and Projects** through the Django admin panel and custom management commands, with CSV as a fallback option.

### **Recommended Approach:**

1. **Admin Panel Integration** (Primary Interface)
   - Custom admin actions for export/import
   - File upload interface supporting .xlsx and .csv
   - Better for non-technical users
   - Built-in validation and error reporting

2. **Management Commands** (Secondary/Advanced)
   - Command-line interface for batch operations
   - Better for automated scripts/CI/CD
   - Useful for large datasets

### **Implementation Steps:**

## Phase 1: Export Functionality

### 1. Create Custom Admin Actions

#### People Admin Actions
```python
# backend/people/admin.py
def export_people_excel(modeladmin, request, queryset):
    # Export selected people to Excel with multiple sheets
    
def export_people_csv(modeladmin, request, queryset):
    # Export selected people to CSV (fallback option)
    
def export_all_people_excel(modeladmin, request, queryset):
    # Export all people regardless of selection
```

#### Projects Admin Actions
```python
# backend/projects/admin.py (or wherever projects are managed)
def export_projects_excel(modeladmin, request, queryset):
    # Export selected projects to Excel with multiple sheets
    
def export_projects_csv(modeladmin, request, queryset):
    # Export selected projects to CSV (fallback option)
    
def export_all_projects_excel(modeladmin, request, queryset):
    # Export all projects regardless of selection
```

### 2. Excel File Structure (Multi-Sheet)

#### People Export Structure
```
Sheet 1: "People" - Main person data
Sheet 2: "Skills" - Person-skill relationships
Sheet 3: "Template" - Empty template with examples
Sheet 4: "Instructions" - Import guidelines and field descriptions
```

#### Projects Export Structure
```
Sheet 1: "Projects" - Main project data
Sheet 2: "Deliverables" - Project deliverable details
Sheet 3: "Assignments" - Project-person assignments with weekly hours
Sheet 4: "Template" - Empty template with examples
Sheet 5: "Instructions" - Import guidelines and field descriptions
```

### 3. Excel Sheets Content

#### People Export Sheets

**People Sheet:**
```
name | role | email | phone | location | weeklyCapacity | departmentName | hireDate | notes | isActive
```

**Skills Sheet:**
```
personEmail | skillName | skillType | proficiencyLevel | notes | lastUsed
```

**People Template Sheet:**
- Empty rows with proper formatting
- Data validation dropdowns (roles, skill types, proficiency levels)
- Example data rows
- Color-coded required vs optional fields

**People Instructions Sheet:**
- Field descriptions and requirements
- Import process guidelines
- Common error solutions
- Contact information for support

#### Projects Export Sheets

**Projects Sheet:**
```
name | projectNumber | status | client | description | startDate | endDate | estimatedHours | isActive
```

**Deliverables Sheet:**
```
projectName | projectNumber | description | percentage | date | sortOrder | isCompleted | completedDate | notes
```

**Assignments Sheet:**
```
projectName | projectNumber | personName | personEmail | roleOnProject | startDate | endDate | weeklyHours | totalHours | notes | isActive
```

**Projects Template Sheet:**
- Empty rows with proper formatting
- Data validation dropdowns (status, deliverable types)
- Example data rows
- Color-coded required vs optional fields

**Projects Instructions Sheet:**
- Field descriptions and requirements
- Weekly hours JSON format explanation
- Import process guidelines
- Common error solutions

## Phase 2: Import Functionality

### 1. Admin Interface for Import

#### People Import
- Add custom admin view at `/admin/people/person/import/`
- File upload form accepting .xlsx and .csv files
- Auto-detect file format and process accordingly
- Download template button for Excel template
- Preview imported data before saving
- Validation and error reporting with Excel cell references

#### Projects Import
- Add custom admin view at `/admin/projects/project/import/`
- File upload form accepting .xlsx and .csv files
- Auto-detect file format and process accordingly
- Download template button for Excel template
- Preview imported data before saving
- Validation and error reporting with Excel cell references

### 2. Import Processing Logic

#### **People Excel Processing:**
- **People Sheet**: Process main person data
- **Skills Sheet**: Process person-skill relationships
- **Cross-Reference**: Match people and skills by email
- **Data Types**: Preserve Excel data types (dates, numbers, booleans)
- **Validation**: Use Excel cell references in error messages ("Error in cell B15")

#### **Projects Excel Processing:**
- **Projects Sheet**: Process main project data
- **Deliverables Sheet**: Process project deliverables
- **Assignments Sheet**: Process project-person assignments with weekly hours
- **Cross-Reference**: Match projects, people, and assignments by names/emails
- **Data Types**: Preserve Excel data types, parse JSON for weekly hours
- **Validation**: Use Excel cell references in error messages ("Error in Projects!C10")

#### **People Import Logic (Using PersonSerializer):**
```python
# ✅ CORRECT: Excel data flows through serializer
def import_people_row(excel_row_data):
    # excel_row_data has camelCase keys: weeklyCapacity, departmentName
    # PersonSerializer automatically transforms to snake_case for database
    
    # Update existing by email
    person = Person.objects.filter(email=excel_row_data.get('email')).first()
    if person:
        serializer = PersonSerializer(person, data=excel_row_data, partial=True)
    else:
        serializer = PersonSerializer(data=excel_row_data)
    
    if serializer.is_valid():
        return serializer.save()
    return serializer.errors
```

#### **Projects Import Logic (Using ProjectSerializer):**
```python
# ✅ CORRECT: Excel data flows through serializer  
def import_projects_row(excel_row_data):
    # excel_row_data has camelCase keys: projectNumber, startDate, isActive
    # ProjectSerializer automatically transforms to snake_case for database
    
    # Update existing by projectNumber
    project = Project.objects.filter(project_number=excel_row_data.get('projectNumber')).first()
    if project:
        serializer = ProjectSerializer(project, data=excel_row_data, partial=True)
    else:
        serializer = ProjectSerializer(data=excel_row_data)
    
    if serializer.is_valid():
        return serializer.save()
    return serializer.errors
```

### 3. Error Handling & Reporting
- Sheet-by-sheet validation
- Excel cell reference error messages ("Invalid role in People!C5")
- Clear error summary with corrections needed
- Rollback on critical errors
- Success/failure summary with statistics

## Phase 3: Management Commands

### 1. Export Commands

#### People Export Commands
```bash
# Excel exports (primary)
python manage.py export_people --format excel --output people_export.xlsx
python manage.py export_people --format excel --department "Engineering" --output eng_only.xlsx

# CSV exports (fallback)
python manage.py export_people --format csv --output people_export.csv
python manage.py export_people --format csv --department "Engineering" --output eng_only.csv
```

#### Projects Export Commands
```bash
# Excel exports (primary)
python manage.py export_projects --format excel --output projects_export.xlsx
python manage.py export_projects --format excel --status "Active" --output active_projects.xlsx
python manage.py export_projects --format excel --client "Acme Corp" --output acme_projects.xlsx

# CSV exports (fallback)
python manage.py export_projects --format csv --output projects_export.csv
python manage.py export_projects --format csv --status "Active" --output active_projects.csv
```

### 2. Import Commands

#### People Import Commands
```bash
# Auto-detect format
python manage.py import_people --file people_import.xlsx --dry-run
python manage.py import_people --file people_import.csv --dry-run

# Force format
python manage.py import_people --file people_import.xlsx --format excel --update-existing
python manage.py import_people --file people_import.csv --format csv --update-existing
```

#### Projects Import Commands
```bash
# Auto-detect format
python manage.py import_projects --file projects_import.xlsx --dry-run
python manage.py import_projects --file projects_import.csv --dry-run

# Force format
python manage.py import_projects --file projects_import.xlsx --format excel --update-existing
python manage.py import_projects --file projects_import.csv --format csv --update-existing

# Import options
python manage.py import_projects --file projects.xlsx --include-assignments --include-deliverables
python manage.py import_projects --file projects.xlsx --projects-only  # Skip assignments and deliverables
```

## ~~Phase 4: Frontend Integration~~ (FUTURE FEATURE - NOT IMPLEMENTED)

> **Note**: Frontend integration is marked as a future enhancement and is not currently needed. The Django Admin interface and Management Commands provide sufficient functionality for current requirements.

### Future React UI Features (When Needed):
- Export dropdown: "Export as Excel" / "Export as CSV" 
- Import modal with drag-and-drop file upload
- File format auto-detection
- Progress indicators for large operations
- Download template button
- Option toggles: Include assignments, Include deliverables

**Current Status**: ❌ **Deferred** - Admin interface and command line tools meet current needs

## Technical Implementation Details

### **Files to Create/Modify:**

#### People Import/Export Files
1. **`backend/people/admin.py`** - Add custom actions and import view
2. **`backend/people/management/commands/export_people.py`** - Export command
3. **`backend/people/management/commands/import_people.py`** - Import command  
4. **`backend/people/utils/excel_handler.py`** - Excel processing logic
5. **`backend/people/utils/csv_handler.py`** - CSV processing logic (fallback)
6. **`backend/people/templates/admin/import_people.html`** - Import interface
7. **`backend/people/forms.py`** - Import form validation

#### Projects Import/Export Files
8. **`backend/projects/admin.py`** - Add custom actions and import view
9. **`backend/projects/management/commands/export_projects.py`** - Export command
10. **`backend/projects/management/commands/import_projects.py`** - Import command  
11. **`backend/projects/utils/excel_handler.py`** - Excel processing logic
12. **`backend/projects/utils/csv_handler.py`** - CSV processing logic (fallback)
13. **`backend/projects/templates/admin/import_projects.html`** - Import interface
14. **`backend/projects/forms.py`** - Import form validation

#### Shared Files
15. **`backend/core/utils/import_validator.py`** - Shared validation logic
16. **`backend/core/utils/excel_base.py`** - Base Excel processing utilities
17. **`requirements.txt`** - Add `openpyxl` dependency

### **Key Considerations:**

1. **Data Integrity & Standards Compliance**
   - Validate all foreign key relationships
   - Handle duplicate detection intelligently (email-based)
   - Maintain data consistency during bulk operations
   - Excel data type preservation
   - **CRITICAL**: All backend processing MUST use `snake_case`
   - **CRITICAL**: All Excel headers MUST use `camelCase` for user consistency
   - **CRITICAL**: Transform `camelCase` → `snake_case` during import
   - **CRITICAL**: Transform `snake_case` → `camelCase` during export

2. **Performance**
   - Use bulk operations for large datasets
   - Memory-efficient Excel processing with streaming
   - Progress indicators for long-running imports
   - Chunked processing for large files

3. **User Experience**
   - Excel template with data validation dropdowns
   - Color-coded required vs optional fields
   - Detailed error messages with Excel cell references
   - Clear field mappings and requirements
   - Instructions sheet within Excel file

4. **Security**
   - File size limits (Excel files can be larger)
   - Validate Excel content before processing
   - Scan for malicious macros (disable macro execution)
   - Admin-only access to import functionality

### **Excel Template Features:**

1. **Data Validation:**
   - Role dropdown: Engineering, Design, Product Manager, etc.
   - Department dropdown: Populated from existing departments
   - Skill type dropdown: strength, development, learning
   - Proficiency dropdown: beginner, intermediate, advanced, expert
   - Date formatting for hireDate
   - Number validation for weeklyCapacity

2. **Formatting:**
   - Required fields: Red headers
   - Optional fields: Blue headers
   - Example data in Template sheet
   - Frozen header rows
   - Auto-fit column widths

3. **Instructions:**
   - Field descriptions
   - Data format requirements
   - Common error solutions
   - Import process step-by-step

### **Excel File Example Structure:**

#### People Export Examples

**People Sheet:**
```
name             | role            | email              | phone      | location    | weeklyCapacity | departmentName | hireDate   | notes      | isActive
John Smith       | Senior Engineer | john@company.com   | 555-0123   | New York    | 40            | Engineering    | 2023-01-15 | Team lead  | TRUE
Jane Doe         | Designer        | jane@company.com   | 555-0124   | Remote      | 36            | Design         | 2023-02-01 | UX lead    | TRUE
```

**Skills Sheet:**
```
personEmail      | skillName       | skillType   | proficiencyLevel | notes           | lastUsed
john@company.com | Python          | strength    | expert           | 5+ years exp    | 2024-01-01
john@company.com | Management      | development | intermediate     | Growing skill   | 2024-01-15
jane@company.com | Figma           | strength    | advanced         | Daily use       | 2024-01-01
```

#### Projects Export Examples

**Projects Sheet:**
```
name                | projectNumber  | status    | client      | description               | startDate  | endDate    | estimatedHours | isActive
Website Redesign    | PRJ-2024-001   | Active    | Acme Corp   | Complete website overhaul | 2024-01-01 | 2024-06-30 | 2000          | TRUE
Mobile App Phase 2  | PRJ-2024-002   | Planning  | TechStart   | iOS and Android app       | 2024-03-01 | 2024-12-31 | 3500          | TRUE
```

**Deliverables Sheet:**
```
projectName      | projectNumber  | description      | percentage | date       | sortOrder | isCompleted | completedDate | notes
Website Redesign | PRJ-2024-001   | Schematic Design | 30        | 2024-02-15 | 1        | TRUE       | 2024-02-10   | Approved by client
Website Redesign | PRJ-2024-001   | Design Development | 60      | 2024-04-01 | 2        | FALSE      |              | In progress
Mobile App Phase 2 | PRJ-2024-002 | Requirements Doc | 15       | 2024-03-15 | 1        | FALSE      |              | Initial draft
```

**Assignments Sheet:**
```
projectName      | projectNumber  | personName  | personEmail      | roleOnProject  | startDate  | endDate    | weeklyHours                                | totalHours | notes           | isActive
Website Redesign | PRJ-2024-001   | John Smith  | john@company.com | Tech Lead      | 2024-01-01 | 2024-06-30 | {"2024-01-01":20,"2024-01-08":25}        | 800       | Full-time on project | TRUE
Website Redesign | PRJ-2024-001   | Jane Doe    | jane@company.com | UI/UX Designer | 2024-01-15 | 2024-05-15 | {"2024-01-15":30,"2024-01-22":32}        | 600       | Design lead     | TRUE
Mobile App Phase 2 | PRJ-2024-002 | John Smith  | john@company.com | Consultant     | 2024-03-01 | 2024-04-01 | {"2024-03-01":10,"2024-03-08":8}         | 72        | Part-time only  | TRUE
```

### **Why Excel-First Approach:**

✅ **User-Friendly** - Familiar spreadsheet interface for HR/management  
✅ **Data Types** - Proper handling of dates, numbers, booleans  
✅ **Rich Features** - Multiple sheets, data validation, formatting  
✅ **Error Prevention** - Dropdowns prevent invalid data entry  
✅ **Comprehensive** - Instructions and templates in same file  
✅ **Fallback** - CSV option still available for simple use cases  
✅ **Professional** - More sophisticated than plain CSV  

## Implementation Priority

### **Phase 1**: People Import/Export (Foundation)
1. People export functionality (Excel + CSV)
2. People import functionality (Admin interface)
3. People management commands

### **Phase 2**: Projects Import/Export (Extension)
1. Projects export functionality (Excel + CSV)
2. Projects import functionality (Admin interface)
3. Projects management commands

### **Phase 3**: Advanced Features
1. Cross-system validation (ensure assigned people exist)
2. Bulk operations optimization
3. Enhanced error reporting

### ~~**Phase 4**: Frontend Integration~~ (FUTURE FEATURE)
❌ **Deferred** - Not currently needed
1. ~~Export/Import UI in People page~~ (Future enhancement)
2. ~~Export/Import UI in Projects page~~ (Future enhancement)  
3. ~~Progress indicators and file validation~~ (Future enhancement)

> **Current Solution**: Django Admin interface + Management Commands provide sufficient functionality

## Dependencies

- **openpyxl**: For Excel file processing
- **pandas**: For data validation and processing (optional)
- **Django admin**: For web interface
- **Python csv module**: For CSV fallback support

## 🚨 CRITICAL IMPLEMENTATION REQUIREMENTS

### Serializer Integration Requirements (R2-REBUILD-STANDARDS Compliance)

**MANDATORY**: Import/export MUST use existing serializers for all data transformations.

```python
# ✅ CORRECT: Use existing serializer patterns
from people.serializers import PersonSerializer
from projects.serializers import ProjectSerializer

def process_excel_import(excel_data):
    # Excel headers are camelCase: weeklyCapacity, departmentName
    # Serializer transforms to snake_case for database: weekly_capacity, department_name
    serializer = PersonSerializer(data=excel_data)
    if serializer.is_valid():
        serializer.save()  # Automatic camelCase → snake_case transformation
    return serializer.errors

def process_excel_export(person_queryset):
    # Database fields are snake_case: weekly_capacity, department_name  
    # Serializer transforms to camelCase for Excel: weeklyCapacity, departmentName
    serializer = PersonSerializer(person_queryset, many=True)
    return serializer.data  # Automatic snake_case → camelCase transformation
```

**NEVER**:
- ❌ Bypass serializer field mappings
- ❌ Create duplicate transformation logic
- ❌ Create excel_field_mapping dictionaries
- ❌ Access model fields directly in Excel handlers

### Code Quality Standards (R2-REBUILD-STANDARDS Compliance)

**MANDATORY CODE REQUIREMENTS**:
- ✅ Maximum function length: **20 lines**
- ✅ Maximum file length: **200 lines**  
- ✅ **NO TODO comments** - Do it now or don't do it
- ✅ **NO commented code blocks** - Delete it
- ✅ **NO abstractions** until pattern repeats 3+ times
- ✅ Use bulk operations for performance
- ✅ Implement proper error handling with user-friendly messages

**NAMING COMPLIANCE**:
```python
# ✅ CORRECT: All Python code uses snake_case
def export_people_to_excel(queryset, output_file):
    workbook = openpyxl.Workbook()
    people_sheet = workbook.active
    people_sheet.title = "People"
    
# ✅ CORRECT: Excel headers use camelCase (matches API)
headers = ['name', 'weeklyCapacity', 'departmentName', 'isActive']

# ❌ WRONG: Mixed naming conventions
def exportPeopleToExcel():  # ❌ camelCase function name
    headers = ['name', 'weekly_capacity']  # ❌ snake_case Excel headers
```

**LEAN CODE ENFORCEMENT**:
```python
# ✅ CORRECT: Simple, direct implementation
def import_person_row(row_data):
    serializer = PersonSerializer(data=row_data)
    if serializer.is_valid():
        return serializer.save()
    return serializer.errors

# ❌ WRONG: Over-abstracted
class AbstractExcelImporter(ABC):
    @abstractmethod
    def process_row(self, row): pass
    
class PersonExcelImporter(AbstractExcelImporter):
    def process_row(self, row): pass
```

## Key Project Features Supported

### **People Import/Export Features:**
- ✅ Full person profile data (name, role, contact, location, capacity)
- ✅ Department assignments with name-based matching
- ✅ Skills management (strengths, development areas, learning goals)
- ✅ Bulk people creation and updates
- ✅ Data validation with Excel dropdowns

### **Projects Import/Export Features:**
- ✅ Complete project information (name, status, client, dates, hours)
- ✅ Project deliverables with completion tracking
- ✅ Assignment management with weekly hour allocations
- ✅ Person-project relationships with role definitions
- ✅ JSON weekly hours format for complex scheduling
- ✅ Cross-reference validation between projects, people, and assignments

### **Advanced Capabilities:**
- ✅ **Comprehensive Export**: All related data in one Excel file
- ✅ **Smart Import**: Update existing records or create new ones
- ✅ **Error Prevention**: Excel data validation prevents bad data entry
- ✅ **Batch Operations**: Handle hundreds of records efficiently
- ✅ **Audit Trail**: Track import results and errors
- ✅ **Template Generation**: Download pre-formatted Excel templates
- ✅ **Flexible Matching**: Match records by multiple criteria (email, name, project number)

This implementation provides a professional-grade import/export system suitable for enterprise use while maintaining ease of use for non-technical users.

---

# 🚀 PROJECTS IMPORT/EXPORT IMPLEMENTATION

## 📋 **Implementation Plan: Projects Import/Export with People Assignments**

Building on the successful People import/export system, we need to implement a comprehensive Projects import/export system that includes:
- **Project data** (name, status, client, dates, etc.)
- **Project assignments** (people assigned with weekly hours)  
- **Project deliverables** (milestones, percentages, dates)

### **Data Relationships:**
```
Project (1) ←→ (Many) Assignments ←→ (1) Person
Project (1) ←→ (Many) Deliverables
```

## Phase 5: Projects Export Functionality

### **Multi-Sheet Excel Structure**
```
Sheet 1: "Projects" - Main project data
Sheet 2: "Assignments" - People assigned to projects with weekly hours
Sheet 3: "Deliverables" - Project milestones and completion tracking
Sheet 4: "Template" - Empty template with examples
Sheet 5: "Instructions" - Import guidelines and field descriptions
```

### **Excel Export Headers (camelCase)**

#### **Projects Sheet:**
```
name | projectNumber | status | client | description | startDate | endDate | estimatedHours | isActive
```

#### **Assignments Sheet:**
```
projectName | projectNumber | personName | personEmail | roleOnProject | startDate | endDate | weeklyHours | totalHours | notes | isActive
```
- **weeklyHours**: JSON string format: `{"2024-08-25":10,"2024-09-01":8}`

#### **Deliverables Sheet:**
```
projectName | projectNumber | description | percentage | date | sortOrder | isCompleted | completedDate | notes
```

### **Files to Create:**

1. **`backend/projects/utils/excel_handler.py`** - Projects Excel processing
2. **`backend/projects/utils/csv_handler.py`** - Projects CSV fallback
3. **`backend/projects/forms.py`** - Import form validation
4. **`backend/projects/templates/admin/import_projects.html`** - Import interface
5. **`backend/projects/templates/admin/projects/project/change_list.html`** - Add import button
6. **`backend/projects/templates/admin/projects/project/delete_confirmation.html`** - Bulk delete

### **Admin Actions to Add:**
```python
# In projects/admin.py
def export_projects_excel(modeladmin, request, queryset):
    """Export selected projects to Excel with assignments and deliverables."""
    
def export_projects_csv(modeladmin, request, queryset):
    """Export selected projects to CSV (simplified format)."""
    
def export_all_projects_excel(modeladmin, request, queryset):
    """Export ALL projects regardless of selection."""
    
def bulk_delete_projects(modeladmin, request, queryset):
    """Bulk delete with confirmation (like People admin)."""
```

## Phase 6: Projects Import Functionality

### **CRITICAL: Projects Serializer Integration Requirements (R2-REBUILD-STANDARDS Compliance)**

**MANDATORY**: All Projects import/export operations MUST use existing serializers for data transformations.

```python
# ✅ REQUIRED: Use ProjectSerializer for all import operations
from projects.serializers import ProjectSerializer
from assignments.serializers import AssignmentSerializer
from deliverables.serializers import DeliverableSerializer

def import_projects_row(excel_row_data):
    """Import single project row using ProjectSerializer."""
    # Excel headers are camelCase: projectNumber, startDate, estimatedHours, isActive
    # ProjectSerializer transforms to snake_case: project_number, start_date, estimated_hours, is_active
    
    # Match existing project by projectNumber (preferred) or name
    project = None
    if excel_row_data.get('projectNumber'):
        project = Project.objects.filter(project_number=excel_row_data['projectNumber']).first()
    elif excel_row_data.get('name'):
        project = Project.objects.filter(name=excel_row_data['name']).first()
    
    # Use serializer for create or update
    if project:
        serializer = ProjectSerializer(project, data=excel_row_data, partial=True)
    else:
        serializer = ProjectSerializer(data=excel_row_data)
    
    if serializer.is_valid():
        return serializer.save()  # Automatic camelCase → snake_case transformation
    return serializer.errors

def import_assignments_row(excel_row_data):
    """Import single assignment row using AssignmentSerializer."""
    # Excel headers: projectName, projectNumber, personEmail, weeklyHours, roleOnProject
    # AssignmentSerializer transforms: weekly_hours, role_on_project
    
    serializer = AssignmentSerializer(data=excel_row_data)
    if serializer.is_valid():
        return serializer.save()  # Automatic transformation via serializer
    return serializer.errors
```

**NEVER**:
- ❌ Bypass serializer field mappings
- ❌ Create duplicate transformation logic
- ❌ Access model fields directly in import handlers
- ❌ Create manual field mapping dictionaries

### **CRITICAL: Weekly Hours JSON Field Handling**

**MANDATORY**: Weekly hours JSON field transformation MUST use serializer mapping:

```python
# ✅ REQUIRED: AssignmentSerializer field mapping
class AssignmentSerializer(serializers.ModelSerializer):
    weeklyHours = serializers.JSONField(source='weekly_hours')  # MANDATORY camelCase → snake_case
    roleOnProject = serializers.CharField(source='role_on_project', required=False)
    
    class Meta:
        model = Assignment
        fields = ['id', 'project', 'person', 'weeklyHours', 'roleOnProject', ...]
```

**Weekly Hours Processing Logic:**
- **Export**: Database `weekly_hours` (JSON) → Excel `weeklyHours` (JSON string)
- **Import**: Excel `weeklyHours` (JSON string) → Database `weekly_hours` (JSON)
- **Validation**: Ensure JSON format is correct, dates are valid, hours are positive numbers

### **CRITICAL: Container Restart Requirements**

**MANDATORY**: Container restart is required after any serializer modifications:

```bash
# ✅ REQUIRED after serializer field changes
docker-compose restart backend

# ✅ Wait for restart completion (check health)
curl -s http://localhost:8000/api/health/ | grep "healthy"

# ✅ Test full import cycle after restart
python manage.py import_projects --file test_projects.xlsx --dry-run
```

**When Container Restart is MANDATORY**:
- ✅ Adding new serializer field mappings
- ✅ Modifying existing field mappings (source='...')
- ✅ Changing serializer Meta.fields list
- ✅ Any changes to Projects/Assignments/Deliverables serializers

### **Import Processing Logic:**

#### **Multi-Sheet Import Strategy:**
1. **Projects Sheet**: Process main project data first (using ProjectSerializer)
2. **Assignments Sheet**: Match projects by name/number, match people by email/name (using AssignmentSerializer)
3. **Deliverables Sheet**: Match projects by name/number, create deliverables (using DeliverableSerializer)

#### **Matching Logic:**
- **Projects**: Match by `projectNumber` (preferred) or `name`
- **People**: Match by `email` (preferred) or `name` (reuse existing People logic)
- **Cross-validation**: Ensure assigned people exist, create if needed

#### **Import Process:**
```python
def import_projects_from_excel(file, update_existing=True, dry_run=False):
    """
    Multi-sheet import process using serializers:
    1. Import/update projects from Projects sheet (ProjectSerializer)
    2. Import assignments from Assignments sheet (AssignmentSerializer)
    3. Import deliverables from Deliverables sheet (DeliverableSerializer)
    4. Return comprehensive results with cross-sheet validation
    """
```

## Phase 7: Projects Management Commands

### **Export Commands:**
```bash
# Export all project data (projects + assignments + deliverables)
python manage.py export_projects --format excel --output projects_full.xlsx

# Export specific project
python manage.py export_projects --project "Website Redesign" --format excel

# Export by status
python manage.py export_projects --status active --format excel

# Export by client
python manage.py export_projects --client "Acme Corp" --format excel

# Export projects only (no assignments/deliverables)
python manage.py export_projects --projects-only --format csv
```

### **Import Commands:**
```bash
# Import full project data
python manage.py import_projects --file projects.xlsx --dry-run

# Import with options
python manage.py import_projects --file projects.xlsx --update-existing --include-assignments --include-deliverables

# Import projects only (skip related data)
python manage.py import_projects --file projects.xlsx --projects-only
```

## Implementation Steps Summary

### **Step 1: Projects Admin Export (Core)**
1. Create `projects/utils/excel_handler.py` with multi-sheet export
2. Create `projects/utils/csv_handler.py` for simple export
3. Update `projects/admin.py` with export actions
4. Add bulk delete action with confirmation

### **Step 2: Projects Admin Import** 
1. Create import form in `projects/forms.py`
2. Create import template `admin/import_projects.html`
3. Add import processing logic to excel/csv handlers
4. Update admin with import URLs and views

### **Step 3: Projects Management Commands**
1. Create `projects/management/commands/export_projects.py`
2. Create `projects/management/commands/import_projects.py`
3. Add advanced filtering and options

### **Step 4: Testing & Validation**
1. Test export with real project data
2. Test import with dry-run mode
3. Validate cross-sheet relationships
4. Test edge cases (missing people, invalid JSON, etc.)

## Key Challenges & Solutions

### **Challenge 1: Weekly Hours JSON Complexity**
**Solution**: Provide two import formats:
- **Advanced**: JSON string `{"2024-08-25":10,"2024-09-01":8}`
- **Simple**: Current week hours only (easier for users)

### **Challenge 2: Cross-Sheet Data Integrity**
**Solution**: 
- Import projects first, get IDs
- Match assignments to projects and people
- Validate all relationships before saving
- Provide detailed error messages with sheet references

### **Challenge 3: Large Data Volumes**
**Solution**:
- Use Django bulk operations
- Process in chunks for memory efficiency
- Provide progress indicators in admin
- Stream large Excel files

### **Challenge 4: People Auto-Creation**
**Solution**: 
- Option to auto-create people from assignments sheet
- Validate people data completeness
- Use existing People serializer for consistency

## Excel Template Features

### **Data Validation:**
- Project status dropdown: Planning, Active, Active CA, On Hold, Completed, Cancelled
- People email validation (link to existing people)
- Date formatting for all date fields
- JSON format help for weekly hours
- Percentage validation (0-100) for deliverables

### **Formatting:**
- **Red headers**: Required fields (projectName, personName/Email)
- **Blue headers**: Optional fields
- **Yellow headers**: System fields (auto-calculated)
- **Example rows**: Sample data in Template sheet
- **Conditional formatting**: Highlight errors, completed items

### **Instructions Sheet:**
- Multi-sheet import process explanation
- Field mapping reference
- JSON format examples for weekly hours
- Common error solutions
- Cross-sheet relationship guide

## Expected Benefits

### **Business Value:**
- **Complete Project Overview**: Export entire project with all people and deliverables
- **Resource Planning**: Import assignments with detailed weekly hour allocations
- **Client Reporting**: Export filtered data by client or project status
- **Migration Support**: Easy data transfer between systems

### **User Experience:**
- **One-Click Export**: Get complete project data in single Excel file
- **Smart Import**: Automatic relationship matching and validation
- **Error Prevention**: Template with validation prevents bad data
- **Progress Tracking**: Dry-run mode to preview changes

### **System Integration:**
- **Command Line Automation**: Batch operations for CI/CD
- **Backup & Restore**: Complete project data backup capability
- **Audit Trail**: Track who imported/exported what and when
- **Cross-System Sync**: Easy integration with external project tools

This Projects import/export system will provide comprehensive project management capabilities while maintaining the same professional standards and user experience as the People system.