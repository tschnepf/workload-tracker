from django.core.management.base import BaseCommand
from django.conf import settings
from django.utils.timezone import now
from pathlib import Path
from typing import Dict, Tuple


class Command(BaseCommand):
    help = "Generate roles migration report to prompts/roles-migration-report.txt"

    def handle(self, *args, **options):
        from projects.models import ProjectRole
        from assignments.models import Assignment
        from departments.models import Department

        base_dir = Path(getattr(settings, 'BASE_DIR', '.'))
        # Prefer repo-level prompts/ when available; otherwise fallback to app-level /app/prompts
        candidates = [base_dir.parent / 'prompts', base_dir / 'prompts']
        prompts_dir = None
        for p in candidates:
            try:
                p.mkdir(parents=True, exist_ok=True)
                prompts_dir = p
                break
            except Exception:  # nosec B112
                continue
        if prompts_dir is None:
            raise RuntimeError('Unable to create prompts directory in any known location')
        out_path = prompts_dir / 'roles-migration-report.txt'

        ts = now()

        # Summary counts
        total_roles = ProjectRole.objects.count()
        total_asn_with_legacy = Assignment.objects.filter(role_on_project__isnull=False).exclude(role_on_project__exact='').count()
        total_asn_mapped = Assignment.objects.filter(
            role_on_project__isnull=False
        ).exclude(role_on_project__exact='').filter(role_on_project_ref__isnull=False).count()
        total_asn_unmatched = Assignment.objects.filter(
            role_on_project__isnull=False, role_on_project_ref__isnull=True
        ).exclude(role_on_project__exact='').count()

        lines = []
        w = lines.append
        w("Project Roles by Department - Migration Report")
        w(f"Generated at: {ts.isoformat()}")
        w("")
        w("Summary")
        w(f"- Total ProjectRole rows: {total_roles}")
        w(f"- Assignments with legacy role string: {total_asn_with_legacy}")
        w(f"- Assignments mapped to FK (role_on_project_ref): {total_asn_mapped}")
        w(f"- Assignments still unmatched: {total_asn_unmatched}")
        w("")

        # Per-department breakdown
        w("Per-Department Breakdown")
        w("(role counts, mapped, unmatched)")
        for dept in Department.objects.order_by('name').all():
            role_count = ProjectRole.objects.filter(department_id=dept.id).count()
            mapped = Assignment.objects.filter(
                department_id=dept.id,
                role_on_project_ref__isnull=False,
            ).exclude(role_on_project__isnull=True).exclude(role_on_project__exact='').count()
            unmatched = Assignment.objects.filter(
                department_id=dept.id,
                role_on_project_ref__isnull=True,
            ).exclude(role_on_project__isnull=True).exclude(role_on_project__exact='').count()
            w(f"- {dept.id}: {dept.name} -> roles={role_count}, mapped={mapped}, unmatched={unmatched}")
        w("")

        # List active roles per department (top N)
        w("Active Roles by Department (sorted)")
        for dept in Department.objects.order_by('name').all():
            w(f"Department {dept.id} - {dept.name}")
            qs = ProjectRole.objects.filter(department_id=dept.id, is_active=True).order_by('sort_order', 'name')
            if not qs.exists():
                w("  (none)")
                continue
            for pr in qs:
                w(f"  - [{pr.id}] {pr.name}")
        w("")

        # Unmatched legacy values (grouped)
        w("Unmatched Legacy Role Strings (grouped, top 200)")
        unmatched_qs = Assignment.objects.filter(
            role_on_project_ref__isnull=True
        ).exclude(role_on_project__isnull=True).exclude(role_on_project__exact='')

        def norm(s: str) -> str:
            return ' '.join((s or '').strip().split()).lower()

        counts: Dict[Tuple[int, str], int] = {}
        samples: Dict[Tuple[int, str], str] = {}
        for row in unmatched_qs.values('department_id', 'role_on_project'):
            dept_id = row.get('department_id') or 0
            key = (int(dept_id), norm(row.get('role_on_project') or ''))
            if not key[1]:
                continue
            counts[key] = counts.get(key, 0) + 1
            if key not in samples:
                samples[key] = (row.get('role_on_project') or '').strip()
        # Sort by count desc
        top = sorted(counts.items(), key=lambda kv: kv[1], reverse=True)[:200]
        if not top:
            w("(none)")
        else:
            for (dept_id, nkey), cnt in top:
                try:
                    dept_name = Department.objects.get(id=dept_id).name
                except Department.DoesNotExist:
                    dept_name = "(unknown)"
                sample = samples.get((dept_id, nkey)) or nkey
                w(f"- dept={dept_id} ({dept_name}) count={cnt} sample='{sample}' normalized='{nkey}'")

        out_path.write_text("\n".join(lines), encoding='utf-8')
        self.stdout.write(self.style.SUCCESS(f"Report written: {out_path}"))
