// Unit tests for the glyph/label cascade (src/style.ts glyphFor/labelFor). The
// `cfg` object is the live singleton, so we set its glyphs/labels/elements maps to
// exercise the user tiers of the cascade, then restore.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { glyphFor, labelFor } from '../../src/style';
import { cfg } from '../../src/config';

function restore(): void { cfg.glyphs = undefined; cfg.labels = undefined; cfg.elements = undefined; }

test('glyphFor / labelFor return the caller fallback when nothing overrides', () => {
  restore();
  assert.equal(glyphFor('git.today', '✓'), '✓');
  assert.equal(labelFor('git.risk', 'risk:'), 'risk:');
});

test('a user glyphs/labels map overrides the fallback', () => {
  cfg.glyphs = { 'git.today': '★' };
  cfg.labels = { 'git.risk': 'danger:' };
  try {
    assert.equal(glyphFor('git.today', '✓'), '★');
    assert.equal(labelFor('git.risk', 'risk:'), 'danger:');
  } finally { restore(); }
});

test('a per-element glyph/label beats the map', () => {
  cfg.glyphs = { 'git.today': '★' };
  cfg.elements = { 'git.today': { glyph: '◆' }, 'git.risk': { label: 'DOOM:' } };
  try {
    assert.equal(glyphFor('git.today', '✓'), '◆');   // elements[id].glyph wins over glyphs map
    assert.equal(labelFor('git.risk', 'risk:'), 'DOOM:');
  } finally { restore(); }
});
