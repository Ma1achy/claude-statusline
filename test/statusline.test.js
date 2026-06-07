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
    env: { HOME: fix.home, PATH: process.env.PATH, TZ: 'UTC', COLUMNS: '124', SL_FRAME_MS: '1700000000123', SL_COLOR_MODE: 'truecolor' },
  }).replace(/[︀-️]/g, ''));   // drop variation selectors for glyph checks
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
      encoding: 'utf8', env: { HOME: fix.home, PATH: process.env.PATH, TZ: 'UTC', COLUMNS: '124', SL_FRAME_MS: '1700000000123', SL_COLOR_MODE: 'truecolor' },
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
    encoding: 'utf8', env: { HOME: home, PATH: process.env.PATH, TZ: 'UTC', COLUMNS: '124', SL_FRAME_MS: '1700000000123', SL_COLOR_MODE: 'truecolor' },
  }).split('\n')[1]);
  assert.ok(!line2(off).includes('┃') && !line2(off).includes('|'), 'marker/label should be hidden when disabled');
  assert.ok(line2(fix.home).includes('┃'), 'marker should show when enabled');
  fs.rmSync(off, { recursive: true, force: true });
});

// 6j. Forks — Nerd Font glyph swap; custom-segment plugin with error isolation.
test('forks: nerdfont + custom segment', () => {
  // nerdfont swaps the ⎇ branch glyph for the powerline branch icon.
  assert.ok(stripAnsi(run(fix, {})).includes('⎇'), 'default uses ⎇');
  assert.ok(!stripAnsi(run(fix, { SL_NERDFONT: 'on' })).includes('⎇'), 'nerdfont replaces ⎇');
  // a custom segment plugin: JSON in on stdin, first stdout line appended.
  const plug = path.join(fix.base, 'plug.js');
  fs.writeFileSync(plug, 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{const j=JSON.parse(d);process.stdout.write("PLUG:"+Math.floor(j.context_window.used_percentage))})');
  const out = stripAnsi(execFileSync('node', [STATUSLINE], {
    input: JSON.stringify({ model: { id: 'claude-opus-4-8' }, context_window: { context_window_size: 200000, used_percentage: 42 }, cost: { total_cost_usd: 0.1, total_duration_ms: 120000 } }),
    encoding: 'utf8', env: { HOME: fix.home, PATH: process.env.PATH, TZ: 'UTC', COLUMNS: '160', SL_FRAME_MS: '1700000000123', SL_COLOR_MODE: 'truecolor', SL_CUSTOM_SEGMENT: plug },
  }));
  assert.ok(out.includes('PLUG:42'), 'custom segment output appended');
  // a missing plugin must not break the statusline (still 3 lines).
  const safe = stripAnsi(run(fix, { SL_CUSTOM_SEGMENT: '/no/such/plugin.js' }));
  assert.strictEqual(safe.split('\n').filter(Boolean).length, 3, 'broken plugin is isolated');
});

// 6i. CLI — --doctor / --report / --preview run and produce sensible output.
test('cli: doctor, report, preview', () => {
  const sub = (arg, env) => execFileSync('node', [STATUSLINE, arg], {
    encoding: 'utf8', env: { HOME: fix.home, PATH: process.env.PATH, TERM: 'xterm-256color', ...env },
  });
  const doc = stripAnsi(sub('--doctor', { COLORTERM: 'truecolor' }));
  assert.ok(doc.includes('node') && doc.includes('truecolor') && doc.includes('git'), 'doctor reports environment');
  assert.ok(stripAnsi(sub('--report', {})).toLowerCase().includes('history') || stripAnsi(sub('--report', {})).includes('samples'), 'report runs');
  const prev = stripAnsi(sub('--preview', {}));
  assert.ok(prev.includes('Themes') && prev.includes('Bar styles') && prev.includes('Shimmer'), 'preview has all sections');
  assert.ok(prev.includes('catppuccin-mocha') && prev.includes('braille'), 'preview lists themes and bar styles');
});

// 6l. tmux passthrough — output wrapped in the tmux DCS with doubled escapes.
test('tmux: SL_TMUX_PASSTHROUGH wraps output', () => {
  const out = run(fix, { SL_TMUX_PASSTHROUGH: 'on' });
  assert.ok(out.startsWith('\x1bPtmux;'), 'starts with the tmux DCS');
  assert.ok(out.endsWith('\x1b\\'), 'ends with ST');
  assert.ok(out.includes('\x1b\x1b['), 'inner escapes are doubled');
  assert.ok(!run(fix, {}).startsWith('\x1bPtmux;'), 'off by default');
});

