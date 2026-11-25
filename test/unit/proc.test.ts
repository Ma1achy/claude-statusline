// Unit tests for src/io/proc.ts — the single-holder locks that keep one git
// refresher per repo and one watcher per log — and for refreshGitCache's refusal
// to run while another refresher holds the repo. Each guard has a control arm: the
// same call succeeds once the lock is free, so a test can't pass by never working.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { claimLock, lockHeld, releaseLock, touchLock, clearAndReapNotes, noteSpawn } from '../../src/io/proc';
import { refreshGitCache, refreshLock, refreshInFlight } from '../../src/io/gitcache';

const tmp = (): string => fs.mkdtempSync(path.join(os.tmpdir(), 'cs-lock-'));
const OTHER = 424242;                       // a pid the injected probe calls alive
const alive = (pid: number): boolean => pid === OTHER;
const holdAs = (file: string, pid: number, t = Date.now()): void => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify({ pid, t })); };

test('claimLock: one holder at a time; released on demand', () => {
  const file = path.join(tmp(), 'a.lock');
  assert.equal(claimLock(file, 30000, alive), true, 'free lock is taken');
  assert.equal(lockHeld(file, 30000, alive), false, 'our own lock does not block us');
  releaseLock(file);
  assert.equal(fs.existsSync(file), false, 'release removes our lock');
  holdAs(file, OTHER);
  assert.equal(claimLock(file, 30000, alive), false, 'a live holder keeps it');
  assert.equal(lockHeld(file, 30000, alive), true);
  holdAs(file, OTHER + 1);
  assert.equal(claimLock(file, 30000, alive), true, 'a dead holder\'s lock is broken and retaken');
  releaseLock(file);
});

test('claimLock: a live holder past the stale age loses the lock', () => {
  const file = path.join(tmp(), 'b.lock');
  holdAs(file, OTHER, Date.now() - 60000);
  assert.equal(lockHeld(file, 30000, alive), false);
  assert.equal(claimLock(file, 30000, alive), true);
  holdAs(file, OTHER, Date.now() - 60000);
  touchLock(file);                           // not ours: untouched
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).pid, OTHER);
  fs.rmSync(file);
});

test('releaseLock never removes a lock someone else holds', () => {
  const file = path.join(tmp(), 'c.lock');
  holdAs(file, OTHER);
  releaseLock(file);
  assert.equal(fs.existsSync(file), true);
});

test('refreshGitCache: does nothing while another refresher holds the repo', () => {
  const cwd = tmp();                         // not a repo: git answers '' fast
  const lock = refreshLock(cwd);
  // process.ppid is the test runner: a live pid that is not us.
  holdAs(lock, process.ppid);
  try {
    assert.equal(refreshInFlight(cwd), true, 'the render sees a refresher in flight');
    assert.equal(refreshGitCache({ session_id: 'locktest', workspace: { current_dir: cwd } }), false, 'second refresher stands down');
  } finally { fs.rmSync(lock, { force: true }); }
  // control: with the lock free the same call runs, and releases the lock after
  assert.equal(refreshInFlight(cwd), false);
  assert.equal(refreshGitCache({ session_id: 'locktest', workspace: { current_dir: cwd } }), true, 'free repo → refresh runs');
  assert.equal(fs.existsSync(lock), false, 'lock released when the refresh ends');
  fs.rmSync(path.join(os.tmpdir(), 'claude-statusline', 'locktest.json'), { force: true });
});

test('spawn notes: a started child clears its parent\'s note; old notes are dropped', () => {
  // This process plays the child: its ppid is the "spawner" whose note it clears.
  const lockDir = path.dirname(refreshLock('x'));
  fs.mkdirSync(lockDir, { recursive: true });
  const mine = path.join(lockDir, `spawn-unittest-${process.ppid}-${Date.now()}.json`);
  const ancient = path.join(lockDir, `spawn-unittest-1-${Date.now() - 2 * 3600000}.json`);
  fs.writeFileSync(mine, ''); fs.writeFileSync(ancient, '');
  assert.equal(clearAndReapNotes('unittest', '--never-matches'), 0);
  assert.equal(fs.existsSync(mine), false, 'parent\'s note cleared');
  assert.equal(fs.existsSync(ancient), false, 'note past the max age dropped');
  // noteSpawn's cleanup removes a note a failed spawn would leave behind
  const before = fs.readdirSync(lockDir).filter((n) => n.startsWith('spawn-unittest2-')).length;
  const undo = noteSpawn('unittest2');
  assert.equal(fs.readdirSync(lockDir).filter((n) => n.startsWith('spawn-unittest2-')).length, before + 1);
  undo();
  assert.equal(fs.readdirSync(lockDir).filter((n) => n.startsWith('spawn-unittest2-')).length, before);
});
