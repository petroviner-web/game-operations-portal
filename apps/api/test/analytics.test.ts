import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAnalyticsRange } from '../src/analytics/analytics.validation';
test('analytics defaults cover seven UTC days, including today, across year and leap boundaries', () => {
  assert.deepEqual(parseAnalyticsRange({}, new Date('2026-01-02T00:10:00Z')), {
    from: '2025-12-27',
    to: '2026-01-03',
  });
  assert.deepEqual(parseAnalyticsRange({}, new Date('2024-03-01T23:59:59Z')), {
    from: '2024-02-24',
    to: '2024-03-02',
  });
});
test('analytics accepts calendar dates and bounds ranges to 1–90 days without DST shifts', () => {
  assert.deepEqual(parseAnalyticsRange({ from: '2024-02-29', to: '2024-03-01' }), {
    from: '2024-02-29',
    to: '2024-03-01',
  });
  assert.deepEqual(parseAnalyticsRange({ from: '2026-01-01', to: '2026-04-01' }), {
    from: '2026-01-01',
    to: '2026-04-01',
  });
  for (const query of [
    { from: '2026-02-29', to: '2026-03-01' },
    { from: '2026-01-01' },
    { from: '2026-01-01', to: '2026-01-01' },
    { from: '2026-01-02', to: '2026-01-01' },
    { from: '2026-01-01', to: '2026-04-02' },
    { from: '0000-01-01', to: '0000-01-02' },
    { from: '2026-03-01T00:00:00Z', to: '2026-03-02' },
    { ownerId: 'other' },
  ])
    assert.throws(() => parseAnalyticsRange(query), { status: 400 });
});
