from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0011_project_role_catalog'),
        ('departments', '0002_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='DepartmentProjectRole',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('is_active', models.BooleanField(default=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('department', models.ForeignKey(on_delete=models.deletion.CASCADE, related_name='project_roles', to='departments.department')),
                ('project_role', models.ForeignKey(on_delete=models.deletion.CASCADE, related_name='departments', to='core.projectrole')),
            ],
            options={'ordering': ['department_id', 'project_role_id']},
        ),
        migrations.AddConstraint(
            model_name='departmentprojectrole',
            constraint=models.UniqueConstraint(fields=('department', 'project_role'), name='uniq_department_projectrole'),
        ),
        migrations.AddIndex(
            model_name='departmentprojectrole',
            index=models.Index(fields=['department'], name='idx_dpr_department'),
        ),
        migrations.AddIndex(
            model_name='departmentprojectrole',
            index=models.Index(fields=['department', 'project_role'], name='idx_dpr_dept_role'),
        ),
    ]

