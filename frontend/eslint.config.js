// Minimal ESLint flat config (v9+) for TS/React project
// Focused on naming-discipline guardrails without noisy rules.

import tsParser from '@typescript-eslint/parser';

export default [
  {
    files: ['**/*.{ts,tsx,js,jsx}'],
    ignores: ['node_modules/**', 'dist/**', 'build/**'],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 'latest',
      sourceType: 'module',
      ecmaFeatures: { jsx: true },
    },
    rules: {
      // Naming discipline: avoid ad-hoc key mapping helpers; use serializers + typed models instead.
      'no-restricted-imports': ['warn', {
        name: 'naming-discipline', // label only
        paths: [
          { name: 'camelcase-keys', message: 'Avoid ad-hoc key mapping; use serializers and typed models.' },
          { name: 'snakecase-keys', message: 'Avoid ad-hoc key mapping; use serializers and typed models.' },
          { name: 'humps', message: 'Avoid ad-hoc key mapping; use serializers and typed models.' },
          { name: 'change-case', message: 'Avoid ad-hoc key mapping; use serializers and typed models.' },
          { name: 'case-anything', message: 'Avoid ad-hoc key mapping; use serializers and typed models.' },
          { name: 'lodash/mapKeys', message: 'Avoid ad-hoc key mapping; use serializers and typed models.' },
        ],
        patterns: [
          'lodash/*mapKeys*',
        ],
      }],
      'no-restricted-syntax': ['warn',
        {
          selector: 'CallExpression[callee.name=/^(camelCase|snakeCase|camelize|decamelize|mapKeys|camelcaseKeys|snakecaseKeys)$/] ',
          message: 'Avoid ad-hoc key mapping; use serializers and typed models.',
        },
      ],
    },
  },
];

