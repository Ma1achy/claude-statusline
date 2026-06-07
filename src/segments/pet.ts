// Pet face (SL_PET): a width-safe ASCII mood that escalates 0→4 with the chosen
// signal. An unset SL_PET_REACTS_TO reproduces the original context+cost behaviour.
import { cfg } from '../config';
import { idiv } from '../util';
import { st } from '../style';
import type { Role } from '../types';

// Pet faces by style, ordered calm → stressed (5 levels). All ASCII, width-safe.
const PET_FACES: Record<string, string[]> = {
  default: ['[^_^]', '[._.]', '[o_o]', '[>_<]', '[$_$]'],
  cat: ['=^_^=', '=._.=', '=o_o=', '=>_<=', '=$_$='],
  frog: ['(^_^)', '(o_o)', '(._.)', '(O_O)', '(>_<)'],
  robot: ['[0_0]', '[o_o]', '[._.]', '[!_!]', '[x_x]'],
  ghost: ['<^_^>', '<o_o>', '<._.>', '<!_!>', '<x_x>'],
  slime: ['(~_~)', '(o_o)', '(._.)', '(>_<)', '(@_@)'],
  dog: ['[^o^]', '[^.^]', '[-.-]', '[>n<]', '[ToT]'],
};

export function buildPet(COST: number, DIRTY: number, PCT: number): string {
  if (!cfg.pet) return '';
  let lvl: number;
  switch (cfg.petReactsTo) {
    case 'cost': lvl = COST >= 2 ? 4 : COST >= 1 ? 3 : COST >= 0.5 ? 2 : COST >= 0.1 ? 1 : 0; break;
    case 'git': lvl = DIRTY > 10 ? 4 : DIRTY >= 6 ? 3 : DIRTY >= 3 ? 2 : DIRTY >= 1 ? 1 : 0; break;
    case 'time': { const h = new Date(cfg.clockMs).getHours(); lvl = h < 6 ? 0 : h < 12 ? 1 : h < 18 ? 2 : h < 22 ? 3 : 0; break; }
    case 'random': lvl = (Math.imul(idiv(cfg.nowMs, 3000), 2654435761) >>> 0) % 5; break;
    case 'context': lvl = PCT >= 95 ? 4 : PCT >= 85 ? 3 : PCT >= 70 ? 2 : PCT >= 40 ? 1 : 0; break;
    default: lvl = COST >= 0.50 ? 4 : PCT >= 85 ? 3 : PCT >= 70 ? 2 : PCT >= 40 ? 1 : 0;   // original behaviour
  }
  const faces = PET_FACES[cfg.petStyle] || PET_FACES.default;
  const role = (['ok', 'fg', 'warn', 'bad', 'gold'] as Role[])[lvl];
  return `${st('pet', faces[lvl], { role })} `;
}
