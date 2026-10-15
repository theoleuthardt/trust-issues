import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import { defineConfig } from 'eslint/config';

const nondeterministicApis = [
  { object: 'Math', property: 'random', message: 'The simulation must be deterministic.' },
  { object: 'Date', property: 'now', message: 'The simulation must be deterministic.' },
  { object: 'performance', property: 'now', message: 'The simulation must be deterministic.' },
];

export default defineConfig([
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      'backend/**',
      'e2e/test-results/**',
      'e2e/playwright-report/**',
    ],
  },
  {
    files: ['**/*.ts'],
    extends: [js.configs.recommended, tseslint.configs.strict, tseslint.configs.stylistic],
    rules: {
      eqeqeq: 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    files: ['packages/sim/src/**/*.ts'],
    ignores: ['**/*.test.ts'],
    languageOptions: { globals: {} },
    rules: {
      'no-restricted-properties': ['error', ...nondeterministicApis],
      'no-restricted-globals': [
        'error',
        { name: 'window', message: 'The simulation must not touch the DOM.' },
        { name: 'document', message: 'The simulation must not touch the DOM.' },
        { name: 'Date', message: 'The simulation must be deterministic.' },
        { name: 'performance', message: 'The simulation must be deterministic.' },
        { name: 'setTimeout', message: 'The simulation must be deterministic.' },
        { name: 'setInterval', message: 'The simulation must be deterministic.' },
        { name: 'requestAnimationFrame', message: 'The simulation must be deterministic.' },
      ],
      'no-restricted-imports': ['error', { patterns: ['phaser', 'phaser/*'] }],
    },
  },
  {
    files: ['frontend/**/*.ts', 'e2e/**/*.ts'],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ['verifier/**/*.ts', '*.config.{js,ts}', '**/*.config.{js,ts}'],
    languageOptions: { globals: globals.node },
  },
]);
