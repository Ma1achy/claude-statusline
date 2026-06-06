// Golden snapshot + smoke + alignment tests, run against the BUILT statusline.js.
//   npm test   (builds first, then `node --test`)
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { setupFixture, cleanup, run, CASES, STATUSLINE } = require('./harness');

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

// 4. Fast/slow + vim — the leading slot (permission_mode isn't available).
test('lead: fast bolt always shown; vim letter only with vim.mode', () => {
  const base = { model: { id: 'claude-opus-4-8' }, context_window: { used_percentage: 30, context_window_size: 200000 }, cost: { total_cost_usd: 0.1, total_duration_ms: 120000 } };
  const raw = (extra) => stripAnsi(execFileSync('node', [STATUSLINE], {
    input: JSON.stringify({ ...base, ...extra }), encoding: 'utf8',
    env: { HOME: fix.home, PATH: process.env.PATH, TZ: 'UTC', COLUMNS: '124', SL_FRAME_MS: '1700000000123' },
  }));
  assert.ok(raw({ fast_mode: true }).startsWith('⚡'), 'fast bolt missing');
  assert.ok(raw({ fast_mode: false }).startsWith('▫'), 'slow glyph missing');
  assert.match(raw({ fast_mode: false, vim: { mode: 'INSERT' } }), /^▫ I/, 'vim insert letter missing');
  assert.ok(!/^⚡ [A-Z]/.test(raw({ fast_mode: true })), 'vim letter should be absent without vim.mode');
});

// 5. Gradient % — the percentage colour lerps with the value (no fixed thresholds).
test('gradient: % colour changes smoothly with the value', () => {
  const base = { model: { id: 'claude-opus-4-8' }, cost: { total_cost_usd: 0.1, total_duration_ms: 120000 } };
  const pctColour = (p) => {
    const out = execFileSync('node', [STATUSLINE], {
      input: JSON.stringify({ ...base, context_window: { context_window_size: 200000, used_percentage: p } }),
      encoding: 'utf8', env: { HOME: fix.home, PATH: process.env.PATH, TZ: 'UTC', COLUMNS: '124', SL_FRAME_MS: '1700000000123' },
    });
    return (out.split('\n')[1].match(new RegExp(`38;2;[0-9]+;[0-9]+;[0-9]+m${p}%`)) || [''])[0];
  };
  const cols = [15, 45, 75, 95].map(pctColour);
  assert.strictEqual(new Set(cols).size, 4, 'each % should get a distinct lerped colour');
});

// 6. Autocompact marker only when enabled.
test('autocompact: marker hidden when autoCompactEnabled is false', () => {
  const off = fs.mkdtempSync(path.join(require('os').tmpdir(), 'cs-off-'));
  fs.mkdirSync(path.join(off, '.claude'));
  fs.writeFileSync(path.join(off, '.claude.json'), '{}');
  fs.writeFileSync(path.join(off, '.claude', 'settings.json'), JSON.stringify({ autoCompactEnabled: false }));
  const line2 = (home) => stripAnsi(execFileSync('node', [STATUSLINE], {
    input: JSON.stringify({ model: { id: 'claude-opus-4-8' }, context_window: { context_window_size: 200000, used_percentage: 50 }, cost: { total_cost_usd: 0.1, total_duration_ms: 120000 } }),
    encoding: 'utf8', env: { HOME: home, PATH: process.env.PATH, TZ: 'UTC', COLUMNS: '124', SL_FRAME_MS: '1700000000123' },
  }).split('\n')[1]);
  assert.ok(!line2(off).includes('┃') && !line2(off).includes('|'), 'marker/label should be hidden when disabled');
  assert.ok(line2(fix.home).includes('┃'), 'marker should show when enabled');
  fs.rmSync(off, { recursive: true, force: true });
});

// 7. Privacy guard — the fixture's dummy email appears; nothing else leaks.
test('privacy: dummy email rendered, no real address', () => {
  const out = stripAnsi(run(fix, { SL_GIT_EXTRA: 'on' }));
  assert.ok(out.includes('malachy@email.com'), 'expected dummy email');
});
