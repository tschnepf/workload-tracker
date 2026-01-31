"""Helpers for exact-parity tokenized search across endpoints."""

from __future__ import annotations

import json
from typing import Iterable, List, Dict, Any, Optional

from django.db.models import Q

Token = Dict[str, str]


VALID_OPS = {"or", "and", "not"}


def _normalize_tokens(raw: Any) -> List[Token]:
    """Normalize token payload into a clean list.

    Accepts:
      - list of {term, op}
      - list of strings (treated as AND)
      - JSON string that decodes to list
    """
    if raw is None:
        return []

    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except Exception:
            # Treat a plain string as a single AND token
            raw = [{"term": raw, "op": "and"}]

    if not isinstance(raw, list):
        return []

    tokens: List[Token] = []
    for item in raw:
        term = ""
        op = "or"
        if isinstance(item, str):
            term = item
            op = "and"
        elif isinstance(item, dict):
            term = str(item.get("term", ""))
            op = str(item.get("op", "or")).lower()
        else:
            continue
        term = term.strip()
        if not term:
            continue
        if op not in VALID_OPS:
            op = "or"
        tokens.append({"term": term, "op": op})
    return tokens


def parse_search_tokens(
    *,
    request: Any | None = None,
    data: Optional[dict] = None,
    query_params: Optional[dict] = None,
) -> List[Token]:
    """Extract and normalize search tokens from request/data/query.

    Falls back to a single AND token from `q` when `search_tokens` is not provided.
    """
    if data is None and request is not None:
        data = getattr(request, "data", None)
    if query_params is None and request is not None:
        query_params = getattr(request, "query_params", None)

    raw = None
    if isinstance(data, dict) and "search_tokens" in data:
        raw = data.get("search_tokens")
    if raw is None and query_params is not None:
        try:
            raw = query_params.get("search_tokens")
        except Exception:
            raw = None

    tokens = _normalize_tokens(raw)
    if tokens:
        return tokens

    # Fallback to simple q param
    q_value = None
    if isinstance(data, dict):
        q_value = data.get("q")
    if q_value is None and query_params is not None:
        try:
            q_value = query_params.get("q")
        except Exception:
            q_value = None
    if q_value:
        return _normalize_tokens([{"term": q_value, "op": "and"}])

    return []


def build_token_query(tokens: Iterable[Token], fields: Iterable[str]) -> Optional[Q]:
    """Build a Django Q object that mirrors client AND/OR/NOT semantics."""
    tokens_list = list(tokens)
    if not tokens_list:
        return None

    q_and = Q()
    q_or = Q()
    has_or = False

    for token in tokens_list:
        term = token.get("term", "")
        op = token.get("op", "or")
        if not term:
            continue
        q_term = Q()
        for field in fields:
            q_term |= Q(**{f"{field}__icontains": term})

        if op == "not":
            q_and &= ~q_term
        elif op == "and":
            q_and &= q_term
        else:
            has_or = True
            q_or |= q_term

    if has_or:
        q_and &= q_or

    return q_and


def apply_token_filter(qs, tokens: Iterable[Token], fields: Iterable[str]):
    """Apply token filter to queryset; returns qs unchanged if no tokens."""
    q = build_token_query(tokens, fields)
    if q is None:
        return qs
    return qs.filter(q)
