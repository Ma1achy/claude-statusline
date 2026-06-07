// Guard: every theme in THEMES_DATA must have a golden snapshot, so a new theme
// can't be added without test coverage (it would otherwise render but never be
// checked). `high-contrast` and `showcase` are exercised by the accessible /
// style-showcase cases instead of a plain theme-* golden.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import { THEMES_DATA } from '../../src/themes.data';

const GOLD = path.join(process.cwd(), 'test', 'golden');
const EXEMPT = new Set(['high-contrast', 'showcase']);

test('every theme has a golden snapshot (or is exempt)', () => {
  const missing = Object.keys(THEMES_DATA)
    .filter((t) => !EXEMPT.has(t) && !fs.existsSync(path.join(GOLD, `theme-${t}.txt`)));
  assert.deepEqual(missing, [], `themes missing golden coverage: ${missing.join(', ')}`);
});