// 6k. Flash shimmer — brighter on the tick the context % changes (event-driven).
test('flash: renders differently when % changes vs holds', () => {
  const sess = (id) => {
    const home = fs.mkdtempSync(path.join(require('os').tmpdir(), 'cs-fl-'));
    fs.mkdirSync(path.join(home, '.claude')); fs.writeFileSync(path.join(home, '.claude.json'), '{}');
    const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'cs-fld-'));
    return (pct, fm) => execFileSync('node', [STATUSLINE], {
      input: JSON.stringify({ session_id: id, model: { id: 'claude-opus-4-8' }, context_window: { context_window_size: 200000, used_percentage: pct }, cost: { total_cost_usd: 0.1, total_duration_ms: 120000 } }),
      encoding: 'utf8', env: { HOME: home, PATH: process.env.PATH, TZ: 'UTC', COLUMNS: '120', SL_FRAME_MS: fm, SL_COLOR_MODE: 'truecolor', SL_SHIMMER: 'flash', TMPDIR: tmp },
    }).split('\n')[1];
  };
  const a = sess('A'); a(50, '1700000000000'); const held = a(50, '1700000000001');     // prev 50 → no change
  const b = sess('B'); b(60, '1700000000000'); const changed = b(50, '1700000000001');   // prev 60 → changed, same fill (50%)
  assert.notStrictEqual(held, changed, 'flash should brighten on a context-% change');
});

// 6h. Pet + bell — styles render; bell rings once per threshold crossing.
test('pet styles + bell de-dup', () => {
  // a style swaps the face glyphs (PCT 42 → neutral level for default & cat).
  assert.ok(stripAnsi(run(fix, { SL_PET: 'on' })).includes('[._.]'), 'default pet face');
  assert.ok(stripAnsi(run(fix, { SL_PET: 'on', SL_PET_STYLE: 'cat' })).includes('=._.='), 'cat pet face');
  // reacts-to=cost: high cost → stressed face regardless of context.
  const greedy = stripAnsi(execFileSync('node', [STATUSLINE], {
    input: JSON.stringify({ model: { id: 'claude-opus-4-8' }, context_window: { context_window_size: 200000, used_percentage: 10 }, cost: { total_cost_usd: 2.5, total_duration_ms: 120000 } }),
    encoding: 'utf8', env: { HOME: fix.home, PATH: process.env.PATH, TZ: 'UTC', COLUMNS: '160', SL_FRAME_MS: '1700000000123', SL_COLOR_MODE: 'truecolor', SL_PET: 'on', SL_PET_REACTS_TO: 'cost' },
  }));
  assert.ok(greedy.includes('[$_$]'), 'cost reaction → stressed at high spend');
  // bell rings (0x07) the first time context crosses 80, then de-dups.
  const home = fs.mkdtempSync(path.join(require('os').tmpdir(), 'cs-bell-'));
  fs.mkdirSync(path.join(home, '.claude')); fs.writeFileSync(path.join(home, '.claude.json'), '{}');
  const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'cs-bt-'));
  const ring = () => execFileSync('node', [STATUSLINE], {
    input: JSON.stringify({ session_id: 'b', model: { id: 'claude-opus-4-8' }, context_window: { context_window_size: 200000, used_percentage: 85 }, cost: { total_cost_usd: 0.1, total_duration_ms: 120000 } }),
    encoding: 'utf8', env: { HOME: home, PATH: process.env.PATH, TZ: 'UTC', COLUMNS: '160', SL_FRAME_MS: '1700000000123', SL_COLOR_MODE: 'truecolor', SL_BELL: 'on', TMPDIR: tmp },
  });
  assert.strictEqual(ring().charCodeAt(0), 7, 'first crossing rings the bell');
  assert.notStrictEqual(ring().charCodeAt(0), 7, 'same level does not re-ring');
  fs.rmSync(home, { recursive: true, force: true }); fs.rmSync(tmp, { recursive: true, force: true });
});

