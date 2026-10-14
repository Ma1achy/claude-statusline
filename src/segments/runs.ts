// Run-progress lines (config `runs`): one line per active job, drawn above the
// statusline — status glyph, name, the themed bar, %, counters, stage, ETA,
// metrics, then the message or age. Width-aware: when a line won't fit, the
// least useful pieces go first (other metric groups → eval → val → stage → ETA →
// train metrics → counters), the message is truncated into whatever's left, and
// only then do the name and bar shrink. Never wraps.
import { R, printLen } from '../ansi';
import { drawBar } from '../bar';
import { cfg } from '../config';
import { st } from '../style';
import { ROLES } from '../themes';
import { idiv, mod } from '../util';
import { pickRuns, etaMs, fmtCount, fmtMetric, fmtSpan, type Run, type RunStatus } from '../runs';
import type { RunCache } from '../io/runs';
import type { Role } from '../types';

const GLYPH: Record<RunStatus, string> = { running: '▸', paused: '◦', done: '✓', failed: '✗', stopped: '✗', stale: '◌' };
const ROLE: Record<RunStatus, Role> = { running: 'accent', paused: 'muted', done: 'ok', failed: 'bad', stopped: 'bad', stale: 'muted' };
const NAME_MAX = 24;

export interface RunsOpts {
  cols: number;                    // usable width (terminal minus the gutter)
  max: number;
  metrics: boolean;
  maxMetrics: number;
  now: number;
  cache?: RunCache;
}

