// Flat ESLint config. Intentionally light: this is a deliberately compact,
// hand-formatted codebase, so we lint for real defects (unused bindings, undefined
// refs, accidental globals) rather than style. Formatting is left to the author.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  // Build output, deps, and generated goldens are not linted.
  { ignores: ['statusline.js', 'node_modules/**', 'test/golden/**'] },

  // TypeScript source.
  {
    files: ['src/**/*.ts'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    rules: {
      // `_`-prefixed args/vars are intentional throwaways.
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // Untrusted JSON (stdin, theme files, settings) is read defensively; `any`
      // is sometimes the honest type at the boundary. Flag it, don't fail on it.
      '@typescript-eslint/no-explicit-any': 'warn',
      'prefer-const': 'error',
      // Matching/​stripping ANSI escape sequences (\x1b) is the whole job here.
      'no-control-regex': 'off',
    },
  },

  // Node test/harness/script JS (CommonJS, not bundled).
  {
    files: ['test/**/*.js', 'scripts/**/*.js'],
    extends: [js.configs.recommended],
    languageOptions: {
      sourceType: 'commonjs',
      globals: { require: 'readonly', module: 'writable', process: 'readonly', __dirname: 'readonly', console: 'readonly', Buffer: 'readonly' },
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-control-regex': 'off',
    },
  },
);
