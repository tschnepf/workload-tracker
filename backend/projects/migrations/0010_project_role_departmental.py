from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('departments', '0002_initial'),
        ('projects', '0009_remove_project_project_active_status_idx_and_more'),
    ]

    operations = [
        migrations.CreateModel(
            name='ProjectRole',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=100)),
                ('normalized_name', models.CharField(max_length=120)),
                ('is_active', models.BooleanField(default=True)),
                ('sort_order', models.IntegerField(default=0)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('department', models.ForeignKey(on_delete=models.deletion.CASCADE, related_name='department_project_roles', to='departments.department')),
            ],
            options={'ordering': ['department_id', 'sort_order', 'name']},
        ),
        migrations.AddConstraint(
            model_name='projectrole',
            constraint=models.UniqueConstraint(fields=('department', 'normalized_name'), name='uniq_projectrole_dept_normname'),
        ),
        migrations.AddConstraint(
            model_name='projectrole',
            constraint=models.UniqueConstraint(fields=('id', 'department'), name='uniq_projectrole_id_department'),
        ),
        migrations.AddIndex(
            model_name='projectrole',
            index=models.Index(fields=['department', 'is_active', 'sort_order'], name='idx_pr_dept_act_sort'),
        ),
        migrations.AddIndex(
            model_name='projectrole',
            index=models.Index(fields=['normalized_name'], name='idx_projectrole_normname'),
        ),
    ]
