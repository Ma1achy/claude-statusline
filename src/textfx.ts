// Text transforms for per-element styling: case folding + opt-in Unicode
// "pseudo-fonts" (math-alphanumeric look-alikes). Pseudo-fonts are visually fun
// but break width-1 alignment, copy-paste, and screen readers — they're opt-in,
// off by default, and the engine never applies them to bars/glyph-only elements.

export function toCase(s: string, mode?: string): string {
  if (mode === 'upper') return s.toUpperCase();
  if (mode === 'lower') return s.toLowerCase();
  if (mode === 'title') return s.replace(/(^|[^A-Za-z])([a-z])/g, (_, p, c) => p + c.toUpperCase());
  return s;
}

// small-caps a→z (x has no small-cap codepoint → kept as 'x'); script exceptions
// use the reserved letterlike characters where the math-script block has holes.
const SMALLCAPS = 'ᴀʙᴄᴅᴇꜰɢʜɪᴊᴋʟᴍɴᴏᴘꞯʀꜱᴛᴜᴠᴡxʏᴢ';
const SCRIPT_U: Record<string, string> = { B: 'ℬ', E: 'ℰ', F: 'ℱ', H: 'ℋ', I: 'ℐ', L: 'ℒ', M: 'ℳ', R: 'ℛ' };
const SCRIPT_L: Record<string, string> = { e: 'ℯ', g: 'ℊ', o: 'ℴ' };

function mapChar(ch: string, kind: string): string {
  const c = ch.codePointAt(0) || 0;
  const U = c >= 65 && c <= 90, L = c >= 97 && c <= 122, D = c >= 48 && c <= 57;
  if (kind === 'bold') {
    if (U) return String.fromCodePoint(0x1D400 + c - 65);
    if (L) return String.fromCodePoint(0x1D41A + c - 97);
    if (D) return String.fromCodePoint(0x1D7CE + c - 48);
  } else if (kind === 'italic') {
    if (U) return String.fromCodePoint(0x1D434 + c - 65);
    if (ch === 'h') return 'ℎ';                                   // U+1D455 is reserved
    if (L) return String.fromCodePoint(0x1D44E + c - 97);
  } else if (kind === 'script') {
    if (U) return SCRIPT_U[ch] || String.fromCodePoint(0x1D49C + c - 65);
    if (L) return SCRIPT_L[ch] || String.fromCodePoint(0x1D4B6 + c - 97);
  } else if (kind === 'smallcaps') {
    if (L) return SMALLCAPS[c - 97];
  }
  return ch;
}

export function pseudoFont(s: string, kind?: string): string {
  if (!kind || kind === 'none') return s;
  let out = '';
  for (const ch of s) out += mapChar(ch, kind);
  return out;
}
