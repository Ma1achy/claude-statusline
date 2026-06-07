// The line-1 clock (date + time) with its day/night colour, and the moon phase.
import { tc, R } from '../ansi';
import { ROLES } from '../themes';
import { cfg } from '../config';
import { st } from '../style';

export interface ClockSeg { clock: string; moon: string; }

// day/night clock colour (SL_DAYNIGHT): muted when off, else an hour-based tint.
function clockColour(): string {
  if (!cfg.daynight) return ROLES.muted;
  const h = new Date(cfg.clockMs).getHours();
  if (h < 5 || h >= 22) return tc(90, 110, 170);
  if (h < 8) return tc(150, 170, 210);
  if (h < 17) return tc(230, 225, 180);
  if (h < 20) return tc(235, 165, 90);
  return tc(150, 130, 180);
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function buildClock(): ClockSeg {
  let moon = '';
  if (cfg.moon) {
    const days = cfg.nowMs / 86400000 - 10961.26;       // since 2000-01-06 new moon
    const phase = ((days / 29.530589) % 1 + 1) % 1;      // 0=new … 0.5=full
    const g = ['●', '◐', '○', '◑'][Math.round(phase * 4) % 4];
    moon = `${st('moon', g)} `;
  }
  const dt = new Date(cfg.clockMs);
  const p2 = (n: number): string => String(n).padStart(2, '0');
  const clock = `${clockColour()}${DAYS[dt.getDay()]} ${p2(dt.getDate())} ${MONTHS[dt.getMonth()]}  ${p2(dt.getHours())}:${p2(dt.getMinutes())}:${p2(dt.getSeconds())}${R}`;
  return { clock, moon };
}
