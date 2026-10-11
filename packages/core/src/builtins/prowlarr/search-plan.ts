import type { ProwlarrApiIndexer } from './api.js';

export interface ProwlarrIdSearch {
  type: 'movie' | 'tvsearch';
  query: string;
  indexers: ProwlarrApiIndexer[];
}

export interface ProwlarrSearchPlan {
  idSearches: ProwlarrIdSearch[];
  textIndexers: ProwlarrApiIndexer[];
  /** Indexers left out because they cannot hold this content. */
  skipped: ProwlarrApiIndexer[];
}

export interface ProwlarrSearchTarget {
  mediaType: string;
  season?: number;
  tvdbSeason?: number;
  imdbId?: string | null;
  tvdbId?: number | null;
  isAnime?: boolean;
  isDateBased?: boolean;
}

export interface ProwlarrSearchPlanOptions {
  /** Search ID-capable indexers by ID (default true). */
  idSearch?: boolean;
  /** Names of indexers that only carry anime (e.g. AnimeBytes). */
  animeOnlyIndexers?: string[];
}

/**
 * Splits the chosen indexers between searches by ID and searches by title.
 *
 * An indexer that declares an IMDb or TVDB parameter for the content type gets
 * one search by that ID; a series is searched by season, so season packs and
 * episodes come back together and every episode of the season shares the
 * cached result. The other indexers keep the title variants. Rate-limited
 * trackers (Prowlarr allows HDBits one request every 4 s) otherwise queue the
 * five or six title variants past the addon timeout, and the ID search is also
 * the precise one: a title search for "vikings" returns Vikings: Valhalla too.
 *
 * Anime and date-based shows stay on titles: their episode numbering does not
 * reliably match the indexers' seasons.
 *
 * Indexers that cannot hold the content are left out instead of being sent the
 * title variants: the anime-only ones (configured, since Prowlarr reports their
 * categories under the same TV parent as any tracker) for anything that is not
 * anime, and those reporting no search parameters at all for the content type
 * (a movie-only tracker for a series).
 */
export function planProwlarrSearches(
  target: ProwlarrSearchTarget,
  indexers: ProwlarrApiIndexer[],
  options: ProwlarrSearchPlanOptions = {}
): ProwlarrSearchPlan {
  const { idSearch = true, animeOnlyIndexers = [] } = options;
  const animeOnly = new Set(animeOnlyIndexers.map((n) => n.toLowerCase()));
  const imdbId =
    target.imdbId && /^tt\d+$/.test(target.imdbId) ? target.imdbId : undefined;
  const tvdbId = target.tvdbId && target.tvdbId > 0 ? target.tvdbId : undefined;
  const seriesById =
    target.mediaType === 'series' && !target.isAnime && !target.isDateBased;
  const tvdbSeason = target.tvdbSeason ?? target.season;

  const searches = new Map<string, ProwlarrIdSearch>();
  const textIndexers: ProwlarrApiIndexer[] = [];
  const skipped: ProwlarrApiIndexer[] = [];
  const add = (
    type: ProwlarrIdSearch['type'],
    query: string,
    indexer: ProwlarrApiIndexer
  ) => {
    const key = `${type}:${query}`;
    const search = searches.get(key) ?? { type, query, indexers: [] };
    search.indexers.push(indexer);
    searches.set(key, search);
  };

  for (const indexer of indexers) {
    const caps = indexer.capabilities;
    const movieParams = caps?.movieSearchParams ?? [];
    const tvParams = caps?.tvSearchParams ?? [];
    const params =
      target.mediaType === 'movie'
        ? caps?.movieSearchParams
        : target.mediaType === 'series'
          ? caps?.tvSearchParams
          : undefined;
    const isAnimeOnly = [
      indexer.name,
      indexer.definitionName,
      indexer.sortName,
    ].some((n) => animeOnly.has(n.toLowerCase()));

    if ((isAnimeOnly && !target.isAnime) || (params && params.length === 0)) {
      skipped.push(indexer);
    } else if (!idSearch) {
      textIndexers.push(indexer);
    } else if (
      target.mediaType === 'movie' &&
      imdbId &&
      movieParams.includes('imdbId')
    ) {
      add('movie', `{ImdbId:${imdbId}}`, indexer);
    } else if (
      seriesById &&
      tvdbId &&
      tvdbSeason &&
      tvParams.includes('tvdbId') &&
      tvParams.includes('season')
    ) {
      add('tvsearch', `{TvdbId:${tvdbId}}{Season:${tvdbSeason}}`, indexer);
    } else if (
      seriesById &&
      imdbId &&
      target.season &&
      tvParams.includes('imdbId') &&
      tvParams.includes('season')
    ) {
      add('tvsearch', `{ImdbId:${imdbId}}{Season:${target.season}}`, indexer);
    } else {
      textIndexers.push(indexer);
    }
  }

  return { idSearches: [...searches.values()], textIndexers, skipped };
}