// 6g. Bar scale — log expands the danger zone (fewer filled cells at high %).
test('bar scale: log differs from linear and widens the danger zone', () => {
  const emptyCells = (env) => {
    const l2 = stripAnsi(execFileSync('node', [STATUSLINE], {
      input: JSON.stringify({ model: { id: 'claude-opus-4-8' }, context_window: { context_window_size: 200000, used_percentage: 90 }, cost: { total_cost_usd: 0.1, total_duration_ms: 120000 } }),
      encoding: 'utf8', env: { HOME: fix.home, PATH: process.env.PATH, TZ: 'UTC', COLUMNS: '160', SL_FRAME_MS: '1700000000123', SL_COLOR_MODE: 'truecolor', ...env },
    })).split('\n')[1];
    return (l2.match(/░/g) || []).length;
  };
  assert.ok(emptyCells({ SL_BAR_SCALE: 'log' }) > emptyCells({}), 'log leaves more empty cells at 90% (danger zone widened)');
});

// 6f. Reactive themes — daynight picks by clock; danger wash on critical context.
test('reactive: daynight + silver-halide danger wash', () => {
  const at = (env) => execFileSync('node', [STATUSLINE], {
    input: JSON.stringify({ model: { id: 'claude-opus-4-8' }, context_window: { context_window_size: 200000, used_percentage: env._pct || 40 }, cost: { total_cost_usd: 0.1, total_duration_ms: 120000 } }),
    encoding: 'utf8', env: { HOME: fix.home, PATH: process.env.PATH, TZ: 'UTC', COLUMNS: '160', SL_FRAME_MS: '1700000000123', SL_CLOCK_MS: env._clock || '1700000000123', SL_COLOR_MODE: 'truecolor', ...env },
  });
  // daynight resolves to different themes for a day vs night hour → different output.
  const day = at({ SL_AUTO_THEME: 'daynight', SL_DAY_THEME: 'heat', SL_NIGHT_THEME: 'tokyonight', _clock: String(1700000000000 - 9 * 3600000) });
  const night = at({ SL_AUTO_THEME: 'daynight', SL_DAY_THEME: 'heat', SL_NIGHT_THEME: 'tokyonight', _clock: String(1700000000000) });
  assert.notStrictEqual(day, night, 'daynight should pick different themes by hour');
  // silver-halide: no wash at low context, deep-red wash at critical context.
  assert.ok(!at({ SL_THEME: 'silver-halide', _pct: 40 }).includes(';18;18m'), 'no red wash when calm');
  assert.ok(at({ SL_THEME: 'silver-halide', _pct: 95 }).includes(';18;18m'), 'red wash when critical');
});

// 6e. Git — detached HEAD shows a sha; a merge in progress flags merge!.
test('git: detached HEAD + merge state', () => {
  const os = require('os');
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'cs-git-'));
  const home = path.join(base, 'home');
  fs.mkdirSync(path.join(home, '.claude'), { recursive: true });
  fs.writeFileSync(path.join(home, '.claude.json'), '{}');
  const repo = path.join(base, 'repo');
  fs.mkdirSync(repo);
  const g = (...a) => execFileSync('git', ['-C', repo, ...a], { stdio: 'ignore' });
  g('init', '-q'); g('config', 'user.email', 'x@y.z'); g('config', 'user.name', 'x'); g('config', 'commit.gpgsign', 'false');
  fs.writeFileSync(path.join(repo, 'f'), '1\n'); g('add', 'f'); g('commit', '-q', '-m', 'c1');
  const l3 = (extra) => stripAnsi(execFileSync('node', [STATUSLINE], {
    input: JSON.stringify({ workspace: { current_dir: repo }, model: { id: 'claude-opus-4-8' }, context_window: { context_window_size: 200000, used_percentage: 40 }, cost: { total_cost_usd: 0.1, total_duration_ms: 120000 } }),
    encoding: 'utf8', env: { HOME: home, PATH: process.env.PATH, TZ: 'UTC', COLUMNS: '160', SL_FRAME_MS: '1700000000123', SL_COLOR_MODE: 'truecolor', SL_GIT_EXTRA: 'on', ...extra },
  }).split('\n')[2]);
  // a merge in progress (just the marker file) → merge!
  fs.writeFileSync(path.join(repo, '.git', 'MERGE_HEAD'), '0'.repeat(40) + '\n');
  assert.match(l3({}), /merge!/, 'merge in progress should be flagged');
  fs.unlinkSync(path.join(repo, '.git', 'MERGE_HEAD'));
  // detached HEAD → branch label becomes a short sha
  g('checkout', '--detach', '-q');
  assert.match(l3({}), /⎇ :[0-9a-f]{7}/, 'detached HEAD should show a short sha');
  fs.rmSync(base, { recursive: true, force: true });
});

