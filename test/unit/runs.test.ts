// Unit tests for run progress: the file format → Run normalisation (src/runs.ts),
// the staleness/linger rules on an injected clock and pid probe, log-tail parsing,
// number formatting, the --run merge, the bounded fs scan + cache (src/io/runs.ts),
// the `runs` config reader, and the width-aware line renderer (segments/runs.ts).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { cfg, resetConfigForTest } from '../../src/config';
import { printLen, stripAnsi } from '../../src/ansi';
import {
  resolveRun, fractionOf, scanLog, watchRead, flattenMetrics, parseLogTail, fmtMetric, fmtCount, fmtSpan, etaMs,
  parseRunArgs, mergeRun, slug, pickRuns, type Run, type RunRules,
} from '../../src/runs';
import { readRuns, updateRunCache, type RunCache } from '../../src/io/runs';
import { buildRuns } from '../../src/segments/runs';
import type { RunsConfig } from '../../src/types';

const NOW = 1_800_000_000_000;
const MIN = 60_000;
const rules = (over: Partial<RunRules> = {}): RunRules =>
  ({ now: NOW, staleAfterMs: 15 * MIN, lingerMs: 10 * MIN, alive: () => true, ...over });
const run = (f: Record<string, unknown>, over: Partial<RunRules> = {}): Run | null =>
  resolveRun({ updated: NOW, ...f }, 'k', NOW, rules(over));

let prevMode: string | undefined;
before(() => { prevMode = process.env.SL_COLOR_MODE; process.env.SL_COLOR_MODE = 'truecolor'; resetConfigForTest(); });
after(() => { if (prevMode === undefined) delete process.env.SL_COLOR_MODE; else process.env.SL_COLOR_MODE = prevMode; resetConfigForTest(); });

// ── parsing ────────────────────────────────────────────────────────────────────
test('resolveRun rejects non-runs: no name, no progress, wrong shape', () => {
  assert.equal(resolveRun(null, 'k', NOW, rules()), null);
  assert.equal(resolveRun([1, 2], 'k', NOW, rules()), null);
  assert.equal(run({ current: 1, total: 2 }), null);                 // no name
  assert.equal(run({ name: 'x' }), null);                            // nothing to show
  assert.ok(run({ name: 'x', status: 'done' }));                     // a status alone is enough
  assert.ok(run({ name: 'x', step: 5 }));                            // a bare counter is enough
});

test('resolveRun defaults status to running and updated to the file mtime', () => {
  const r = resolveRun({ name: 'x', current: 1, total: 4 }, 'k', NOW - 5000, rules());
  assert.equal(r?.status, 'running');
  assert.equal(r?.updated, NOW - 5000);
  assert.equal(r?.frac, 0.25);
});

test('fractionOf: percent → current/total → step/steps → epoch/epochs', () => {
  assert.equal(fractionOf({ percent: 75, current: 1, total: 4 }), 0.75);
  assert.equal(fractionOf({ current: 1, total: 4, step: 9, steps: 10 }), 0.25);
  assert.equal(fractionOf({ step: 41200, steps: 103000, epoch: 6, epochs: 8 }), 0.4);
  assert.equal(fractionOf({ epoch: 6, epochs: 8 }), 0.75);
  assert.equal(fractionOf({ current: 5 }), null);                    // no total → indeterminate
  assert.equal(fractionOf({ current: 5, total: 0 }), null);
  assert.equal(fractionOf({ percent: 140 }), 1);                     // clamped
  assert.equal(fractionOf({ stage: { current: 3, total: 36 } }), 3 / 36); // stage alone fills
  assert.equal(fractionOf({ epoch: 6, epochs: 8, stage: { current: 3, total: 36 } }), 0.75); // inner wins
  assert.equal(fractionOf({ stage: { current: 3 } }), null);
});

