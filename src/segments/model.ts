// Model tier/version badge, crest glyph, and the effort/thinking words.
import { cfg } from '../config';
import { st } from '../style';
import type { Role } from '../types';

export interface ModelSeg { display: string; oneM: string; crest: string; }

// Tier (Haiku/Sonnet/Opus) → role + display, the 1M-context badge, and the crest.
export function buildModel(MODEL_ID: string, MODEL_NAME: string, MAX_TOK: number): ModelSeg {
  const idl = MODEL_ID.toLowerCase();
  let TIER = 'Sonnet', modelRole: Role = 'accent';
  if (idl.includes('haiku')) { TIER = 'Haiku'; modelRole = 'info'; }
  else if (idl.includes('opus')) { TIER = 'Opus'; modelRole = 'gold'; }
  const vm = idl.match(/(opus|sonnet|haiku)-(\d+)-(\d+)/);
  const MODEL_VER = vm ? `${vm[2]}.${vm[3]}` : '';
  const display = st('model.tier', MODEL_VER ? `${TIER} ${MODEL_VER}` : MODEL_NAME, { role: modelRole });
  const oneM = MAX_TOK >= 900000 ? st('model.badge1m', '1M') : '';
  let crest = '';
  if (cfg.crest) {
    const g = TIER === 'Opus' ? '★' : TIER === 'Haiku' ? '▲' : '◆';
    crest = st('crest', g, { role: modelRole }) + ' ';
  }
  return { display, oneM, crest };
}

export interface EffortSeg { word: string; thinking: string; }

// Effort level → word/role/weight, plus the "thinking" indicator.
export function buildEffort(EFFORT: string, THINKING: boolean): EffortSeg {
  let effortRole: Role = 'fg', effortWeight: 'normal' | 'bold' | 'dim' = 'normal', effortText = '';
  switch (EFFORT) {
    case 'low': effortWeight = 'dim'; effortText = 'low'; break;
    case 'medium': effortWeight = 'dim'; effortText = 'med'; break;
    case 'high': effortText = 'high'; break;
    case 'xhigh': effortRole = 'warn'; effortText = 'xhigh'; break;
    case 'max': effortRole = 'bad'; effortWeight = 'bold'; effortText = 'MAX'; break;
  }
  const word = effortText ? st('effort', effortText, { role: effortRole, weight: effortWeight }) : '';
  const thinking = THINKING ? st('thinking', 'thinking', { role: effortRole, weight: 'dim' }) : '';
  return { word, thinking };
}