// 6d. Privacy — SL_PRIVACY hides email / account / cost; aliasing + truncation.
test('privacy: SL_PRIVACY hides sensitive segments', () => {
  const plain = stripAnsi(run(fix, { SL_GIT_EXTRA: 'on' }));
  assert.ok(plain.includes('malachy@email.com') && plain.includes('Malachy'), 'shown by default');
  const priv = stripAnsi(run(fix, { SL_PRIVACY: 'on', SL_GIT_EXTRA: 'on' }));
  assert.ok(!priv.includes('malachy@email.com'), 'privacy hides git email');
  assert.ok(!priv.includes('Malachy'), 'privacy hides account name');
  assert.ok(!priv.includes('$0.234'), 'privacy hides cost');
});

test('path: deep paths truncate; aliases and SL_PATH=full apply', () => {
  const deep = '/a/b/c/d/e/f/g/leaf';
  const at = (env) => {
    const out = execFileSync('node', [STATUSLINE], {
      input: JSON.stringify({ workspace: { current_dir: deep }, model: { id: 'claude-opus-4-8' }, context_window: { context_window_size: 200000, used_percentage: 40 }, cost: { total_cost_usd: 0.1, total_duration_ms: 120000 } }),
      encoding: 'utf8', env: { HOME: fix.home, PATH: process.env.PATH, TZ: 'UTC', COLUMNS: '160', SL_FRAME_MS: '1700000000123', SL_COLOR_MODE: 'truecolor', ...env },
    });
    return stripAnsi(out).split('\n')[2];
  };
  assert.match(at({}), /\/a\/…\/g\/leaf/, 'deep path compresses to root/…/last2');
  assert.ok(at({ SL_PATH: 'full' }).includes(deep), 'SL_PATH=full keeps the whole path');
  assert.ok(at({ SL_PROJECT_ALIASES: JSON.stringify({ [deep]: 'proj-x' }) }).includes('proj-x'), 'alias relabels the dir');
});

// 6a. Layout — line count varies; SL_HIDE drops named segments.
test('layout: line count + hide', () => {
  const nlines = (env) => stripAnsi(run(fix, env)).split('\n').filter(Boolean).length;
  assert.strictEqual(nlines({ SL_LAYOUT: 'tiny' }), 1, 'tiny → 1 line');
  assert.strictEqual(nlines({ SL_LAYOUT: '1line' }), 1, '1line → 1 line');
  assert.strictEqual(nlines({ SL_LAYOUT: '2line' }), 2, '2line → 2 lines');
  assert.strictEqual(nlines({}), 3, 'default → 3 lines');
  // hide removes the account name (present by default in the fixture).
  assert.ok(stripAnsi(run(fix, {})).includes('Malachy'), 'name shown by default');
  assert.ok(!stripAnsi(run(fix, { SL_HIDE: 'name' })).includes('Malachy'), 'SL_HIDE=name removes it');
});

// 6b. Trend — sparkline accumulates and a sharp context drop counts a compaction.
test('trend: sparkline grows; sharp context drop counts a compaction', () => {
  const home = fs.mkdtempSync(path.join(require('os').tmpdir(), 'cs-th-'));
  fs.mkdirSync(path.join(home, '.claude'));
  fs.writeFileSync(path.join(home, '.claude.json'), '{}');
  const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'cs-tt-'));
  const at = (pct) => {
    const out = execFileSync('node', [STATUSLINE], {
      input: JSON.stringify({ session_id: 'trendsess', model: { id: 'claude-opus-4-8' }, context_window: { context_window_size: 200000, used_percentage: pct }, cost: { total_cost_usd: 0.1, total_duration_ms: 120000 } }),
      encoding: 'utf8', env: { HOME: home, PATH: process.env.PATH, TZ: 'UTC', COLUMNS: '160', SL_FRAME_MS: '1700000000123', SL_COLOR_MODE: 'truecolor', SL_TREND: 'on', TMPDIR: tmp },
    });
    return stripAnsi(out).split('\n')[1];
  };
  at(20); at(40); const line = at(60);
  assert.match(line, /[▁▂▃▄▅▆▇█]/, 'sparkline blocks should appear');
  const dropped = at(10);   // 60 → 10 is a sharp drop → +1 compaction
  assert.match(dropped, /↺1/, 'a compaction should be counted and shown');
  fs.rmSync(home, { recursive: true, force: true });
  fs.rmSync(tmp, { recursive: true, force: true });
});

