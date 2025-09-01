from typing import List, Dict, Tuple
from people.models import Person


class WorkloadRebalancingService:
    @staticmethod
    def generate_rebalance_suggestions(weeks: int = 12) -> List[Dict]:
        """Suggest non-destructive rebalancing ideas across the next N weeks.

        Heuristic:
        - Overallocated: allocated_hours > weekly_capacity (1-week snapshot)
        - Underutilized: allocated_hours < 70% of capacity
        Pairs over with under within the SAME department AND SAME role,
        and proposes shifting hours.
        """
        team = (
            Person.objects.filter(is_active=True)
            .select_related('department', 'role')
        )

        # Bucket people by (department_id, role_id) to ensure suggestions
        # are constrained to same department and same role.
        buckets: Dict[Tuple[int, int], Dict[str, list]] = {}

        for person in team:
            u = person.get_utilization_over_weeks(weeks=1)
            allocated = u.get('allocated_hours', 0)
            capacity = person.weekly_capacity or 36
            dept_id = getattr(person.department, 'id', None)
            role_id = getattr(person.role, 'id', None)

            # If either department or role is missing, skip from pairing to
            # avoid cross-department/role suggestions.
            if dept_id is None or role_id is None:
                continue

            key = (dept_id, role_id)
            if key not in buckets:
                buckets[key] = {'over': [], 'under': []}

            if allocated > capacity:
                buckets[key]['over'].append((person, u))
            elif allocated < capacity * 0.7:
                buckets[key]['under'].append((person, u))

        suggestions: List[Dict] = []
        for (dept_id, role_id), groups in buckets.items():
            for (op, ou) in groups['over']:
                for (up, uu) in groups['under']:
                    suggestions.append({
                        'id': f"{op.id}-{up.id}",
                        'title': f"Shift hours within dept #{dept_id}, role #{role_id}: {op.name} ➜ {up.name}",
                        'description': (
                            f"{op.name} allocated {ou.get('allocated_hours', 0)}h/"
                            f"{op.weekly_capacity}h (>100%). {up.name} allocated "
                            f"{uu.get('allocated_hours', 0)}h/{up.weekly_capacity}h (<70%). "
                            f"Consider moving 4–8h on overlapping or adjacent work in the next {weeks} weeks."
                        ),
                        'fromPersonId': op.id,
                        'toPersonId': up.id,
                    })

        return suggestions[:20]
