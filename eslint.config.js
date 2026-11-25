import js from '@eslint/js';
import globals from 'globals';
import noDirectDomMutation from './eslint-rules/no-direct-dom-mutation.js';

const dostupno = { rules: { 'no-direct-dom-mutation': noDirectDomMutation } };

export default [
  { ignores: ['node_modules/', 'test/audit-report/', '.agents/', 'openspec/'] },
  js.configs.recommended,
  {
    // Extension code: classic browser scripts sharing window.Dostupno.
    files: ['extension/**/*.js'],
    languageOptions: {
      sourceType: 'script',
      globals: { ...globals.browser, ...globals.webextensions },
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
  {
    files: ['extension/src/fixers/**/*.js'],
    plugins: { dostupno },
    rules: { 'dostupno/no-direct-dom-mutation': 'error' },
  },
  {
    // Node tooling: tests, scripts, lint rules.
    files: ['test/**/*.mjs', 'scripts/**/*.mjs', 'eslint-rules/**/*.js', 'eslint.config.js', '.claude/hooks/**/*.mjs'],
    languageOptions: { sourceType: 'module', globals: { ...globals.node } },
  },
  {
    // Playwright evaluate() callbacks run in the page or the extension's service worker.
    files: ['test/**/*.mjs', 'scripts/**/*.mjs'],
    languageOptions: { globals: { ...globals.browser, ...globals.webextensions } },
  },
];
