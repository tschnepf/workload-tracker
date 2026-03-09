"""
Department model - Create Day 1, populate Chunk 6.
"""

from django.db import models
from django.core.exceptions import ValidationError

class Department(models.Model):
    """Department model - create Day 1, populate Chunk 6"""
    
    name = models.CharField(max_length=100, unique=True)
    short_name = models.CharField(max_length=32, blank=True, default='')
    parent_department = models.ForeignKey('self', on_delete=models.SET_NULL, blank=True, null=True)
    vertical = models.ForeignKey('verticals.Vertical', on_delete=models.PROTECT, blank=True, null=True, related_name='departments')
    manager = models.ForeignKey('people.Person', on_delete=models.SET_NULL, blank=True, null=True, related_name='managed_departments')
    secondary_managers = models.ManyToManyField(
        'people.Person',
        blank=True,
        related_name='secondary_managed_departments',
    )
    description = models.TextField(blank=True)
    
    # System fields
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [
            models.Index(fields=['vertical'], name='idx_department_vertical'),
        ]
    
    def clean(self):
        """Validate department hierarchy to prevent circular references"""
        super().clean()

        if self.parent_department:
            # Enforce vertical inheritance from parent
            parent_vertical = getattr(self.parent_department, 'vertical', None)
            if parent_vertical is None:
                if self.vertical is not None:
                    raise ValidationError("Child department must inherit parent's vertical (parent has none).")
            else:
                if self.vertical is None:
                    self.vertical = parent_vertical
                elif self.vertical_id != self.parent_department.vertical_id:
                    raise ValidationError("Child department must inherit parent's vertical.")

            # Check for direct circular reference (department as its own parent)
            if self.parent_department == self:
                raise ValidationError("Department cannot be its own parent.")
            
            # Check for indirect circular references (walk up the hierarchy)
            current = self.parent_department
            visited_departments = {self.pk} if self.pk else set()
            
            while current:
                if current.pk in visited_departments:
                    raise ValidationError(
                        f"Circular reference detected: {self.name} cannot have "
                        f"{self.parent_department.name} as parent as it would create a cycle."
                    )
                
                visited_departments.add(current.pk)
                current = current.parent_department
                
                # Safety check to prevent infinite loops (max depth of 10)
                if len(visited_departments) > 10:
                    raise ValidationError("Department hierarchy is too deep (maximum 10 levels).")

    def save(self, *args, **kwargs):
        """Override save to run validation"""
        prev_vertical_id = None
        if self.pk:
            try:
                prev_vertical_id = Department.objects.filter(pk=self.pk).values_list('vertical_id', flat=True).first()
            except Exception:
                prev_vertical_id = None
        # Enforce vertical inheritance from parent if present
        if self.parent_department:
            try:
                self.vertical = self.parent_department.vertical
            except Exception:
                pass
        self.clean()
        super().save(*args, **kwargs)

        # If this department's vertical changed, propagate to descendants
        if self.pk and prev_vertical_id != self.vertical_id:
            try:
                descendants = set()
                stack = [self.pk]
                while stack:
                    current = stack.pop()
                    for child_id in Department.objects.filter(parent_department_id=current).values_list('id', flat=True):
                        if child_id in descendants:
                            continue
                        descendants.add(child_id)
                        stack.append(child_id)
                if descendants:
                    Department.objects.filter(id__in=descendants).update(vertical=self.vertical)
            except Exception:
                pass

    def __str__(self):
        return self.name


class DepartmentOrgChartLayout(models.Model):
    """Shared org chart workspace state for a department."""

    department = models.OneToOneField(
        Department,
        on_delete=models.CASCADE,
        related_name='org_chart_layout',
    )
    department_card_x = models.IntegerField(default=64)
    department_card_y = models.IntegerField(default=48)
    workspace_version = models.PositiveIntegerField(default=1)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Department Org Chart Layout'

    @classmethod
    def get_or_create_for_department(cls, department: Department):
        obj, _ = cls.objects.get_or_create(
            department=department,
            defaults={
                'department_card_x': 64,
                'department_card_y': 48,
                'workspace_version': 1,
            },
        )
        return obj

    def bump_workspace_version(self):
        self.workspace_version = int(self.workspace_version or 0) + 1
        self.save(update_fields=['workspace_version', 'updated_at'])

    def __str__(self):
        return f"DepartmentOrgChartLayout(department={self.department_id})"


class DepartmentReportingGroup(models.Model):
    """Reporting group under a department for org-chart workspace."""

    department = models.ForeignKey(
        Department,
        on_delete=models.CASCADE,
        related_name='reporting_groups',
    )
    name = models.CharField(max_length=120, default='New Reporting Group')
    manager = models.ForeignKey(
        'people.Person',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='managed_reporting_groups',
    )
    card_x = models.IntegerField(default=64)
    card_y = models.IntegerField(default=240)
    sort_order = models.IntegerField(default=0)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [
            models.Index(fields=['department', 'is_active', 'sort_order'], name='dept_rgroup_scope_idx'),
            models.Index(fields=['department', 'manager'], name='dept_rgroup_manager_idx'),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=['department', 'manager'],
                condition=models.Q(manager__isnull=False, is_active=True),
                name='uniq_active_reporting_group_manager_per_department',
            ),
        ]

    def clean(self):
        super().clean()
        if self.manager_id is None:
            return
        if self.manager is None:
            return
        if not self.manager.department_id:
            raise ValidationError("Reporting group manager must belong to a department.")
        if self.department_id and self.manager.department_id != self.department_id:
            raise ValidationError("Reporting group manager must belong to the same department.")

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.department_id}:{self.name}"


class DepartmentReportingGroupMember(models.Model):
    """Department-scoped membership in a reporting group (single group per department)."""

    department = models.ForeignKey(
        Department,
        on_delete=models.CASCADE,
        related_name='reporting_group_memberships',
    )
    reporting_group = models.ForeignKey(
        DepartmentReportingGroup,
        on_delete=models.CASCADE,
        related_name='memberships',
    )
    person = models.ForeignKey(
        'people.Person',
        on_delete=models.CASCADE,
        related_name='reporting_group_memberships',
    )
    sort_order = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [
            models.Index(fields=['reporting_group', 'sort_order'], name='rgroup_member_order_idx'),
            models.Index(fields=['department', 'person'], name='dept_rgroup_person_idx'),
        ]
        constraints = [
            models.UniqueConstraint(fields=['reporting_group', 'person'], name='uniq_reporting_group_person'),
            models.UniqueConstraint(fields=['department', 'person'], name='uniq_department_reporting_group_person'),
        ]

    def clean(self):
        super().clean()
        if self.reporting_group_id and self.department_id:
            if self.reporting_group.department_id != self.department_id:
                raise ValidationError("Reporting group membership department mismatch.")
        if self.person_id and self.department_id:
            if self.person.department_id != self.department_id:
                raise ValidationError("Reporting group member must belong to the same department.")
        if self.reporting_group_id and self.person_id:
            if self.reporting_group.manager_id == self.person_id:
                raise ValidationError("A reporting group manager cannot also be listed as a member.")

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"group={self.reporting_group_id}, person={self.person_id}"
