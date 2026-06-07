// The line-2 context group: the gradient bar with its autocompact marker, the %,
// the trend (sparkline + ETA + compaction count), and the weather word.
import { drawBar, scaleCells } from '../bar';
import { fmtCountdown } from '../format';
import { cfg } from '../config';
import { st, glyphFor } from '../style';
import { sparkline, etaMinutes, weatherWord } from '../insight';

export interface ContextSeg { bar: string; pctSeg: string; trend: string; weather: string; compactLabel: string; }

const BAR_WIDTH = 28;

export function buildContext(
  PCT: number, compactPctRaw: string, compactOff: boolean,
  SPARK: number[], ETA_SAMPLES: [number, number][], COMPACTIONS: number,
): ContextSeg {
  // autocompact marker + label only appear when autocompact is ENABLED.
  let compactLabel: string, compactPctVal: number;
  if (compactOff) { compactLabel = ''; compactPctVal = -1; }
  else if (compactPctRaw) { compactLabel = st('ctx.compactLabel', ` |${compactPctRaw}%`); compactPctVal = parseInt(compactPctRaw, 10); }
  else { compactLabel = st('ctx.compactLabel', ' |95%'); compactPctVal = 95; }

  const FILLED = scaleCells(PCT, BAR_WIDTH);
  const MARKER_POS = compactOff ? -1 : scaleCells(compactPctVal, BAR_WIDTH);
  const bar = drawBar(BAR_WIDTH, FILLED, MARKER_POS, 0);
  const pctSeg = st('ctx.pct', `${PCT}%`, { pct: PCT });   // gradient lerps along the theme

  // trend (SL_TREND): sparkline of recent context %, ETA to autocompact, and a
  // count of compactions detected this session.
  let trend = '';
  if (cfg.trend) {
    const parts: string[] = [];
    const spark = sparkline(SPARK);
    if (spark) parts.push(st('trend.spark', spark));
    if (!compactOff && compactPctVal > 0) {
      const eta = etaMinutes(ETA_SAMPLES, compactPctVal, PCT);
      if (eta >= 0) parts.push(st('trend.eta', `${glyphFor('trend.eta', '~')}${fmtCountdown(eta * 60)}`, { pct: PCT }));
    }
    if (COMPACTIONS > 0) parts.push(st('trend.compactions', `${glyphFor('trend.compactions', '↺')}${COMPACTIONS}`));
    trend = parts.join(' ');
  }
  // weather (SL_WEATHER): a one-word reading of context pressure.
  const weather = cfg.weather ? st('ctx.weather', weatherWord(PCT, compactOff ? 0 : compactPctVal), { pct: PCT }) : '';
  return { bar, pctSeg, trend, weather, compactLabel };
}
