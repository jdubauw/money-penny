import { test } from 'node:test';
import assert from 'node:assert/strict';
import { presetRange, rangePreset } from '../frontend/src/lib/date-presets.ts';

test('current and previous calendar periods include their last day', () => {
  const today = new Date(2026, 9, 15, 12);
  for (const [preset, start, end] of [
    ['All time', '', ''], ['This month', '2026-10-01', '2026-10-31'],
    ['Last month', '2026-09-01', '2026-09-30'], ['This quarter', '2026-10-01', '2026-12-31'],
    ['Last quarter', '2026-07-01', '2026-09-30'], ['This year', '2026-01-01', '2026-12-31'],
    ['Last year', '2025-01-01', '2025-12-31'],
  ]) {
    assert.deepEqual(presetRange(preset, today), { start, end });
    assert.equal(rangePreset({ start, end }, today), preset);
  }
});
test('January rolls previous periods into the previous year', () => {
  const today = new Date(2026, 0, 15, 12);
  assert.deepEqual(presetRange('Last month', today), {start: '2025-12-01', end: '2025-12-31'});
  assert.deepEqual(presetRange('Last quarter', today), {start: '2025-10-01', end: '2025-12-31'});
});
test('leap years and custom or open-ended ranges', () => {
  assert.deepEqual(presetRange('This month', new Date(2024,1,15,12)), {start:'2024-02-01',end:'2024-02-29'});
  assert.equal(presetRange('Custom range'), null);
  assert.equal(rangePreset({start:'2026-01-03',end:''}), 'Custom range');
  assert.equal(rangePreset({start:'',end:'2026-01-03'}), 'Custom range');
});