test('flattenMetrics orders train → val → eval → others and drops non-numbers', () => {
  const m = flattenMetrics({ zz: { a: 1 }, eval: { auc: 0.9 }, train: { loss: 0.1, nmse: 'x' }, val: { loss: 0.2 } });
  assert.deepEqual(m.map((x) => `${x.group}.${x.name}`), ['train.loss', 'val.loss', 'eval.auc', 'zz.a']);
  assert.deepEqual(flattenMetrics('nope'), []);
});

test('unknown fields are ignored (forward compatible) and text is sanitised', () => {
  const r = run({ name: 'x\u001b[31m', current: 1, total: 2, v: 9, future: { a: 1 }, message: 'a\nb' });
  assert.equal(r?.name, 'x [31m');
  assert.equal(r?.message, 'a b');
});

// ── staleness / linger / pid ──────────────────────────────────────────────────
test('a running run goes stale after staleAfter, then hides after linger more', () => {
  assert.equal(run({ name: 'x', current: 1, total: 2, updated: NOW - 14 * MIN })?.status, 'running');
  assert.equal(run({ name: 'x', current: 1, total: 2, updated: NOW - 16 * MIN })?.status, 'stale');
  assert.equal(run({ name: 'x', current: 1, total: 2, updated: NOW - 26 * MIN }), null);
});

test('done/failed linger for `linger` after their last update', () => {
  assert.equal(run({ name: 'x', status: 'done', updated: NOW - 9 * MIN })?.status, 'done');
  assert.equal(run({ name: 'x', status: 'done', updated: NOW - 11 * MIN }), null);
  assert.equal(run({ name: 'x', status: 'failed', updated: NOW - 11 * MIN }), null);
});

test('paused never reads as stale; it hides on the same schedule', () => {
  assert.equal(run({ name: 'x', status: 'paused', current: 1, total: 2, updated: NOW - 20 * MIN })?.status, 'paused');
  assert.equal(run({ name: 'x', status: 'paused', current: 1, total: 2, updated: NOW - 26 * MIN }), null);
});

test('a running run whose pid is gone shows as stopped', () => {
  const seen: number[] = [];
  const dead = (pid: number): boolean => { seen.push(pid); return false; };
  assert.equal(run({ name: 'x', current: 1, total: 2, pid: 4242 }, { alive: dead })?.status, 'stopped');
  assert.deepEqual(seen, [4242]);
  assert.equal(run({ name: 'x', current: 1, total: 2, pid: 4242 }, { alive: () => true })?.status, 'running');
  // the pid only matters while it claims to be running
  assert.equal(run({ name: 'x', status: 'done', pid: 4242 }, { alive: dead })?.status, 'done');
});

// ── log tails ─────────────────────────────────────────────────────────────────
test('parseLogTail: last match wins per group; metrics and status from the tail', () => {
  const spec = { name: 'train', log: '/x', pattern: 'step (?<step>\\d+)/(?<steps>\\d+)|loss=(?<metric_train_loss>[0-9.e-]+)|val_auc=(?<metric_val_auc>[0-9.]+)', done: 'FINISHED', failed: 'Traceback' };
  const tail = 'step 10/100\nloss=0.5\nstep 20/100\nloss=0.25\nval_auc=0.81\nstep 30/100\n';
  const f = parseLogTail(spec, tail)!;
  assert.equal(f.step, 30); assert.equal(f.steps, 100);
  assert.deepEqual(f.metrics, { train: { loss: 0.25 }, val: { auc: 0.81 } });
  assert.equal(f.status, undefined);
  assert.equal(parseLogTail(spec, tail + 'FINISHED\n')!.status, 'done');
  assert.equal(parseLogTail(spec, tail + 'Traceback (most recent call last)\n')!.status, 'failed');
  assert.equal(parseLogTail(spec, 'Traceback\nretrying\nFINISHED\n')!.status, 'done');   // later one wins
});

