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
    assert.deepEqual(names(plan.textIndexers), ['TextTracker']);
    // a movie-only indexer reports no TV parameters: it cannot hold a series
    assert.deepEqual(names(plan.skipped), ['MovieTracker']);
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
      assert.deepEqual(names(plan.textIndexers), ['IdTracker', 'TextTracker']);
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

  it('leaves anime-only indexers out of everything that is not anime', () => {
    const animeTracker = indexer(
      5,
      'AnimeTracker',
      ['q'],
      ['q', 'season', 'ep']
    );
    const options = { animeOnlyIndexers: ['animetracker'] };
    for (const target of [
      { mediaType: 'movie', imdbId: 'tt0000001' },
      { mediaType: 'series', tvdbId: 1, season: 1 },
    ]) {
      const plan = planProwlarrSearches(
        target,
        [byImdbAndTvdb, animeTracker],
        options
      );
      assert.deepEqual(
        names(plan.skipped),
        ['AnimeTracker'],
        JSON.stringify(target)
      );
      assert.equal(plan.textIndexers.length, 0);
    }
    const anime = planProwlarrSearches(
      { mediaType: 'series', tvdbId: 1, season: 1, isAnime: true },
      [byImdbAndTvdb, animeTracker],
      options
    );
    assert.deepEqual(names(anime.textIndexers), ['IdTracker']);
    assert.deepEqual(names(anime.titleOnlyIndexers), ['AnimeTracker']);
    assert.equal(anime.skipped.length, 0);
  });

  it('searches anime by TVDB id when its episode is mapped to a TVDB season', () => {
    const plan = planProwlarrSearches(
      {
        mediaType: 'series',
        tvdbId: 7,
        season: 1,
        tvdbSeason: 2,
        isAnime: true,
      },
      all
    );
    assert.equal(plan.idSearches.length, 1);
    assert.equal(plan.idSearches[0].query, '{TvdbId:7}{Season:2}');
    assert.deepEqual(names(plan.idSearches[0].indexers), ['IdTracker']);
    assert.deepEqual(names(plan.textIndexers), ['TextTracker']);
  });

  it('searches anime-only indexers by title alone for a series, not for a movie', () => {
    const animeTracker = indexer(
      5,
      'AnimeTracker',
      ['q'],
      ['q', 'season', 'ep']
    );
    const options = { animeOnlyIndexers: ['AnimeTracker'] };
    const series = planProwlarrSearches(
      { mediaType: 'series', tvdbId: 1, season: 1, isAnime: true },
      [animeTracker],
      options
    );
    assert.deepEqual(names(series.titleOnlyIndexers), ['AnimeTracker']);
    assert.equal(series.textIndexers.length, 0);
    const movie = planProwlarrSearches(
      { mediaType: 'movie', imdbId: 'tt0000001', isAnime: true },
      [animeTracker],
      options
    );
    assert.deepEqual(names(movie.textIndexers), ['AnimeTracker']);
    assert.equal(movie.titleOnlyIndexers.length, 0);
  });

  it('does nothing when switched off', () => {
    const plan = planProwlarrSearches(
      { mediaType: 'movie', imdbId: 'tt0000001' },
      all,
      { idSearch: false }
    );
    assert.equal(plan.idSearches.length, 0);
    assert.deepEqual(names(plan.textIndexers), names(all));
  });
});
