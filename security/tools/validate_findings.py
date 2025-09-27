#!/usr/bin/env python3
import json
import sys
from jsonschema import Draft202012Validator

def main() -> int:
    with open('security/schema/security-findings.schema.json', 'r', encoding='utf-8') as f:
        schema = json.load(f)
    # Use utf-8-sig to tolerate BOM if present
    with open('security/security-findings.json', 'r', encoding='utf-8-sig') as f:
        data = json.load(f)
    Draft202012Validator.check_schema(schema)
    validator = Draft202012Validator(schema)
    errors = sorted(validator.iter_errors(data), key=lambda e: e.path)
    if errors:
        print(f'Validation failed with {len(errors)} errors:')
        for e in errors[:50]:
            path = '/'.join(map(str, e.path))
            print(f'- {path}: {e.message}')
        return 1
    print('Findings JSON validates against schema (Draft 2020-12).')
    return 0

if __name__ == '__main__':
    sys.exit(main())
