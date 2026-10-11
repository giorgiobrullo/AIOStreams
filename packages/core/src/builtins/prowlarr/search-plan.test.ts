import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { ProwlarrApiIndexer } from './api.js';
import { planProwlarrSearches } from './search-plan.js';

function indexer(
  id: number,
  name: string,
  movieSearchParams: string[],
  tvSearchParams: string[]
): ProwlarrApiIndexer {
  return {
    id,
    name,
    sortName: name.toLowerCase(),
    definitionName: name,
    enable: true,
    protocol: 'torrent',
    privacy: 'private',
    tags: [],
    capabilities: { movieSearchParams, tvSearchParams },
  };
}

// The capabilities Prowlarr reports for these kinds of trackers.
const byImdbAndTvdb = indexer(
  1,
  'IdTracker',
  ['q', 'imdbId'],
  ['q', 'season', 'ep', 'tvdbId']
);
const moviesByImdb = indexer(2, 'MovieTracker', ['q', 'imdbId'], []);
const textOnly = indexer(3, 'TextTracker', ['q'], ['q', 'season', 'ep']);
const tvByImdb = indexer(
  4,
  'ImdbTvTracker',
  ['q'],
  ['q', 'season', 'ep', 'imdbId']
);
const all = [byImdbAndTvdb, moviesByImdb, textOnly];

const names = (list: ProwlarrApiIndexer[]) => list.map((i) => i.name);

describe('planProwlarrSearches', () => {
  it('searches a movie once by IMDb id on every indexer that supports it', () => {
    const plan = planProwlarrSearches(
      { mediaType: 'movie', imdbId: 'tt0000001' },
      all
    );
    assert.equal(plan.idSearches.length, 1);
    assert.deepEqual(plan.idSearches[0].type, 'movie');
    assert.equal(plan.idSearches[0].query, '{ImdbId:tt0000001}');
    assert.deepEqual(names(plan.idSearches[0].indexers), [
      'IdTracker',
      'MovieTracker',
    ]);
    assert.deepEqual(names(plan.textIndexers), ['TextTracker']);
  });

  it('searches a series by TVDB id and season, not by episode', () => {
    const plan = planProwlarrSearches(
      { mediaType: 'series', imdbId: 'tt0000002', tvdbId: 12345, season: 3 },
      all
    );
    assert.deepEqual(
      plan.idSearches.map((s) => [s.type, s.query, names(s.indexers)]),
      [['tvsearch', '{TvdbId:12345}{Season:3}', ['IdTracker']]]
    );
    // a movie-only indexer has no TV parameters, so it stays on titles
    assert.deepEqual(names(plan.textIndexers), ['MovieTracker', 'TextTracker']);
  });

  it('uses the TVDB season numbering with the TVDB id', () => {
    const plan = planProwlarrSearches(
      { mediaType: 'series', tvdbId: 12345, season: 2, tvdbSeason: 5 },
      [byImdbAndTvdb]
    );
    assert.equal(plan.idSearches[0].query, '{TvdbId:12345}{Season:5}');
  });

  it('falls back to the IMDb id for series when the indexer takes it and TVDB is unknown', () => {
    const plan = planProwlarrSearches(
      { mediaType: 'series', imdbId: 'tt0000002', season: 1 },
      [byImdbAndTvdb, tvByImdb]
    );
    assert.deepEqual(
      plan.idSearches.map((s) => [s.query, names(s.indexers)]),
      [['{ImdbId:tt0000002}{Season:1}', ['ImdbTvTracker']]]
    );
    assert.deepEqual(names(plan.textIndexers), ['IdTracker']);
  });

  it('keeps anime, date-based shows and specials on titles', () => {
    for (const target of [
      { mediaType: 'series', tvdbId: 1, season: 1, isAnime: true },
      { mediaType: 'series', tvdbId: 1, season: 2024, isDateBased: true },
      { mediaType: 'series', tvdbId: 1, season: 0 },
      { mediaType: 'series', tvdbId: 1 },
    ]) {
      const plan = planProwlarrSearches(target, all);
      assert.equal(plan.idSearches.length, 0, JSON.stringify(target));
      assert.deepEqual(names(plan.textIndexers), names(all));
    }
  });

  it('ignores ids that are not IMDb ids', () => {
    const plan = planProwlarrSearches(
      { mediaType: 'movie', imdbId: '603' },
      all
    );
    assert.equal(plan.idSearches.length, 0);
  });

  it('treats indexers without reported capabilities as title-only', () => {
    const { capabilities: _, ...bare } = byImdbAndTvdb;
    const plan = planProwlarrSearches(
      { mediaType: 'movie', imdbId: 'tt0000001' },
      [bare]
    );
    assert.equal(plan.idSearches.length, 0);
    assert.deepEqual(names(plan.textIndexers), ['IdTracker']);
  });

  it('does nothing when switched off', () => {
    const plan = planProwlarrSearches(
      { mediaType: 'movie', imdbId: 'tt0000001' },
      all,
      false
    );
    assert.equal(plan.idSearches.length, 0);
    assert.deepEqual(names(plan.textIndexers), names(all));
  });
});
