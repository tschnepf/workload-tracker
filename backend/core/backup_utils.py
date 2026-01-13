import os
import re
import json
import hashlib
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Iterable, List, Optional, Tuple


SAFE_PART_RE = re.compile(r"[^a-zA-Z0-9_-]+")
TIMESTAMP_FMT = "%Y%m%dT%H%M%SZ"
# <app>_<env>_<db>_YYYYmmddTHHMMSSZ.pgcustom or .sql.gz
FILENAME_RE = re.compile(
    r"^(?P<app>[A-Za-z0-9_-]+)_(?P<env>[A-Za-z0-9_-]+)_(?P<db>[A-Za-z0-9_-]+)_(?P<ts>\d{8}T\d{6}Z)\.(?P<ext>pgcustom|sql\.gz)$"
)


@dataclass
class BackupInfo:
    id: str
    filename: str
    size: int
    createdAt: str
    description: Optional[str] = None
    sha256: Optional[str] = None
    format: str = "custom"  # 'custom' | 'plain'


def sanitize_part(value: str) -> str:
    """Sanitize user-provided parts for filenames.

    - allow only [a-zA-Z0-9_-]
    - collapse invalid chars to '-'
    - strip leading/trailing '-'
    - ensure non-empty by falling back to 'x'
    """
    if value is None:
        return "x"
    cleaned = SAFE_PART_RE.sub("-", value).strip("-")
    return cleaned or "x"


def utc_timestamp(ts: Optional[datetime] = None) -> str:
    dt = ts.astimezone(timezone.utc) if isinstance(ts, datetime) else datetime.now(timezone.utc)
    return dt.strftime(TIMESTAMP_FMT)


def canonical_basename(app: str, env: str, db: str, ts: Optional[str] = None) -> str:
    app_s = sanitize_part(app)
    env_s = sanitize_part(env)
    db_s = sanitize_part(db)
    ts_s = ts or utc_timestamp()
    return f"{app_s}_{env_s}_{db_s}_{ts_s}"


def build_paths(backups_dir: str, app: str, env: str, db: str, *, ts: Optional[str] = None, fmt: str = "custom") -> Tuple[str, str]:
    """Return (archive_path, meta_path) for the canonical name and format.

    fmt: 'custom' -> .pgcustom, 'plain' -> .sql.gz
    """
    base = canonical_basename(app, env, db, ts)
    if fmt not in {"custom", "plain"}:
        raise ValueError("fmt must be 'custom' or 'plain'")
    ext = "pgcustom" if fmt == "custom" else "sql.gz"
    archive = os.path.join(backups_dir, f"{base}.{ext}")
    meta = os.path.join(backups_dir, f"{base}.meta.json")
    return archive, meta


def parse_filename(filename: str) -> Optional[dict]:
    m = FILENAME_RE.match(filename)
    if not m:
        return None
    d = m.groupdict()
    fmt = "custom" if d["ext"] == "pgcustom" else "plain"
    return {
        "app": d["app"],
        "env": d["env"],
        "db": d["db"],
        "timestamp": d["ts"],
        "format": fmt,
    }


def meta_path_for(archive_path: str) -> str:
    base, _ = os.path.splitext(archive_path)
    # Handles .sql.gz by stripping only the last extension first
    if archive_path.endswith(".sql.gz"):
        base = archive_path[: -len(".sql.gz")]
    return f"{base}.meta.json"


def load_meta(path: str) -> Optional[dict]:
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None


def compute_sha256(path: str, chunk_size: int = 1024 * 1024) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(chunk_size), b""):
            h.update(chunk)
    return h.hexdigest()


def _iso_from_parts_or_stat(filename: str, full_path: str) -> str:
    parts = parse_filename(filename)
    if parts:
        try:
            dt = datetime.strptime(parts["timestamp"], TIMESTAMP_FMT).replace(tzinfo=timezone.utc)
            return dt.isoformat().replace("+00:00", "Z")
        except Exception:  # nosec B110
            pass
    try:
        ts = os.path.getmtime(full_path)
        return datetime.fromtimestamp(ts, tz=timezone.utc).isoformat().replace("+00:00", "Z")
    except Exception:
        return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def discover_backups(backups_dir: str, *, include_hash: bool = False) -> List[BackupInfo]:
    """Scan BACKUPS_DIR for known backup files and build metadata list."""
    items: List[BackupInfo] = []
    try:
        names = sorted(os.listdir(backups_dir))
    except FileNotFoundError:
        return items

    for name in names:
        if not (name.endswith(".pgcustom") or name.endswith(".sql.gz")):
            continue
        full = os.path.join(backups_dir, name)
        try:
            size = os.path.getsize(full)
        except OSError:
            size = 0
        created_iso = _iso_from_parts_or_stat(name, full)
        parts = parse_filename(name) or {}
        fmt = parts.get("format", "custom")
        meta = load_meta(meta_path_for(full)) or {}
        desc = meta.get("description")
        sha = meta.get("sha256")
        if include_hash and not sha:
            try:
                sha = compute_sha256(full)
            except Exception:
                sha = None
        items.append(
            BackupInfo(
                id=name,  # use filename as stable ID
                filename=name,
                size=size,
                createdAt=created_iso,
                description=desc,
                sha256=sha,
                format=fmt,
            )
        )
    return items

