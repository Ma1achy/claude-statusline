// Process hygiene against the built statusline.js: no invocation may outlive its
// budget. Each case would have hung for ever before the fix (a stdin pipe nobody
// closes, a git that never returns, refreshers piling up per tick). Every child is
// spawned here with a kill guard, so a regression fails the test instead of leaking.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { STATUSLINE } = require('./harness');

const POSIX = process.platform !== 'win32';
const GUARD_MS = 20000;

function sandbox() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'cs-proc-'));
  const home = path.join(base, 'home');
  fs.mkdirSync(path.join(home, '.claude'), { recursive: true });
  fs.writeFileSync(path.join(home, '.claude.json'), '{}');
  fs.writeFileSync(path.join(home, '.claude', 'statusline.json'), JSON.stringify({ runs: { enabled: true, staleAfter: 1, linger: 1 } }));
  const tmp = path.join(base, 'tmp'); fs.mkdirSync(tmp);
  const env = { ...process.env, HOME: home, USERPROFILE: home, TMPDIR: tmp, TEMP: tmp, TMP: tmp, SL_RUNS_DIR: path.join(base, 'runs'), COLUMNS: '120', SL_COLOR_MODE: 'mono' };
  return { base, home, tmp, env, done: () => fs.rmSync(base, { recursive: true, force: true }) };
}

/** Spawn statusline.js with a stdin pipe; write `input`, close stdin only if asked.
 *  Resolves with how long it lived. A child still alive at GUARD_MS is killed. */
function launch(args, { env, input = '', close = false }) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const c = spawn(process.execPath, [STATUSLINE, ...args], { env, stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true });
    let out = '', killed = false;
    c.stdout.on('data', (d) => { out += d; });
    c.stdin.on('error', () => { /* child gone first */ });
    if (input) c.stdin.write(input);
    if (close) c.stdin.end();
    const guard = setTimeout(() => { killed = true; c.kill('SIGKILL'); }, GUARD_MS);
    c.on('exit', (code) => { clearTimeout(guard); try { c.stdin.destroy(); } catch { /* ignore */ } resolve({ code, ms: Date.now() - t0, out, killed }); });
  });
}

const INPUT = JSON.stringify({ session_id: 'proc', model: { id: 'claude-opus-4-8' }, context_window: { context_window_size: 200000, used_percentage: 40 } });

test('render: a stdin pipe never closed still renders and exits promptly', async () => {
  const s = sandbox();
  try {
    const r = await launch([], { env: s.env, input: INPUT });
    assert.ok(!r.killed && r.code === 0, `exited by itself (took ${r.ms}ms)`);
    assert.ok(r.ms < 1400, `complete JSON is enough, no wait for EOF (took ${r.ms}ms)`);
    assert.ok(r.out.split('\n').filter(Boolean).length >= 3, 'the full statusline is printed');
  } finally { s.done(); }
});

test('render: a half-written payload on a never-closed pipe gives up at the stdin deadline', async () => {
  const s = sandbox();
  try {
    const r = await launch([], { env: s.env, input: INPUT.slice(0, 20) });
    assert.ok(!r.killed && r.code === 0, `exited by itself (took ${r.ms}ms)`);
    assert.ok(r.ms >= 1400 && r.ms < 4000, `bounded by the 1.5 s stdin deadline (took ${r.ms}ms)`);
    assert.ok(r.out.length > 0, 'still prints a statusline');
    // control: the same with stdin closed does not wait for the deadline
    const c = await launch([], { env: s.env, input: INPUT.slice(0, 20), close: true });
    assert.ok(c.ms < 1400, `closed pipe → no deadline wait (took ${c.ms}ms)`);
  } finally { s.done(); }
});

test('hard exit: the budget timer ends the process whatever it is waiting on', async () => {
  const s = sandbox();
  try {
    // Never-closed, never-complete stdin would hold the render for the 1.5 s
    // deadline; a 300 ms budget must end it first.
    const r = await launch([], { env: { ...s.env, SL_EXIT_AFTER_MS: '300' }, input: '{' });
    assert.ok(!r.killed, 'exited by itself');
    assert.ok(r.ms < 1200, `hard exit fired before the stdin deadline (took ${r.ms}ms)`);
  } finally { s.done(); }
});

