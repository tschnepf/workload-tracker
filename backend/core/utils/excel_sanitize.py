import re
from typing import Any


_CTRL_RE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f]")
_DANGEROUS_PREFIXES = ("=", "+", "-", "@")


def sanitize_cell(value: Any) -> Any:
    """Return a safe representation for spreadsheet cells.

    - For strings: remove control characters, and if the first char is one of
      = + - @, prefix with an apostrophe to prevent formula execution in Excel.
    - Non-strings are returned unchanged.
    """
    if not isinstance(value, str):
        return value
    cleaned = _CTRL_RE.sub("", value)
    if cleaned.startswith(_DANGEROUS_PREFIXES):
        return "'" + cleaned
    return cleaned