test('parseLogTail: cur/total with the spec total as a fallback; bad regex → null', () => {
  const f = parseLogTail({ name: 'n', log: '/x', pattern: 'chunk (?<cur>\\d+)', total: 1000, unit: 'chunks' }, 'chunk 5\nchunk 7\n')!;
  assert.equal(f.current, 7); assert.equal(f.total, 1000); assert.equal(f.unit, 'chunks');
  assert.equal(parseLogTail({ name: 'n', log: '/x', pattern: '(' }, 'x'), null);
  assert.equal(parseLogTail({ name: 'n', log: '/x', pattern: 'nomatch' }, 'x'), null);
});

// ── formatting ────────────────────────────────────────────────────────────────
test('fmtMetric keeps ~4 significant figures and goes scientific at the extremes', () => {
  assert.equal(fmtMetric(0.0353), '0.0353');
  assert.equal(fmtMetric(0.91234), '0.9123');
  assert.equal(fmtMetric(41.2), '41.2');
  assert.equal(fmtMetric(12345.6), '12346');
  assert.equal(fmtMetric(0.00012), '1.2e-4');
  assert.equal(fmtMetric(2.5e7), '2.5e7');
  assert.equal(fmtMetric(0), '0');
  assert.equal(fmtMetric(-0.5), '-0.5');
});

test('fmtCount: 3 significant figures with k/M', () => {
  assert.equal(fmtCount(999), '999');
  assert.equal(fmtCount(41200), '41.2k');
  assert.equal(fmtCount(101308), '101k');
  assert.equal(fmtCount(1500), '1.5k');
  assert.equal(fmtCount(2_340_000), '2.34M');
  assert.equal(fmtCount(999_999), '1M');
});

test('fmtSpan: one or two compact units', () => {
  assert.equal(fmtSpan(45_000), '45s');
  assert.equal(fmtSpan(12 * MIN), '12m');
  assert.equal(fmtSpan(72 * MIN), '1h12m');
  assert.equal(fmtSpan(60 * MIN), '1h');
  assert.equal(fmtSpan(51 * 60 * MIN), '2d3h');
});

test('etaMs from started, else from the first sighting, else none', () => {
  const r = run({ name: 'x', current: 1, total: 4, started: NOW - 60 * MIN })!;
  assert.equal(etaMs(r, NOW), 180 * MIN);                              // 1h for 25% → 3h left
  const later = run({ name: 'x', current: 1, total: 2, updated: NOW - 10 * MIN })!;
  assert.equal(etaMs(later, NOW, { t: NOW - 20 * MIN, f: 0.25 }), 10 * MIN);   // 25%/10m, 50% left = 20m, minus 10m since
  assert.equal(etaMs(run({ name: 'x', current: 1, total: 2 })!, NOW), null);   // no basis
  assert.equal(etaMs(run({ name: 'x', status: 'paused', current: 1, total: 2, started: NOW - MIN })!, NOW), null);
});

// ── --run merge ───────────────────────────────────────────────────────────────
test('parseRunArgs reads positionals and every flag', () => {
  const p = parseRunArgs(['A1 SAE', '6', '8', '--unit', 'epoch', '--step', '41200', '--steps', '101308', '--epoch', '6',
    '--epochs', '8', '--percent', '75', '--metric', 'train.loss=0.035', '--metric', 'val.loss=0.041',
    '--stage', '12/56:chain step', '--status', 'running', '--message', 'hi', '--pid', '12']);
  assert.deepEqual(p, {
    name: 'A1 SAE', current: 6, total: 8, unit: 'epoch', step: 41200, steps: 101308, epoch: 6, epochs: 8, percent: 75,
    metrics: { train: { loss: 0.035 }, val: { loss: 0.041 } }, stage: { current: 12, total: 56, label: 'chain step' },
    status: 'running', message: 'hi', pid: 12,
  });
  assert.throws(() => parseRunArgs([]));
  assert.throws(() => parseRunArgs(['x', '--status', 'bogus']));
  assert.throws(() => parseRunArgs(['x', '--metric', 'loss=1']));
  assert.throws(() => parseRunArgs(['x', '--step', 'abc']));
  assert.throws(() => parseRunArgs(['x', '--nope', '1']));
});

