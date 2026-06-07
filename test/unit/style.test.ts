// Unit tests for the style/colour emitters that read the active theme: st(),
// gradientColor(), rainbow(). Forced to truecolor so the escape format is
// deterministic regardless of the CI terminal. These read theme globals built at
// load (heat by default); behaviour across themes stays covered by the goldens.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { resetConfigForTest } from '../../src/config';
import { stripAnsi } from '../../src/ansi';
import { st } from '../../src/style';
import { gradientColor } from '../../src/themes';
import { rainbow } from '../../src/rainbow';

let prevMode: string | undefined;
before(() => { prevMode = process.env.SL_COLOR_MODE; process.env.SL_COLOR_MODE = 'truecolor'; resetConfigForTest(); });
after(() => { if (prevMode === undefined) delete process.env.SL_COLOR_MODE; else process.env.SL_COLOR_MODE = prevMode; resetConfigForTest(); });

test('st styles the text but preserves its visible content', () => {
  const out = st('ctx.pct', '42%', { pct: 42 });
  assert.equal(stripAnsi(out), '42%');     // text intact
  assert.notEqual(out, '42%');             // actually wrapped in colour
  assert.match(out, /\x1b\[0m$/);          // ends with a reset
});

test('gradientColor moves along the ramp and emits truecolor', () => {
  assert.match(gradientColor(50), /^\x1b\[38;2;\d+;\d+;\d+m$/);
  assert.notEqual(gradientColor(0), gradientColor(100));
});

test('rainbow colours the text per-letter and keeps it readable', () => {
  const out = rainbow('AB');
  assert.equal(stripAnsi(out), 'AB');
  assert.match(out, /\x1b\[/);             // contains colour escapes
});