const clip = (s: string, w: number): string => {
  const a = Array.from(s);
  return a.length <= w ? s : w <= 1 ? a.slice(0, w).join('') : `${a.slice(0, w - 1).join('')}…`;
};
const pad = (s: string, w: number): string => s + ' '.repeat(Math.max(0, w - Array.from(s).length));
// A quiet run (paused/stale/failed/stopped) keeps its bar style's glyphs but drops
// the live gradient: filled cells go flat in the status colour. (Dimming the
// gradient doesn't work — SGR dim only touches the foreground, so a half-block's
// background half stays bright and the bar comes out striped.)
function flatBar(w: number, filled: number, colour: string): string {
  const lit = drawBar(filled, filled, -1).replace(/\x1b\[[0-9;]*m/g, (m) => (m === R ? R : colour)).replace(/▌/g, '█');
  return lit + drawBar(w - filled, 0, -1);
}

// An indeterminate bar: a short lit band ping-ponging along an empty track (only
// when the shimmer is on — a frozen band would read as a real fraction).
function bandBar(w: number, phase: number): string {
  const band = Math.min(4, w);
  const span = w - band;
  const step = mod(idiv(cfg.nowMs + phase, 250), Math.max(1, span * 2));
  const at = step <= span ? step : span * 2 - step;
  return drawBar(at, 0, -1) + drawBar(band, band, -1, phase) + drawBar(w - band - at, 0, -1);
}

interface Seg { text: string; prio: number; metric?: boolean; }

function lineFor(r: Run, idx: number, nameW: number, o: RunsOpts): string {
  const role = ROLE[r.status];
  const quiet = r.status !== 'running' && r.status !== 'done';
  const frac = r.frac ?? (r.status === 'done' ? 1 : null);
  const age = Math.max(0, o.now - r.updated);
  const phase = idx * 700;

  // counters: the generic one, then step and epoch when given
  const counts: string[] = [];
  if (r.current !== undefined) counts.push(`${fmtCount(r.current)}${r.total !== undefined ? `/${fmtCount(r.total)}` : ''}${r.unit ? ` ${r.unit}` : ''}`);
  if (r.step !== undefined) counts.push(`step ${fmtCount(r.step)}${r.steps !== undefined ? `/${fmtCount(r.steps)}` : ''}`);
  if (r.epoch !== undefined) counts.push(`ep ${fmtCount(r.epoch)}${r.epochs !== undefined ? `/${fmtCount(r.epochs)}` : ''}`);

  const segs: Seg[] = [];
  if (counts.length) segs.push({ text: st('run.count', counts.join('  ')), prio: 7 });
  if (r.stage) {
    const s = r.stage;
    segs.push({ text: st('run.count', `${s.label || 'stage'} ${fmtCount(s.current)}${s.total !== undefined ? `/${fmtCount(s.total)}` : ''}`), prio: 4 });
  }
  const eta = etaMs(r, o.now, o.cache && o.cache[r.key]);
  if (eta !== null) segs.push({ text: st('run.eta', `eta ${fmtSpan(eta)}`), prio: 5 });

  if (o.metrics && o.maxMetrics > 0) {
    const ms = r.metrics.slice(0, o.maxMetrics);
    const groups: string[] = [];
    for (const m of ms) if (!groups.includes(m.group)) groups.push(m.group);
    const prioOf = (g: string): number => (g === 'train' ? 6 : g === 'val' ? 3 : g === 'eval' ? 2 : 1);
    for (const g of groups) {
      const body = ms.filter((m) => m.group === g).map((m) => {
        const seen = o.cache && o.cache[r.key] && o.cache[r.key].m && o.cache[r.key].m![`${m.group}.${m.name}`];
        const arrow = seen && seen[0] === m.value && seen[1] !== m.value ? (m.value < seen[1] ? '↓' : '↑') : '';
        return `${st('run.metric', m.name)} ${st('run.value', fmtMetric(m.value))}${arrow ? st('run.metric', arrow) : ''}`;
      }).join(' ');
      segs.push({ text: `${st('run.metric', g)} ${body}`, prio: prioOf(g), metric: true });
    }
  }

  // status word for anything that isn't plainly running; it never drops
  const word = r.status === 'stale' ? `stale ${fmtSpan(age)}` : r.status === 'stopped' ? 'stopped?'
    : r.status === 'done' || r.status === 'failed' ? `${r.status} ${fmtSpan(age)} ago`
      : r.status === 'paused' ? `paused ${fmtSpan(age)}` : '';
  const tail = r.message || (r.status === 'running' && age >= 60000 ? `${fmtSpan(age)} ago` : '');

  const build = (nw: number, bw: number, keep: Seg[], tailW: number): string => {
    let bar = '';
    const filled = frac === null ? 0 : Math.floor(frac * bw + 1e-9);
    if (frac !== null) bar = quiet ? flatBar(bw, filled, ROLES[role]) : drawBar(bw, filled, -1, phase);
    else if (cfg.shimmer !== 'off' && r.status === 'running') bar = bandBar(bw, phase);
    let s = `${st('run.name', GLYPH[r.status], { role })} ${st('run.name', pad(clip(r.name, nw), nw), { role, weight: quiet ? 'dim' : undefined })}`;
    if (bar) s += `  ${bar}`;
    if (frac !== null) s += ` ${st('run.pct', pad(`${Math.floor(frac * 100)}%`, 4), quiet ? { role } : { pct: frac * 100 })}`;
    keep.forEach((g, i) => { s += (g.metric && keep[i - 1] && keep[i - 1].metric ? st('run.metric', ' · ') : '  ') + g.text; });
    if (word) s += `  ${st('run.status', word, { role })}`;
    if (tail && tailW > 0) s += `  ${st('run.message', clip(tail, tailW))}`;
    return s;
  };

  let barW = o.cols >= 110 ? 20 : o.cols >= 80 ? 14 : 10;
  let nw = nameW;
  const keep = segs.slice();
  // drop the least useful segment until the line (sans message) fits
  while (keep.length && printLen(build(nw, barW, keep, 0)) > o.cols) {
    let lo = 0;
    keep.forEach((g, i) => { if (g.prio < keep[lo].prio) lo = i; });
    keep.splice(lo, 1);
  }
  // then shrink the name, then the bar
  let over = printLen(build(nw, barW, keep, 0)) - o.cols;
  if (over > 0) { const cut = Math.min(over, nw - 6); if (cut > 0) nw -= cut; over -= Math.max(0, cut); }
  if (over > 0) barW = Math.max(6, barW - over);
  // the message takes what's left (if there's room for something legible)
  const room = o.cols - printLen(build(nw, barW, keep, 0)) - 2;
  return build(nw, barW, keep, tail && room >= 6 ? room : 0);
}

/** The run lines to print above the statusline ([] when nothing is active). */
export function buildRuns(runs: Run[], o: RunsOpts): string[] {
  if (!runs.length) return [];
  const { shown, more } = pickRuns(runs, o.max);
  const nameW = Math.min(NAME_MAX, Math.max(...shown.map((r) => Array.from(r.name).length)));
  const lines = shown.map((r, i) => lineFor(r, i, nameW, o));
  if (more) lines.push(st('run.more', `+${more} more run${more > 1 ? 's' : ''}`));
  return lines;
}