test('mergeRun keeps started, merges metrics per group, stamps updated', () => {
  const a = mergeRun(null, { name: 'x', step: 1, metrics: { train: { loss: 1 }, val: { loss: 2 } } }, 1000);
  assert.equal(a.started, 1000); assert.equal(a.updated, 1000); assert.equal(a.status, 'running'); assert.equal(a.v, 1);
  const b = mergeRun(a, { name: 'x', step: 2, metrics: { train: { loss: 0.5, nmse: 0.4 } } }, 2000);
  assert.equal(b.started, 1000); assert.equal(b.updated, 2000); assert.equal(b.step, 2);
  assert.deepEqual(b.metrics, { train: { loss: 0.5, nmse: 0.4 }, val: { loss: 2 } });
  // finishing keeps history; reporting progress afterwards is a fresh run
  const done = mergeRun(b, { name: 'x', status: 'done' }, 3000);
  assert.equal(done.started, 1000);
  const again = mergeRun(done, { name: 'x', step: 1 }, 4000);
  assert.equal(again.started, 4000); assert.equal(again.metrics, undefined); assert.equal(again.status, 'running');
});

test('slug makes a safe file name', () => {
  assert.equal(slug('A1 SAE b11×8'), 'a1-sae-b11-8');
  assert.equal(slug('../../etc'), 'etc');
  assert.equal(slug('×××'), 'run');
});

// ── selection + rendering ─────────────────────────────────────────────────────
const mk = (name: string, status: Run['status'], started: number, extra: Partial<Run> = {}): Run =>
  ({ key: name, name, status, frac: 0.5, current: 1, total: 2, metrics: [], started, updated: NOW, ...extra });

test('pickRuns keeps live runs over finished ones and counts the rest', () => {
  const runs = [mk('d1', 'done', 1), mk('r1', 'running', 5), mk('d2', 'done', 2), mk('r2', 'running', 3), mk('f', 'failed', 4)];
  const { shown, more } = pickRuns(runs, 3);
  assert.deepEqual(shown.map((r) => r.name), ['r2', 'f', 'r1']);     // by start, among the top 3 priorities
  assert.equal(more, 2);
});

test('buildRuns: zero lines for no runs; +N more past max', () => {
  const o = { cols: 120, max: 2, metrics: true, maxMetrics: 4, now: NOW };
  assert.deepEqual(buildRuns([], o), []);
  const lines = buildRuns([mk('a', 'running', 1), mk('b', 'running', 2), mk('c', 'running', 3)], o);
  assert.equal(lines.length, 3);
  assert.equal(stripAnsi(lines[2]), '+1 more run');
});

test('buildRuns renders status glyphs, aligns bars, and shows counters/metrics', () => {
  const o = { cols: 200, max: 4, metrics: true, maxMetrics: 4, now: NOW };
  const a = mk('A1 SAE b11×8', 'running', 1, { frac: 0.4, current: undefined, total: undefined, step: 41200, steps: 101308, epoch: 6, epochs: 8,
    stage: { current: 12, total: 56, label: 'chain step' },
    metrics: [{ group: 'train', name: 'loss', value: 0.0353 }, { group: 'val', name: 'loss', value: 0.041 }, { group: 'eval', name: 'auc', value: 0.912 }] });
  const b = mk('eval', 'done', 2, { frac: 1, updated: NOW - 3 * MIN });
  const [la, lb] = buildRuns([a, b], o).map(stripAnsi);
  assert.match(la, /^▸ A1 SAE b11×8 {2}/);
  assert.match(la, / 40% +step 41\.2k\/101k {2}ep 6\/8 {2}chain step 12\/56/);
  assert.match(la, /train loss 0\.0353 · val loss 0\.041 · eval auc 0\.912/);
  assert.match(lb, /^✓ eval {9}/);                                        // name padded to the widest
  assert.match(lb, /100% +1\/2 {2}done 3m ago/);
  assert.equal(la.indexOf('40%'), lb.indexOf('100%'), 'bars and % line up');
});