test('--hook and --git-refresh: a never-closed stdin cannot hold them', async () => {
  const s = sandbox();
  try {
    const h = await launch(['--hook'], { env: s.env, input: '{"tool_name":"Bash"' });
    assert.ok(!h.killed && h.ms < 4000, `--hook exited (took ${h.ms}ms)`);
    const g = await launch(['--git-refresh'], { env: s.env, input: '{"workspace":' });
    assert.ok(!g.killed && g.ms < 4000, `--git-refresh exited (took ${g.ms}ms)`);
  } finally { s.done(); }
});

/** A fake `git` first on PATH that records its pid and then hangs. */
function hangingGit(s) {
  const bin = path.join(s.base, 'bin'); fs.mkdirSync(bin);
  const pids = path.join(s.base, 'git-pids');
  fs.writeFileSync(path.join(bin, 'git'), `#!/bin/sh\necho $$ >> '${pids}'\nexec sleep 30\n`, { mode: 0o755 });
  const repo = path.join(s.base, 'repo'); fs.mkdirSync(repo);
  const env = { ...s.env, PATH: `${bin}${path.delimiter}${process.env.PATH}` };
  const arg = JSON.stringify({ session_id: 'hang', workspace: { current_dir: repo } });
  const calls = () => (fs.existsSync(pids) ? fs.readFileSync(pids, 'utf8').split('\n').filter(Boolean).map(Number) : []);
  return { env, arg, calls };
}

const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };

test('--git-refresh: a git that hangs is killed by the timeout', { skip: !POSIX && 'fake git is a shell script' }, async () => {
  const s = sandbox();
  try {
    const g = hangingGit(s);
    const r = await launch(['--git-refresh', g.arg], { env: g.env, close: true });
    assert.ok(!r.killed, 'the refresher ended by itself');
    assert.ok(r.ms >= 2500 && r.ms < 6000, `bounded by the 3 s git timeout (took ${r.ms}ms)`);
    assert.deepStrictEqual(g.calls().length, 1, 'gave up after the first hung call, no retry per command');
    assert.ok(!alive(g.calls()[0]), 'the hung git was killed, not left behind');
    const state = path.join(s.tmp, 'claude-statusline', 'hang.json');
    assert.ok(!fs.existsSync(state), 'a timed-out refresh keeps the old cache instead of writing blanks');
  } finally { s.done(); }
});

test('--git-refresh: two refreshers never run git on one repo at once', { skip: !POSIX && 'fake git is a shell script' }, async () => {
  const s = sandbox();
  try {
    const g = hangingGit(s);
    const first = launch(['--git-refresh', g.arg], { env: g.env, close: true });
    const t0 = Date.now();
    while (!g.calls().length && Date.now() - t0 < 5000) await new Promise((r) => setTimeout(r, 50));
    assert.strictEqual(g.calls().length, 1, 'first refresher is inside git');
    const second = await launch(['--git-refresh', g.arg], { env: g.env, close: true });
    assert.ok(second.ms < 4000, `second refresher waits at most 2 s, then stands down (took ${second.ms}ms)`);
    assert.strictEqual(g.calls().length, 1, 'second refresher never ran git');
    await first;
    // control: with the first gone, a refresher runs git again
    await launch(['--git-refresh', g.arg], { env: g.env, close: true });
    assert.strictEqual(g.calls().length, 2, 'lock released → next refresher runs');
  } finally { s.done(); }
});

test('--watch: one watcher per log, and a quiet log ends it even with a live pid', async () => {
  const s = sandbox();
  try {
    const log = path.join(s.base, 'job.log');
    fs.writeFileSync(log, 'step 1/10\n');
    // pid = this test process: alive throughout, so only the quiet bound can end it
    const args = ['--watch', log, '--name', 'job', '--pid', String(process.pid), '--every', '1'];
    const first = launch(args, { env: s.env, close: true });
    await new Promise((r) => setTimeout(r, 500));
    const second = await launch(args, { env: s.env, close: true });
    assert.ok(second.ms < 1500, `second watcher on the same log leaves at once (took ${second.ms}ms)`);
    const r = await first;
    assert.ok(!r.killed, 'first watcher ended by itself');
    assert.ok(r.ms < 8000, `quiet log (staleAfter+linger = 2 s) ended it (took ${r.ms}ms)`);
    // control: the lock is free again, so a new watcher on a fresh log runs until
    // the log goes quiet (and ends the same way)
    fs.appendFileSync(log, 'step 2/10\n');
    const third = await launch(args, { env: s.env, close: true });
    assert.ok(!third.killed && third.ms >= 1500 && third.ms < 8000, `a new watcher runs once the first is gone (took ${third.ms}ms)`);
  } finally { s.done(); }
});
