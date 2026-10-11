import type { ProwlarrApiIndexer } from './api.js';

export interface ProwlarrIdSearch {
  type: 'movie' | 'tvsearch';
  query: string;
  indexers: ProwlarrApiIndexer[];
}

export interface ProwlarrSearchPlan {
  idSearches: ProwlarrIdSearch[];
  textIndexers: ProwlarrApiIndexer[];
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
 */
export function planProwlarrSearches(
  target: ProwlarrSearchTarget,
  indexers: ProwlarrApiIndexer[],
  enabled = true
): ProwlarrSearchPlan {
  if (!enabled) return { idSearches: [], textIndexers: indexers };

  const imdbId =
    target.imdbId && /^tt\d+$/.test(target.imdbId) ? target.imdbId : undefined;
  const tvdbId = target.tvdbId && target.tvdbId > 0 ? target.tvdbId : undefined;
  const seriesById =
    target.mediaType === 'series' && !target.isAnime && !target.isDateBased;
  const tvdbSeason = target.tvdbSeason ?? target.season;

  const searches = new Map<string, ProwlarrIdSearch>();
  const textIndexers: ProwlarrApiIndexer[] = [];
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
    const movieParams = indexer.capabilities?.movieSearchParams ?? [];
    const tvParams = indexer.capabilities?.tvSearchParams ?? [];

    if (
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

  return { idSearches: [...searches.values()], textIndexers };
}
