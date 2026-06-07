// The line-3 git segment, assembled from the cache-backed facts in GitInfo:
// branch (+ mood/state), today's commits, ahead/behind, last-commit age, email,
// +/- churn, dirty/staged counts, untracked, stash, and the opt-in risk composite.
import { txt } from '../ansi';
import { idiv } from '../util';
import { cfg } from '../config';
import { st, glyphFor, labelFor } from '../style';
import type { GitInfo } from '../io/gitcache';
import type { Role } from '../types';

export function buildGitSeg(G: GitInfo, ADDED: number, REMOVED: number, hideEmail: boolean): string {
  const GIT_TODAY = G.today > 0 ? ` ${st('git.today', `${txt(glyphFor('git.today', '✓'))}${G.today}`)}` : '';
  let GIT_AB = '';
  { let s = ''; if (G.ahead) s += st('git.ahead', `${txt(glyphFor('git.ahead', '↑'))}${G.ahead}`); if (G.behind) s += st('git.behind', `${txt(glyphFor('git.behind', '↓'))}${G.behind}`); if (s) GIT_AB = `  ${s}`; }
  let GIT_AGE = '';
  if (G.ageSecs >= 0) {
    const secs = G.ageSecs;
    const a = secs < 60 ? `${secs}s` : secs < 3600 ? `${idiv(secs, 60)}m`
      : secs < 86400 ? `${idiv(secs, 3600)}h` : `${idiv(secs, 86400)}d`;
    GIT_AGE = `  ${st('git.age', `${glyphFor('git.age', '·')}${a}`)}`;
  }
  const GIT_UNTRACKED = G.untracked > 0 ? `  ${st('git.untracked', `${glyphFor('git.untracked', '?')}${G.untracked}`)}` : '';
  const GIT_STASH = G.stash > 0 ? ` ${st('git.stash', `${labelFor('git.stash', 's:')}${G.stash}`)}` : '';
  const BRANCH_MOOD = G.mood ? `${st('git.mood', `[${G.mood}]`)} ` : '';
  const riskRole: Role = G.riskLevel === 'high' ? 'bad' : G.riskLevel === 'med' ? 'warn' : 'ok';
  const GIT_RISK = G.riskLevel ? `  ${st('git.risk', `${labelFor('git.risk', 'risk:')}${G.riskLevel}`, { role: riskRole })}` : '';

  let GIT_SEG = '';
  if (G.branch) {
    GIT_SEG += `  ${BRANCH_MOOD}${st('git.branch', `${glyphFor('git.branch', cfg.nerdfont ? '' : '⎇')} ${G.branchLabel}`)}`;
    if (G.state) GIT_SEG += ` ${st('git.state', `${G.state}!`)}`;
    GIT_SEG += GIT_TODAY;
  }
  GIT_SEG += GIT_AB + GIT_AGE;
  if (G.gitId && !hideEmail) GIT_SEG += `  ${st('git.email', G.gitId)}`;
  if (ADDED > 0 || REMOVED > 0) GIT_SEG += `  ${st('git.added', `${glyphFor('git.added', '+')}${ADDED}`)}/${st('git.removed', `${glyphFor('git.removed', '-')}${REMOVED}`)}`;
  if (G.dirty > 0) GIT_SEG += `  ${st('git.dirty', `${glyphFor('git.dirty', '~')}${G.dirty}`)}`;
  if (G.staged > 0) GIT_SEG += ` ${st('git.staged', `${glyphFor('git.staged', '●')}${G.staged}`)}`;
  GIT_SEG += GIT_UNTRACKED + GIT_STASH + GIT_RISK;
  return GIT_SEG;
}
