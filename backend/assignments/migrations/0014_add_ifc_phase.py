from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('assignments', '0013_remove_assignment_idx_assignment_department_and_more'),
    ]

    operations = [
        migrations.AlterField(
            model_name='weeklyassignmentsnapshot',
            name='deliverable_phase',
            field=models.CharField(choices=[('sd', 'SD'), ('dd', 'DD'), ('ifp', 'IFP'), ('ifc', 'IFC'), ('masterplan', 'Masterplan'), ('bulletins', 'Bulletins'), ('ca', 'CA'), ('other', 'Other')], default='other', max_length=20),
        ),
        migrations.AlterField(
            model_name='assignmentmembershipevent',
            name='deliverable_phase',
            field=models.CharField(choices=[('sd', 'SD'), ('dd', 'DD'), ('ifp', 'IFP'), ('ifc', 'IFC'), ('masterplan', 'Masterplan'), ('bulletins', 'Bulletins'), ('ca', 'CA'), ('other', 'Other')], default='other', max_length=20),
        ),
    ]