test('buildRuns: maxMetrics caps entries; metrics:false hides them', () => {
  const metrics = [1, 2, 3, 4, 5].map((i) => ({ group: 'train', name: `m${i}`, value: i }));
  const r = mk('x', 'running', 1, { metrics });
  const capped = stripAnsi(buildRuns([r], { cols: 200, max: 4, metrics: true, maxMetrics: 2, now: NOW })[0]);
  assert.match(capped, /train m1 1 m2 2$/);
  const off = stripAnsi(buildRuns([r], { cols: 200, max: 4, metrics: false, maxMetrics: 4, now: NOW })[0]);
  assert.ok(!off.includes('train'));
});

test('buildRuns never overflows the width: drops low-priority pieces, then truncates', () => {
  const r = mk('a rather long training run name indeed', 'running', 1, {
    step: 41200, steps: 101308, epoch: 6, epochs: 8, stage: { current: 12, total: 56, label: 'chain step' }, message: 'x'.repeat(200),
    metrics: [{ group: 'train', name: 'loss', value: 0.0353 }, { group: 'val', name: 'loss', value: 0.041 }, { group: 'eval', name: 'auc', value: 0.912 }],
  });
  for (const cols of [200, 120, 90, 60, 40]) {
    const line = buildRuns([r], { cols, max: 4, metrics: true, maxMetrics: 4, now: NOW })[0];
    assert.ok(printLen(line) <= cols, `cols ${cols}: ${printLen(line)} — ${stripAnsi(line)}`);
  }
  const mid = stripAnsi(buildRuns([r], { cols: 120, max: 4, metrics: true, maxMetrics: 4, now: NOW })[0]);
  assert.ok(mid.includes('train loss') && !mid.includes('eval auc'), 'eval drops before train');
  assert.ok(mid.includes('…'), 'the message is truncated, not wrapped');
});

test('buildRuns labels stale and stopped runs', () => {
  const o = { cols: 160, max: 4, metrics: true, maxMetrics: 4, now: NOW };
  assert.match(stripAnsi(buildRuns([mk('s', 'stale', 1, { updated: NOW - 12 * MIN })], o)[0]), /^◌ s .* stale 12m/);
  assert.match(stripAnsi(buildRuns([mk('p', 'stopped', 1)], o)[0]), /^✗ p .* stopped\?/);
});

test('trend arrows come from the cache: ↓ after a fall, held across repaints', () => {
  const cache: RunCache = {};
  const at = (v: number): string => {
    const r = mk('x', 'running', 1, { metrics: [{ group: 'train', name: 'loss', value: v }] });
    updateRunCache(cache, [r], NOW);
    return stripAnsi(buildRuns([r], { cols: 160, max: 4, metrics: true, maxMetrics: 4, now: NOW, cache })[0]);
  };
  assert.match(at(0.5), /loss 0\.5$/);
  assert.match(at(0.4), /loss 0\.4↓$/);
  assert.match(at(0.4), /loss 0\.4↓$/);
  assert.match(at(0.45), /loss 0\.45↑$/);
});

test('updateRunCache resets on a restart and stays bounded', () => {
  const cache: RunCache = {};
  updateRunCache(cache, [mk('x', 'running', 1, { frac: 0.6 })], NOW);
  assert.equal(cache.x.f, 0.6);
  assert.equal(updateRunCache(cache, [mk('x', 'running', 1, { frac: 0.6 })], NOW), false, 'no change → no write');
  updateRunCache(cache, [mk('x', 'running', 1, { frac: 0.1, updated: NOW + 1 })], NOW + 1);
  assert.equal(cache.x.f, 0.1, 'fraction went backwards → fresh first sighting');
  const many = Array.from({ length: 40 }, (_, i) => mk(`r${i}`, 'running', 1));
  many.forEach((r, i) => updateRunCache(cache, [r], NOW + i));
  assert.ok(Object.keys(cache).length <= 32);
});

