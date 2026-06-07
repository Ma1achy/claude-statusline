// Unit tests for config.ts. Importing config must have no I/O side effect (branch
// auto-theming is deferred to resolveBranchTheme() at render time), and the reset
// hook must re-read the environment.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cfg, resetConfigForTest, resolveBranchTheme } from '../../src/config';

test('resolveBranchTheme is a no-op unless autoTheme is "branch"', () => {
  // Default config (no autoTheme) → returns false and never touches git.
  assert.equal(cfg.autoTheme, '');
  assert.equal(resolveBranchTheme({ workspace: { current_dir: '/nope' } }), false);
});

test('resetConfigForTest re-reads SL_COLOR_MODE into the live cfg object', () => {
  const prev = process.env.SL_COLOR_MODE;
  process.env.SL_COLOR_MODE = 'mono';
  resetConfigForTest();
  assert.equal(cfg.colorMode, 'mono');
  if (prev === undefined) delete process.env.SL_COLOR_MODE; else process.env.SL_COLOR_MODE = prev;
  resetConfigForTest();
});