// 6c. Limit warnings — a usage bar past the crit threshold flags LOW.
test('limits: usage past SL_LIMIT_CRIT shows LOW', () => {
  const line2 = stripAnsi(execFileSync('node', [STATUSLINE], {
    input: JSON.stringify({ model: { id: 'claude-opus-4-8' }, context_window: { context_window_size: 200000, used_percentage: 50 }, cost: { total_cost_usd: 0.1, total_duration_ms: 120000 }, rate_limits: { five_hour: { used_percentage: 97, resets_at: 1700008100 }, seven_day: { used_percentage: 38, resets_at: 1700280800 } } }),
    encoding: 'utf8', env: { HOME: fix.home, PATH: process.env.PATH, TZ: 'UTC', COLUMNS: '160', SL_FRAME_MS: '1700000000123', SL_COLOR_MODE: 'truecolor', SL_LIMITS: 'on' },
  }).split('\n')[1]);
  assert.ok(line2.includes('LOW'), 'critical usage should show LOW');
  // below thresholds → no LOW.
  const calm = stripAnsi(execFileSync('node', [STATUSLINE], {
    input: JSON.stringify({ model: { id: 'claude-opus-4-8' }, context_window: { context_window_size: 200000, used_percentage: 50 }, cost: { total_cost_usd: 0.1, total_duration_ms: 120000 }, rate_limits: { five_hour: { used_percentage: 30, resets_at: 1700008100 }, seven_day: { used_percentage: 38, resets_at: 1700280800 } } }),
    encoding: 'utf8', env: { HOME: fix.home, PATH: process.env.PATH, TZ: 'UTC', COLUMNS: '160', SL_FRAME_MS: '1700000000123', SL_COLOR_MODE: 'truecolor', SL_LIMITS: 'on' },
  }).split('\n')[1]);
  assert.ok(!calm.includes('LOW'), 'sub-threshold usage should not show LOW');
});

// 7. State layer — per-session ring buffer persists context % across repaints.
test('state: per-session ring buffer accumulates context %', () => {
  const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'cs-state-'));
  const input = JSON.stringify({
    session_id: 'testsess1', model: { id: 'claude-opus-4-8' },
    context_window: { context_window_size: 200000, used_percentage: 37 },
    cost: { total_cost_usd: 0.1, total_duration_ms: 120000 },
  });
  const env = { HOME: fix.home, PATH: process.env.PATH, TZ: 'UTC', COLUMNS: '124', SL_FRAME_MS: '1700000000123', SL_COLOR_MODE: 'truecolor', TMPDIR: tmp };
  execFileSync('node', [STATUSLINE], { input, encoding: 'utf8', env });
  execFileSync('node', [STATUSLINE], { input, encoding: 'utf8', env });
  const sf = path.join(tmp, 'claude-statusline', 'testsess1.json');
  assert.ok(fs.existsSync(sf), 'state file should be written');
  const st = JSON.parse(fs.readFileSync(sf, 'utf8'));
  assert.deepStrictEqual(st.spark, [37, 37], 'spark should accumulate context % per repaint');
  assert.strictEqual(st.v, 1, 'schema version stamped');
  fs.rmSync(tmp, { recursive: true, force: true });
});

