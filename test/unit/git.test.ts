// Unit test for the pure helper in src/git.ts (gitOut shells out, so it's covered
// by the golden suite instead).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countLines } from '../../src/git';

test('countLines counts non-empty lines only', () => {
  assert.equal(countLines(''), 0);
  assert.equal(countLines('a'), 1);
  assert.equal(countLines('a\nb'), 2);
  assert.equal(countLines('a\n\nb'), 2); // blank lines ignored
  assert.equal(countLines('a\n'), 1);    // trailing newline
});
