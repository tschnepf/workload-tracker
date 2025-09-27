#!/usr/bin/env python3
"""
Fail CI if any tracked text file is not valid UTF-8.

Skips common binary file types by extension.
"""
from __future__ import annotations

import os
import subprocess
import sys

# Extensions to skip (binary)
SKIP_EXT = {
    '.png', '.jpg', '.jpeg', '.gif', '.ico', '.webp', '.bmp',
    '.pdf', '.zip', '.gz', '.rar', '.7z', '.tar', '.tgz', '.xz',
    '.woff', '.woff2', '.ttf', '.eot',
    '.sqlite3', '.db', '.rfa',
    '.xlsx', '.xls', '.xlsm',
}

def is_binary(path: str) -> bool:
    _, ext = os.path.splitext(path)
    return ext.lower() in SKIP_EXT

def git_ls_files() -> list[str]:
    out = subprocess.check_output(['git', 'ls-files', '-z'], text=False)
    return [p.decode('utf-8', 'ignore') for p in out.split(b'\x00') if p]

def main() -> int:
    files = git_ls_files()
    bad: list[str] = []
    for path in files:
        if is_binary(path):
            continue
        try:
            with open(path, 'rb') as f:
                data = f.read()
            # If it decodes, we consider it valid text
            data.decode('utf-8')
        except Exception:
            bad.append(path)
    if bad:
        sys.stderr.write('The following files are not valid UTF-8:\n')
        for p in bad:
            sys.stderr.write(f' - {p}\n')
        return 1
    print('UTF-8 check passed')
    return 0

if __name__ == '__main__':
    raise SystemExit(main())

