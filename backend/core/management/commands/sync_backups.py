from __future__ import annotations

import os
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from django.core.management.base import BaseCommand
from django.conf import settings

from core.backup_service import BackupService, meta_path_for
from core.notifications import notify_slack


class Command(BaseCommand):
    help = (
        "Sync verified backups to offsite storage (S3). Uses env credentials; "
        "skips during restore; updates sidecar meta on success."
    )

    def add_arguments(self, parser):
        parser.add_argument("--force", action="store_true", help="Upload even if offsiteLastSyncAt present")
        parser.add_argument("--prefix", type=str, default=None, help="Optional remote prefix (defaults from env AWS_S3_PREFIX)")

    def handle(self, *args, **opts):
        if os.getenv("OFFSITE_ENABLED", "false").lower() != "true":
            self.stdout.write("Offsite disabled; skipping.")
            return ""

        svc = BackupService()
        # Skip if a restore is in progress
        if os.path.exists(svc.lock_file("restore")):
            self.stdout.write("Restore lock present; skipping offsite sync.")
            return ""

        provider = os.getenv("OFFSITE_PROVIDER", "s3").lower()
        if provider != "s3":
            self.stdout.write("Only provider 's3' is supported at this time.")
            return ""

        # Validate AWS env
        for key in ("AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_S3_BUCKET", "AWS_REGION"):
            if not os.getenv(key):
                self.stdout.write(f"Missing required env: {key}")
                return ""

        force = bool(opts.get("force"))
        prefix = opts.get("prefix") or os.getenv("AWS_S3_PREFIX", "backups/")
        if prefix and not prefix.endswith('/'):
            prefix += '/'

        count = 0
        uploaded = []
        failed = []

        items = svc.list_backups(include_hash=False)
        for it in items:
            name = it.get("filename")
            if not name:
                continue
            path = os.path.join(svc.backups_dir, name)
            if not os.path.exists(path):
                continue
            # skip incoming quarantine
            if "/incoming/" in path.replace("\\", "/"):
                continue
            # check sidecar
            meta_path = meta_path_for(path)
            meta: Optional[dict] = None
            try:
                with open(meta_path, "r", encoding="utf-8") as f:
                    meta = json.load(f)
            except Exception:
                meta = None
            # skip if already synced and not forced
            if not force and meta and meta.get("offsiteLastSyncAt"):
                continue

            # Upload to S3
            try:
                self._upload_s3(path, prefix)
                # update sidecar
                iso = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
                meta = (meta or {})
                meta["offsiteLastSyncAt"] = iso
                try:
                    with open(meta_path, "w", encoding="utf-8") as f:
                        json.dump(meta, f, indent=2, sort_keys=True)
                except Exception:
                    pass
                uploaded.append(name)
                count += 1
            except Exception as e:
                failed.append({"filename": name, "error": str(e)})

        summary = {"uploaded": uploaded, "failed": failed}
        self.stdout.write(json.dumps(summary))
        # Non-blocking notify
        try:
            if uploaded or failed:
                txt = f"Offsite sync: uploaded={len(uploaded)} failed={len(failed)}"
                notify_slack(txt)
        except Exception:
            pass
        return ""

    def _upload_s3(self, path: str, prefix: str) -> None:
        import boto3
        from botocore.config import Config
        bucket = os.getenv("AWS_S3_BUCKET")
        region = os.getenv("AWS_REGION")
        key = (prefix or "") + Path(path).name
        sse = os.getenv("AWS_SSE")
        sse_kms = os.getenv("AWS_SSE_KMS_KEY_ID")

        cfg = Config(region_name=region, connect_timeout=3, read_timeout=10, retries={"max_attempts": 3})
        s3 = boto3.client("s3", config=cfg)
        extra = {}
        if sse:
            extra["ServerSideEncryption"] = sse
        if sse_kms:
            extra["SSEKMSKeyId"] = sse_kms

        with open(path, "rb") as f:
            s3.upload_fileobj(f, bucket, key, ExtraArgs=extra)

