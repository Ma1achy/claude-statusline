// Unit tests for the pure parts of src/state.ts: the session-key derivation
// (session_id → sanitized, else FNV hash of transcript path, else 'default') and
// the ring-buffer push (clamp + round + cap). The fs-touching read/write/janitor
// paths are exercised by the golden/behavioural suite.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sessionKey, pushSpark, type SessionState } from '../../src/state';

test('sessionKey prefers a sanitized session_id', () => {
  assert.equal(sessionKey({ session_id: 'abc123' }), 'abc123');
  assert.equal(sessionKey({ session_id: 'a/b c!d' }), 'abcd'); // strips non [A-Za-z0-9_-]
});

test('sessionKey falls back to a stable hash of the transcript path', () => {
  const a = sessionKey({ transcript_path: '/home/u/.claude/projects/x.jsonl' });
  const b = sessionKey({ transcript_path: '/home/u/.claude/projects/x.jsonl' });
  const c = sessionKey({ transcript_path: '/home/u/.claude/projects/y.jsonl' });
  assert.equal(a, b);                       // deterministic
  assert.notEqual(a, c);                    // path-sensitive
  assert.match(a, /^[0-9a-f]+$/);           // hex
});

test('sessionKey defaults to "default" with no identifiers', () => {
  assert.equal(sessionKey({}), 'default');
});

test('pushSpark clamps, rounds, and caps the ring buffer', () => {
  const s: SessionState = { v: 1, updated: 0, spark: [], compactions: 0 };
  pushSpark(s, 42.4);
  assert.deepEqual(s.spark, [42]);          // rounded
  pushSpark(s, 150);
  pushSpark(s, -5);
  assert.deepEqual(s.spark, [42, 100, 0]);  // clamped to 0..100

  for (let i = 0; i < 40; i++) pushSpark(s, i);
  assert.equal(s.spark.length, 30);         // capped at SPARK_CAP
  assert.equal(s.spark.at(-1), 39);         // newest retained
});
