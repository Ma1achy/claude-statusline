// Per-tick persistence: read this session's state, detect compactions and bell
// crossings, push the context-% spark and ETA samples, throttle a cross-session
// history record, and decide whether to kick a background git refresh. Returns the
// derived values the render needs; the foreground never execs git itself.
import { cfg } from '../config';
import { idiv } from '../util';
import { sessionKey, readState, writeState, pushSpark, appendHistory, HISTORY_BUCKET_MS } from '../state';
import type { StatuslineInput } from '../types';

// TTL that bounds how stale the cached git data can get before a refresh is kicked.
export const GIT_TTL = 2500;

export interface TickResult {
  gitMemo: Record<string, string>;   // cached git command output for the foreground
  kickRefresh: boolean;              // this render should spawn a background refresher
  SPARK: number[];
  COMPACTIONS: number;
  ETA_SAMPLES: [number, number][];
  BELL: string;
}

export function persistTick(data: StatuslineInput, CWD: string, PCT: number, COST: number, DURATION_MS: number): TickResult {
  let gitMemo: Record<string, string> = {};
  let kickRefresh = false;
  let SPARK: number[] = [], COMPACTIONS = 0, ETA_SAMPLES: [number, number][] = [], BELL = '';
  try {
    const sk = sessionKey(data);
    const st = readState(sk);
    // Reuse cached git for this render whenever it's for the same cwd — even when
    // stale, so git never blanks between refreshes; freshness decides if we refresh.
    let gitFresh = false;
    if (st.git && st.git.cwd === CWD) {
      gitMemo = { ...st.git.data };
      gitFresh = cfg.nowMs - st.git.ts < GIT_TTL;
    }
    // Kick a background git refresh when the cache is stale/missing, rate-limited
    // to one per TTL so cold-start can't stampede overlapping refreshers.
    if (CWD && !gitFresh && cfg.nowMs - (st.lastGitRefresh || 0) > GIT_TTL) {
      kickRefresh = true;
      st.lastGitRefresh = cfg.nowMs;
    }
    // SL_BELL: ring once each time context crosses into a higher band (de-dup via state).
    if (cfg.bell) {
      const lvl = PCT >= 95 ? 2 : PCT >= 80 ? 1 : 0;
      if (lvl > (st.bellLevel ?? 0)) BELL = '\x07';
      st.bellLevel = lvl;
    }
    const prev = st.spark.length ? st.spark[st.spark.length - 1] : -1;
    if (prev >= 0 && PCT !== prev) cfg.event = true;               // drives flash/ripple shimmers
    if (prev >= 0 && PCT <= prev - 25) st.compactions += 1;        // sharp drop = an autocompact
    pushSpark(st, PCT);
    st.etaSamples = (st.etaSamples || []).concat([[DURATION_MS, PCT]]).slice(-20);
    // one cross-session record per 5-minute duration bucket (keeps the log small).
    const bucket = idiv(DURATION_MS, HISTORY_BUCKET_MS);
    if (cfg.burn && COST > 0 && bucket > (st.histBucket ?? -1)) {
      st.histBucket = bucket;
      appendHistory({ t: cfg.nowMs, cost: COST, ctx: PCT, dur: DURATION_MS });
    }
    writeState(sk, st);
    SPARK = st.spark.slice();
    COMPACTIONS = st.compactions;
    ETA_SAMPLES = st.etaSamples;
  } catch { /* state is best-effort */ }
  return { gitMemo, kickRefresh, SPARK, COMPACTIONS, ETA_SAMPLES, BELL };
}