// ── fs scan ───────────────────────────────────────────────────────────────────
test('readRuns scans the dir, skips malformed/oversized files, and reads log tails', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cs-runs-'));
  try {
    fs.writeFileSync(path.join(dir, 'a.json'), JSON.stringify({ name: 'A', current: 1, total: 2, updated: NOW }));
    fs.writeFileSync(path.join(dir, 'bad.json'), '{not json');
    fs.writeFileSync(path.join(dir, 'big.json'), JSON.stringify({ name: 'big', current: 1, total: 2, updated: NOW, pad: 'x'.repeat(20000) }));
    fs.writeFileSync(path.join(dir, 'notes.txt'), 'ignored');
    fs.writeFileSync(path.join(dir, 'dead.json'), JSON.stringify({ name: 'D', current: 1, total: 2, updated: NOW, pid: 99 }));
    const log = path.join(dir, 'train.log');
    fs.writeFileSync(log, 'epoch 3/10 loss 0.2\n');
    fs.utimesSync(log, NOW / 1000, NOW / 1000);                        // a log's `updated` is its mtime
    const rc: RunsConfig = { enabled: true, dir, max: 4, staleAfter: 900, linger: 600, metrics: true, maxMetrics: 4,
      logs: [{ name: 'T', log, pattern: 'epoch (?<epoch>\\d+)/(?<epochs>\\d+) loss (?<metric_train_loss>[0-9.]+)' },
        { name: 'missing', log: path.join(dir, 'nope.log'), pattern: 'x' }] };
    const runs = readRuns(rc, NOW, (pid) => pid !== 99);
    const by = Object.fromEntries(runs.map((r) => [r.name, r]));
    assert.deepEqual(Object.keys(by).sort(), ['A', 'D', 'T']);
    assert.equal(by.D.status, 'stopped');
    assert.equal(by.T.frac, 0.3);
    assert.equal(by.T.key, 'log:T');
    assert.deepEqual(by.T.metrics, [{ group: 'train', name: 'loss', value: 0.2 }]);
    assert.deepEqual(readRuns({ ...rc, dir: path.join(dir, 'absent'), logs: [] }, NOW), []);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ── config ────────────────────────────────────────────────────────────────────
test('config `runs`: off by default, true for defaults, object overrides, SL_RUNS_DIR wins', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cs-rcfg-'));
  const file = path.join(dir, 'statusline.json');
  const prev = { c: process.env.SL_CONFIG, d: process.env.SL_RUNS_DIR };
  const load = (j: unknown): RunsConfig => { fs.writeFileSync(file, JSON.stringify(j)); resetConfigForTest(); return cfg.runs; };
  try {
    process.env.SL_CONFIG = file; delete process.env.SL_RUNS_DIR;
    assert.equal(load({}).enabled, false);
    const d = load({ runs: true });
    assert.equal(d.enabled, true);
    assert.equal(d.dir, path.join(os.homedir(), '.claude', 'runs'));
    assert.deepEqual([d.max, d.staleAfter, d.linger, d.metrics, d.maxMetrics], [4, 900, 600, true, 4]);
    const o = load({ runs: { dir: '~/r', max: 2, staleAfter: -1, linger: 'x', metrics: false, maxMetrics: 2,
      logs: [{ name: 'a', log: '~/a.log', pattern: 'x', total: 10 }, { name: 'bad' }, 'junk'] } });
    assert.equal(o.enabled, true);
    assert.equal(o.dir, path.join(os.homedir(), 'r'));
    assert.deepEqual([o.max, o.staleAfter, o.linger, o.metrics, o.maxMetrics], [2, 900, 600, false, 2]);
    assert.deepEqual(o.logs, [{ name: 'a', log: path.join(os.homedir(), 'a.log'), pattern: 'x', total: 10, unit: undefined, done: undefined, failed: undefined }]);
    assert.equal(load({ runs: { enabled: false } }).enabled, false);
    process.env.SL_RUNS_DIR = '/elsewhere';
    assert.equal(load({ runs: true }).dir, '/elsewhere');
  } finally {
    if (prev.c === undefined) delete process.env.SL_CONFIG; else process.env.SL_CONFIG = prev.c;
    if (prev.d === undefined) delete process.env.SL_RUNS_DIR; else process.env.SL_RUNS_DIR = prev.d;
    resetConfigForTest();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('scanLog: tqdm %, epoch/step counters, bare N/M, metrics, message', () => {
  const t = scanLog('Epoch 3/8:  45%|████▌     | 450/1000 [00:12<00:15, loss=0.231, val_loss=0.30]\n');
  assert.equal(t.percent, 45);
  assert.deepEqual([t.epoch, t.epochs], [3, 8]);
  assert.equal(t.current, undefined);                                  // epoch given: no bare counter
  assert.deepEqual(t.metrics, { train: { loss: 0.231 }, val: { loss: 0.3 } });
  const s = scanLog('step 1200/5000 lr=3e-4 eval_auc: 0.91\n');
  assert.deepEqual([s.step, s.steps], [1200, 5000]);
  assert.deepEqual(s.metrics, { train: { lr: 3e-4 }, eval: { auc: 0.91 } });
  const b = scanLog('21:19:24 2026/10/10 path/1/2\n  v3 m_drop2 200/794  258s\n');
  assert.deepEqual([b.current, b.total], [200, 794]);                  // not the date, not the path
  assert.equal(b.message, 'v3 m_drop2 200/794  258s');
  assert.equal(scanLog('done 9/3').current, undefined);
  assert.equal(scanLog('split: 40 test: 74\n  v3 m_drop2 400/794  520s').metrics, undefined); // older line's pairs                 // past its total: not progress
  assert.deepEqual(scanLog("x8 epoch 6: {'epoch': 6, 'nmse': 0.11, 'aux': 0.0}").metrics,
    { train: { nmse: 0.11, aux: 0 } });                                  // python dicts; 'epoch' is not a metric
});

test('watchRead: stages count, only the current step is scanned, inner logs, failure', () => {
  const spec = { name: 'chain', stage: String.raw`=== ([a-z]\w*_\w+)`, stages: 5, inner: '/x/log_{}.txt' };
  const log = '=== detached launch ===\n=== a_train\nepoch 7/8 nmse=0.11\nexit 0\n=== b_maps\n';
  const r = watchRead(spec, log);
  assert.deepEqual(r.stage, { current: 1, total: 5, label: 'step' });
  assert.equal(r.epoch, undefined);                                    // a_train's epoch stays with a_train
  assert.equal(r.metrics, undefined);
  assert.equal(r.message, 'b_maps');
  const inner = watchRead(spec, log, (l) => (l === 'b_maps' ? 'm_drop1 400/794\n' : ''));
  assert.deepEqual([inner.current, inner.total], [400, 794]);
  assert.equal(inner.message, 'b_maps · m_drop1 400/794');
  assert.equal(watchRead(spec, log + 'exit 1\nSTOPPED at b_maps\n').status, 'failed');
  assert.equal(watchRead({ name: 'j', done: 'ALLDONE' }, 'x\nALLDONE\n').status, 'done');
  assert.equal(watchRead({ name: 'j' }, 'fine\n').status, undefined);
  const of = watchRead({ name: 'a3', of: 101308 }, 'jepa:  40%|███▉ | 101307/253270 [26:17:02<39:25:36, loss=0.111]\n');
  assert.deepEqual([of.step, of.steps, of.percent, of.current], [101307, 101308, undefined, undefined]);
  assert.deepEqual(of.metrics, { train: { loss: 0.111 } });           // tqdm's 'jepa:  40%' is not a metric
});