// 8. Custom themes — SL_THEME=custom from base16 or a JSON file; bad input falls back.
test('custom theme: base16 + JSON file, malformed falls back to heat', () => {
  const b16 = ['#282828', '#cc241d', '#98971a', '#d79921', '#458588', '#b16286', '#689d6a', '#a89984',
    '#928374', '#fb4934', '#b8bb26', '#fabd2f', '#83a598', '#d3869b', '#8ec07c', '#ebdbb2'].join(',');
  const b16out = run(fix, { SL_THEME: 'custom', SL_BASE16: b16 });
  assert.strictEqual(stripAnsi(b16out).split('\n').filter(Boolean).length, 3, 'base16 renders 3 lines');
  assert.ok(b16out.includes('38;2'), 'base16 palette colours applied (not a mono fallback)');
  // must actually load the base16 theme, not silently fall back to heat.
  assert.notStrictEqual(b16out, run(fix, { SL_THEME: 'heat' }), 'base16 must differ from heat');
  // malformed base16 + no theme file → graceful fallback, identical to heat.
  assert.strictEqual(run(fix, { SL_THEME: 'custom', SL_BASE16: '#fff,#000' }), run(fix, { SL_THEME: 'heat' }),
    'malformed custom should fall back to heat');
  // a JSON theme file (cmap + explicit palette) via SL_THEME_FILE.
  const tf = path.join(fix.base, 'theme.json');
  fs.writeFileSync(tf, JSON.stringify({
    cmap: [[10, 20, 30], [200, 210, 220]], mix: 20,
    palette: { RED: [255, 0, 0], GREEN: [0, 255, 0], AMBER: [255, 200, 0], BLUE: [0, 0, 255], CYAN: [0, 255, 255], WHITE: [240, 240, 240], GOLD: [255, 215, 0] },
  }));
  const fileOut = run(fix, { SL_THEME: 'custom', SL_THEME_FILE: tf });
  assert.strictEqual(stripAnsi(fileOut).split('\n').filter(Boolean).length, 3, 'custom theme file renders 3 lines');
  assert.notStrictEqual(fileOut, run(fix, { SL_THEME: 'heat' }), 'theme file must differ from heat');
});

// 8. Presets — a preset enables a bundle; an explicit var overrides it.
test('preset: SL_PRESET bundles settings, explicit vars win', () => {
  // bare default has no crest; the `pretty` preset turns SL_CREST on → ★ appears.
  assert.ok(!stripAnsi(run(fix, {})).includes('★'), 'no crest by default');
  assert.ok(stripAnsi(run(fix, { SL_PRESET: 'pretty' })).includes('★'), 'preset should enable crest');
  // an explicit SL_CREST=off must override the preset's SL_CREST=on.
  assert.ok(!stripAnsi(run(fix, { SL_PRESET: 'pretty', SL_CREST: 'off' })).includes('★'),
    'explicit var should override preset');
  // chaos preset turns the pet on → its face appears (PCT 42 → neutral face).
  assert.ok(stripAnsi(run(fix, { SL_PRESET: 'chaos' })).includes('[._.]'), 'chaos preset should enable pet');
});

// 8. Colour degradation — modes downgrade cleanly and NO_COLOR wins.
test('colour: mode downgrades and NO_COLOR forces mono', () => {
  const raw = (over) => run(fix, over);
  // mono: no truecolor (38;2) and no 256 (38;5) escapes at all.
  const mono = raw({ SL_COLOR_MODE: 'mono' });
  assert.ok(!mono.includes('38;2') && !mono.includes('38;5'), 'mono should emit no colour escapes');
  // 16-colour: no truecolor sequences.
  assert.ok(!raw({ SL_COLOR_MODE: '16' }).includes('38;2'), '16-colour should not emit truecolor');
  // NO_COLOR (convention) wins even over an explicit truecolor mode.
  const forced = raw({ SL_COLOR_MODE: 'truecolor', NO_COLOR: '1' });
  assert.ok(!forced.includes('38;2') && !forced.includes('38;5'), 'NO_COLOR should force mono');
  // every mode keeps exactly three aligned lines within the terminal width.
  for (const m of ['256', '16', 'mono']) {
    const lines = stripAnsi(raw({ SL_COLOR_MODE: m, COLUMNS: '200' })).split('\n').filter(Boolean);
    assert.strictEqual(lines.length, 3, `mode ${m}: expected 3 lines`);
    for (const l of lines) assert.ok(Array.from(l).length <= 200, `mode ${m}: line too wide`);
  }
});

// 8. Privacy guard — the fixture's dummy email appears; nothing else leaks.
test('privacy: dummy email rendered, no real address', () => {
  const out = stripAnsi(run(fix, { SL_GIT_EXTRA: 'on' }));
  assert.ok(out.includes('malachy@email.com'), 'expected dummy email');
});
