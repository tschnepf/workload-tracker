// Minimal ESLint flat config (v9+) for TS/React project
// Focused on naming-discipline guardrails without noisy rules.

import tsParser from '@typescript-eslint/parser';
import reactHooks from 'eslint-plugin-react-hooks';
import importPluginX from 'eslint-plugin-import-x';

export default [
  {
    files: ['**/*.{ts,tsx,js,jsx}'],
    ignores: ['node_modules/**', 'dist/**', 'build/**'],
    plugins: { 'react-hooks': reactHooks, 'import-x': importPluginX },
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    settings: {
      // Ensure ESLint resolves TS path aliases like '@/*'
      // Keep both keys for compatibility with import and import-x ecosystems
      'import/resolver': {
        typescript: { project: 'frontend/tsconfig.json' },
      },
      'import-x/resolver': {
        typescript: { project: 'frontend/tsconfig.json' },
      },
    },
    rules: {
      // Encoding/whitespace safety
      'no-irregular-whitespace': 'error',
      'unicode-bom': ['error', 'never'],
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
      // Keep cycles as a soft warning during refactors (ESLint v9 compatible plugin)
      'import-x/no-cycle': 'warn',
      // Light guardrails (non-blocking during refactor)
      'max-lines': ['warn', { max: 400, skipBlankLines: true, skipComments: true }],
      'max-lines-per-function': ['warn', { max: 200, skipBlankLines: true, skipComments: true, IIFEs: true }],
      'complexity': ['warn', { max: 10 }],
      'max-depth': ['warn', 3],
    },
  },
];
