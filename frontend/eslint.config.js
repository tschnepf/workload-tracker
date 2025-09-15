// Minimal ESLint flat config (v9+) for TS/React project
// Focused on naming-discipline guardrails without noisy rules.

import tsParser from '@typescript-eslint/parser';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  {
    files: ['**/*.{ts,tsx,js,jsx}'],
    ignores: ['node_modules/**', 'dist/**', 'build/**'],
    plugins: { 'react-hooks': reactHooks },
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      // Naming discipline: avoid ad-hoc key mapping helpers; use serializers + typed models instead.
      'no-restricted-imports': ['warn', {
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
      // Ensure hooks usage is validated; align with CRA defaults
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
];
