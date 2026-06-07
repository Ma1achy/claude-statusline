// Git facts + the detached-refresh cache. The foreground never execs git; it reads
// whatever the background `--git-refresh` child last wrote, so a big/slow repo can
// never push a render past refreshInterval. readGit() is shared by both sides so
// the set of git commands (cache keys) can never drift between them.
import * as fs from 'fs';
import * as path from 'path';
import { gitOut, countLines } from '../git';
import { cfg } from '../config';
import { idiv } from '../util';
import { sessionKey, readState, writeState } from '../state';
import type { StatuslineInput } from '../types';

// Raw git facts for a working dir, gathered through `gc` (the only thing that
// touches git). `gc` is a memoised reader: in the foreground it returns cached
// values and never execs; in the refresher it execs and fills the cache.
export interface GitInfo {
  branch: string; branchLabel: string; dirty: number; staged: number; gitId: string;
  state: string; today: number; ahead: number; behind: number; ageSecs: number;
  untracked: number; stash: number; mood: string; riskLevel: string;
}

export function readGit(CWD: string, gc: (args: string[]) => string): GitInfo {
  const branch = gc(['rev-parse', '--abbrev-ref', 'HEAD']);
  const g: GitInfo = {
    branch, branchLabel: branch, dirty: countLines(gc(['status', '--porcelain'])),
    staged: countLines(gc(['diff', '--cached', '--name-only'])), gitId: gc(['config', 'user.email']),
    state: '', today: 0, ahead: 0, behind: 0, ageSecs: -1, untracked: 0, stash: 0, mood: '', riskLevel: '',
  };
  if (cfg.gitExtra && branch) {
    // detached HEAD → show a short sha instead of "HEAD".
    if (branch === 'HEAD') { const sha = gc(['rev-parse', '--short', 'HEAD']); if (sha) g.branchLabel = `:${sha}`; }
    // mid-operation state from the git dir (merge / rebase / cherry-pick).
    try {
      let gd = gc(['rev-parse', '--git-dir']);
      if (gd) {
        if (!path.isAbsolute(gd)) gd = path.join(CWD, gd);
        if (fs.existsSync(path.join(gd, 'MERGE_HEAD'))) g.state = 'merge';
        else if (fs.existsSync(path.join(gd, 'rebase-merge')) || fs.existsSync(path.join(gd, 'rebase-apply'))) g.state = 'rebase';
        else if (fs.existsSync(path.join(gd, 'CHERRY_PICK_HEAD'))) g.state = 'cherry';
      }
    } catch { /* ignore */ }
    // commits made since local midnight of the current frame (today's momentum).
    const mid = new Date(cfg.clockMs); mid.setHours(0, 0, 0, 0);
    const ct2 = parseInt(gc(['rev-list', '--count', `--since=${idiv(mid.getTime(), 1000)}`, 'HEAD']), 10);
    if (Number.isFinite(ct2) && ct2 > 0) g.today = ct2;
    const m = gc(['rev-list', '--count', '--left-right', '@{upstream}...HEAD']).match(/^(\d+)\s+(\d+)$/);
    if (m) { g.behind = +m[1]; g.ahead = +m[2]; }
    const ct = parseInt(gc(['log', '-1', '--format=%ct']), 10);
    if (Number.isFinite(ct) && ct > 0) g.ageSecs = Math.max(0, cfg.baseFrame - ct);
    g.untracked = countLines(gc(['ls-files', '--others', '--exclude-standard']));
    g.stash = countLines(gc(['stash', 'list']));
    g.mood = /^wip\//i.test(branch) ? 'wip' : /^(hotfix|fix)\//i.test(branch) ? 'fix'
      : /^(feat|feature)\//i.test(branch) ? 'feat' : /^test\//i.test(branch) ? 'test' : '';
  }
  // git risk (SL_GIT_RISK) — a deliberately rough composite; opt-in.
  if (cfg.gitRisk && branch) {
    let s = 0;
    if (g.dirty > 0) s += g.dirty >= 10 ? 2 : 1;
    if (countLines(gc(['stash', 'list'])) > 0) s += 1;
    const rm = gc(['rev-list', '--count', '--left-right', '@{upstream}...HEAD']).match(/^(\d+)\s+(\d+)$/);
    if (rm) { if (+rm[1] > 0) s += 1; if (+rm[2] >= 5) s += 1; }
    if (g.state) s += 2;
    g.riskLevel = s >= 4 ? 'high' : s >= 2 ? 'med' : 'low';
  }
  return g;
}

// The detached `--git-refresh` child: exec git off the hot path and write the
// cache for the next foreground tick. No output, no segment work — just git.
export function refreshGitCache(data: StatuslineInput): void {
  const CWD = (data.workspace && data.workspace.current_dir) || '';
  const gitMemo: Record<string, string> = {};
  const gc = (args: string[]): string => {
    const key = args.join(' ');
    if (key in gitMemo) return gitMemo[key];
    const v = gitOut(CWD, args); gitMemo[key] = v; return v;
  };
  try {
    const sk = sessionKey(data);
    readGit(CWD, gc);                         // populates gitMemo via exec (incl. '' for non-repos)
    const st = readState(sk);                 // merge into the foreground's latest spark/eta
    st.git = { cwd: CWD, ts: cfg.nowMs, data: gitMemo };
    writeState(sk, st);
  } catch { /* refresh is best-effort */ }
}
