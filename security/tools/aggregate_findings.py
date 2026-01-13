#!/usr/bin/env python3
"""
Aggregate security tool outputs into security-findings.json using a simple, unified schema.

Inputs: JSON files under --artifacts (gitleaks, bandit, pip-audit, npm audit, semgrep, trivy config/image, safety).
Output: security/security-findings.json (or path via --out).

This is a best-effort normalizer. It prefers stable fields and falls back gracefully when structure differs.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from datetime import datetime, timezone
from urllib.parse import urlparse
from typing import Any, Dict, List


def sev_to_text(s: str | None) -> str:
    s = (s or '').strip().lower()
    if s in ('critical', 'crit'): return 'Critical'
    if s in ('high', 'h'): return 'High'
    if s in ('medium', 'med', 'moderate', 'moderate severity'): return 'Medium'
    if s in ('low', 'l'): return 'Low'
    return 'Medium'


def default_factors(sev: str) -> Dict[str, int]:
    sev = sev.capitalize()
    if sev == 'Critical':
        return {"exploitability": 5, "impact": 5, "exposure": 4, "detection": 2, "mitigation": 2}
    if sev == 'High':
        return {"exploitability": 4, "impact": 4, "exposure": 3, "detection": 3, "mitigation": 2}
    if sev == 'Medium':
        return {"exploitability": 3, "impact": 3, "exposure": 3, "detection": 3, "mitigation": 3}
    return {"exploitability": 2, "impact": 2, "exposure": 2, "detection": 4, "mitigation": 3}


def risk_score_from_factors(f: Dict[str, int]) -> float:
    num = f["exploitability"] * f["impact"] * f["exposure"]
    den = max(1, f["detection"] * f["mitigation"])  # avoid div-by-zero
    return round(num / den, 2)


def fingerprint(path: str, line: int, snippet: str | None) -> str:
    h = hashlib.sha256()
    h.update((path or '').encode('utf-8'))
    h.update(str(line or 0).encode('utf-8'))
    if snippet:
        h.update(snippet.encode('utf-8'))
    return h.hexdigest()


def _is_uri(value: str | None) -> bool:
    if not value or not isinstance(value, str):
        return False
    try:
        parsed = urlparse(value)
    except Exception:
        return False
    return parsed.scheme in ("http", "https") and bool(parsed.netloc)


def _normalize_refs(refs: List[str] | None) -> List[str]:
    out: List[str] = []
    for ref in (refs or []):
        if not isinstance(ref, str):
            continue
        if not _is_uri(ref):
            continue
        if ref not in out:
            out.append(ref)
    return out


def finding(rule_id: str, title: str, severity: str, path: str, line: int,
            *, category: str, evidence: str | None = None, cwe: str | None = None,
            end_line: int | None = None, refs: List[str] | None = None,
            fix: str | None = None, fix_prereqs: List[str] | None = None) -> Dict[str, Any]:
    sev = sev_to_text(severity)
    fac = default_factors(sev)
    return {
        "id": f"{rule_id}:{path}#L{line or 1}",
        "rule_id": rule_id or "GENERIC",
        "title": title.strip() if title else rule_id,
        "severity": sev,
        "risk_score": risk_score_from_factors(fac),
        "factors": fac,
        "confidence": "medium",
        "category": category,
        "cwe": cwe or "",
        "path": path or "",
        "line": int(line or 1),
        "end_line": int(end_line) if end_line else int(line or 1),
        "fingerprint": fingerprint(path or "", int(line or 1), evidence or ""),
        "owner": "",
        "status": "open",
        "tags": [],
        "evidence": evidence or "",
        "attack_vector": "",
        "business_impact": "",
        "technical_impact": "",
        "fix": fix or "",
        "fix_prereqs": fix_prereqs or [],
        "references": _normalize_refs(refs),
        "first_seen": datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
    }


def load_json(path: str) -> Any:
    try:
        with open(path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return None


def collect_artifacts(root: str) -> Dict[str, Any]:
    files = {}
    for name in os.listdir(root):
        p = os.path.join(root, name)
        if not os.path.isfile(p):
            continue
        key = name.lower()
        files[key] = load_json(p)
    return files


def from_bandit(data: Dict[str, Any]) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    for r in (data or {}).get('results', []) or []:
        out.append(
            finding(
                rule_id=r.get('test_id') or 'BANDIT',
                title=r.get('issue_text') or 'Bandit issue',
                severity=r.get('issue_severity') or 'Medium',
                path=r.get('filename') or '',
                line=int(r.get('line_number') or 1),
                category='config',
                evidence=(r.get('code') or '')[:400],
                refs=[r.get('more_info') or ''] if r.get('more_info') else [],
            )
        )
    return out


def from_semgrep(data: Dict[str, Any]) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    for r in (data or {}).get('results', []) or []:
        extra = r.get('extra') or {}
        start = (r.get('start') or {})
        end = (r.get('end') or {})
        out.append(
            finding(
                rule_id=r.get('check_id') or 'SEMGREP',
                title=(extra.get('message') or r.get('check_id') or 'Semgrep issue'),
                severity=extra.get('severity') or 'Medium',
                path=r.get('path') or '',
                line=int((start.get('line') or 1)),
                end_line=int((end.get('line') or start.get('line') or 1)),
                category='config',
                evidence=(extra.get('message') or '')[:400],
                refs=[u for u in (extra.get('metadata') or {}).get('references', []) if isinstance(u, str)],
            )
        )
    return out


def from_gitleaks(data: Dict[str, Any]) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    # Support v8/early formats (array of findings) and v8+ object with results
    findings = []
    if isinstance(data, list):
        findings = data
    elif isinstance(data, dict):
        findings = data.get('findings') or data.get('results') or []
    for f in findings or []:
        rule = f.get('RuleID') or f.get('RuleID') or 'GITLEAKS'
        file = f.get('File') or f.get('file') or f.get('Path') or ''
        line = int((f.get('StartLine') or f.get('line') or 1))
        desc = f.get('Description') or f.get('Description') or 'Secret detected'
        out.append(
            finding(rule_id=rule, title=desc, severity='High', path=file, line=line, category='secrets', evidence='[redacted]')
        )
    return out


def from_pip_audit(data: Any) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    # pip-audit JSON may be a dict with 'dependencies' (newer) or a list (older)
    pkgs: List[Dict[str, Any]] = []
    if isinstance(data, dict):
        deps = data.get('dependencies')
        if isinstance(deps, list):
            pkgs = [p for p in deps if isinstance(p, dict)]
    elif isinstance(data, list):
        pkgs = [p for p in data if isinstance(p, dict)]
    for pkg in pkgs:
        name = pkg.get('name') or 'python'
        for v in pkg.get('vulns', []) or []:
            rid = (v.get('id') or v.get('advisory') or 'PIP-AUDIT')
            sev = (v.get('severity') or 'Medium')
            title = f"{name} vulnerable: {rid}"
            refs = []
            for key in ('advisory', 'url', 'link'):
                val = v.get(key)
                if isinstance(val, str):
                    refs.append(val)
            fvs = v.get('fix_versions') or []
            fix_versions: List[str] = []
            if isinstance(fvs, list):
                fix_versions = [str(x) for x in fvs]
            out.append(
                finding(
                    rule_id=str(rid),
                    title=title,
                    severity=str(sev),
                    path='backend/requirements.txt',
                    line=1,
                    category='supply-chain',
                    refs=refs,
                    fix_prereqs=fix_versions,
                    fix=f"Upgrade to: {', '.join(fix_versions)}" if fix_versions else "",
                )
            )
    return out


def from_npm_audit(data: Dict[str, Any]) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    # Support auditReportVersion 2
    adv = (data or {}).get('vulnerabilities') or {}
    if adv:
        for name, v in adv.items():
            sev = v.get('severity') or 'Medium'
            rid = (v.get('via') or [{}])[0]
            rule = rid if isinstance(rid, str) else rid.get('source') or name
            title = (rid if isinstance(rid, str) else (rid.get('title') or name))
            out.append(
                finding(rule_id=str(rule), title=str(title), severity=sev, path='frontend/package.json', line=1, category='supply-chain')
            )
        return out
    # Older format
    for v in (data or {}).get('advisories', {}).values():
        ref = v.get('url')
        out.append(
            finding(
                rule_id=str(v.get('id') or 'NPM-AUDIT'),
                title=v.get('title') or 'npm advisory',
                severity=v.get('severity') or 'Medium',
                path='frontend/package.json',
                line=1,
                category='supply-chain',
                refs=[ref] if isinstance(ref, str) else [],
            )
        )
    return out


def from_trivy_config(data: Dict[str, Any]) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    for res in (data or {}).get('Results', []) or []:
        for m in res.get('Misconfigurations', []) or []:
            out.append(
                finding(
                    rule_id=m.get('ID') or 'TRIVY-CONFIG',
                    title=m.get('Title') or 'Misconfiguration',
                    severity=m.get('Severity') or 'Medium',
                    path=res.get('Target') or '',
                    line=1,
                    category='config',
                    evidence=(m.get('Message') or '')[:400],
                    refs=[m.get('PrimaryURL') or ''] if m.get('PrimaryURL') else [],
                )
            )
    return out


def from_safety(data: Any) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    if isinstance(data, dict) and data.get('issues'):
        issues = data.get('issues') or []
        for i in issues:
            # Newer safety format varies; keep generic
            rid = str(i.get('vulnerability_id') or i.get('advisory') or 'SAFETY')
            sev = i.get('severity') or 'Medium'
            pkg = i.get('package_name') or 'python'
            out.append(
                finding(rule_id=rid, title=f"{pkg} advisory {rid}", severity=sev, path='backend/requirements.txt', line=1, category='supply-chain')
            )
    return out


def main() -> None:
    ap = argparse.ArgumentParser(description='Aggregate security tool outputs into a unified findings file')
    ap.add_argument('--artifacts', default='security/artifacts', help='Directory with tool JSON outputs')
    ap.add_argument('--out', default='security/security-findings.json', help='Output JSON path')
    args = ap.parse_args()

    files = collect_artifacts(args.artifacts)
    results: List[Dict[str, Any]] = []

    if (j := files.get('bandit.json')): results += from_bandit(j)
    if (j := files.get('semgrep.json')): results += from_semgrep(j)
    if (j := files.get('gitleaks.json')): results += from_gitleaks(j)
    if (j := files.get('pip-audit.json')): results += from_pip_audit(j)
    if (j := files.get('npm-audit.json')): results += from_npm_audit(j)
    if (j := files.get('trivy-config.json')): results += from_trivy_config(j)
    if (j := files.get('safety.json')): results += from_safety(j)

    # Dedupe by canonical id (rule_id + path + line)
    uniq: Dict[str, Dict[str, Any]] = {}
    for r in results:
        key = f"{r.get('rule_id')}|{r.get('path')}|{r.get('line')}"
        if key in uniq:
            continue
        uniq[key] = r

    out = list(uniq.values())
    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    with open(args.out, 'w', encoding='utf-8') as f:
        json.dump(out, f, indent=2)
    print(f"Wrote {len(out)} findings to {args.out}")


if __name__ == '__main__':
    main()
