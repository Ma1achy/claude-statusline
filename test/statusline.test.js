// Golden snapshot + smoke + alignment tests, run against the BUILT statusline.js.
//   npm test   (builds first, then `node --test`)
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { setupFixture, cleanup, run, CASES } = require('./harness');

const GOLD = path.join(__dirname, 'golden');
const fix = setupFixture();
test.after(() => cleanup(fix));

const stripAnsi = (s) => s.replace(/\x1b\[[0-9;]*m/g, '');

// 1. Golden snapshots — output must match the committed reference byte-for-byte.
for (const [name, env] of CASES) {
  test(`golden: ${name}`, () => {
    const golden = fs.readFileSync(path.join(GOLD, `${name}.txt`), 'utf8');
    assert.strictEqual(run(fix, env), golden);
  });
}

// 2. Alignment — at a width that fits the content, no line overflows (catches
//    width-math regressions / runaway lines). The busiest case is `loaded`.
test('alignment: every line fits a wide terminal', () => {
  const out = run(fix, { ...CASES.find(([n]) => n === 'loaded')[1], COLUMNS: '200' });
  const lines = out.split('\n').filter(Boolean);
  assert.strictEqual(lines.length, 3, 'expected exactly 3 lines');
  for (const line of lines) {
    assert.ok(Array.from(stripAnsi(line)).length <= 200, `line too wide: ${stripAnsi(line)}`);
  }
});

// 3. Smoke — each opt-in toggle adds its expected marker without errors.
test('toggles: pet / crest / git-extras / cost-flair appear when enabled', () => {
  const plain = stripAnsi(run(fix, {}));
  assert.ok(!plain.includes('[^_^]') && !plain.includes('★'), 'plain should have no pet/crest');
  assert.ok(stripAnsi(run(fix, { SL_PET: 'on' })).includes('[._.]'), 'pet face missing');
  assert.ok(stripAnsi(run(fix, { SL_CREST: 'on' })).includes('★'), 'crest missing');
  const extra = stripAnsi(run(fix, { SL_GIT_EXTRA: 'on' }));
  assert.ok(extra.includes('[feat]') && extra.includes('s:1') && extra.includes('?1'), 'git extras missing');
  assert.ok(stripAnsi(run(fix, { SL_COST_FLAIR: 'on' })).includes('$ $0.234'), 'cost flair missing');
});

// 4. Privacy guard — the fixture's dummy email appears; nothing else leaks.
test('privacy: dummy email rendered, no real address', () => {
  const out = stripAnsi(run(fix, { SL_GIT_EXTRA: 'on' }));
  assert.ok(out.includes('malachy@email.com'), 'expected dummy email');
});
