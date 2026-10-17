import assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import { earliestDate } from './utils.js';

describe('earliestDate', () => {
  test('keeps the earliest of mixed date formats', () => {
    // Magical Explorer S01E04: TMDB and Cinemeta a week late, TVDB on time
    assert.equal(
      earliestDate(
        '2026-10-24T15:00:00.000Z',
        '2026-10-18',
        '2026-10-18',
        '2026-10-25'
      ),
      '2026-10-18'
    );
  });

  test('skips missing and unparseable dates', () => {
    assert.equal(
      earliestDate(undefined, null, '', 'not a date', '2026-10-11'),
      '2026-10-11'
    );
  });

  test('returns undefined when no date is usable', () => {
    assert.equal(earliestDate(undefined, 'TBA'), undefined);
    assert.equal(earliestDate(), undefined);
  });
});
