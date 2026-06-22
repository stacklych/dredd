import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default [
  {
    ignores: [
      '.github/**',
      '.vscode/**',
      'build/**',
      'coverage/**',
      'docs/**',
      'site-packages/**',
    ],
  },
  js.configs.recommended,
  {
    linterOptions: { reportUnusedDisableDirectives: 'off' },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      // Using 'console' is perfectly okay for a Node.js CLI tool.
      'no-console': 'off',
      // Convention for exporting functions solely for unit tests.
      'no-underscore-dangle': 'off',
      'no-empty': 'off',
      'no-param-reassign': 'off',
      // Match the project's long-standing behavior: ignore unused catch bindings.
      'no-unused-vars': ['error', { args: 'after-used', caughtErrors: 'none' }],
    },
  },
  {
    files: ['bin/dredd'],
    languageOptions: { sourceType: 'module', globals: { ...globals.node } },
  },
  {
    files: ['test/**/*.js'],
    languageOptions: { globals: { ...globals.mocha } },
  },
  {
    files: ['features/**/*.js'],
    languageOptions: { globals: { ...globals.mocha } },
    rules: {
      'func-names': 'off',
      'no-unused-expressions': 'off',
    },
  },
  prettier,
];
