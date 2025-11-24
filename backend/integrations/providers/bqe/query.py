from __future__ import annotations

from dataclasses import dataclass, field
from typing import List


def _quote(value: str) -> str:
    escaped = str(value).replace("'", "''")
    return f"'{escaped}'"


@dataclass
class WhereClauseBuilder:
    clauses: List[str] = field(default_factory=list)

    def gte(self, field: str, value: str) -> 'WhereClauseBuilder':
        self.clauses.append(f"{field}>={_quote(value)}")
        return self

    def eq(self, field: str, value: str) -> 'WhereClauseBuilder':
        self.clauses.append(f"{field}={_quote(value)}")
        return self

    def is_null(self, field: str) -> 'WhereClauseBuilder':
        self.clauses.append(f"{field} is null")
        return self

    def raw(self, expression: str | None) -> 'WhereClauseBuilder':
        if expression:
            normalized = expression.strip()
            if normalized:
                self.clauses.append(normalized)
        return self

    def build(self) -> str | None:
        if not self.clauses:
            return None
        return ' and '.join(self.clauses)
