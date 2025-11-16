from __future__ import annotations

import json
from pathlib import Path

from django.core.exceptions import ValidationError
from jsonschema import Draft7Validator
from croniter import croniter

SCHEMA_PATH = Path(__file__).resolve().parent / 'rule_schema.json'


def _validator() -> Draft7Validator:
    schema = json.loads(SCHEMA_PATH.read_text())
    return Draft7Validator(schema)


def validate_rule_config(provider_key: str, config: dict):
    validator = _validator()
    errors = sorted(validator.iter_errors(config), key=lambda e: e.path)
    if errors:
        messages = '; '.join(f"{'/'.join(map(str, err.path))}: {err.message}" for err in errors)
        raise ValidationError(f'Invalid rule config: {messages}')
    interval = config.get('intervalMinutes')
    cron_expr = config.get('cronExpression')
    if not interval and not cron_expr:
        raise ValidationError('Either intervalMinutes or cronExpression must be provided.')
    if cron_expr:
        try:
            croniter(cron_expr)
        except Exception as exc:
            raise ValidationError(f'Invalid cronExpression: {exc}') from exc
    if provider_key == 'bqe' and config.get('includeSubprojects'):
        raise ValidationError('BQE integrations must not include subprojects.')
