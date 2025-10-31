"""
Shared department helpers (BFS include-children expansion).
"""
from typing import List


def get_descendant_department_ids(root_id: int) -> List[int]:
    """Return a list of ``Department`` IDs including the root and all descendants.

    Uses an explicit BFS to avoid recursion depth issues and to keep queries
    predictable. Import is inside the function to avoid circular imports.
    """
    if root_id is None:
        return []
    try:
        from departments.models import Department
    except Exception:
        return [root_id]

    ids = set()
    stack = [int(root_id)]
    while stack:
        cur = stack.pop()
        if cur in ids:
            continue
        ids.add(cur)
        for d in Department.objects.filter(parent_department_id=cur).values_list('id', flat=True):
            if d not in ids:
                stack.append(d)
    return list(ids)

