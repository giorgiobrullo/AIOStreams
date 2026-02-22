export interface MetadataTitle {
  title: string;
  language?: string; // ISO 639-1 language code, normalised from provider-specific formats
}

/**
 * Deduplicates a list of MetadataTitle entries by title string (case-insensitive).
 * Insertion order of first occurrence is preserved.
 */
export function deduplicateTitles(titles: MetadataTitle[]): MetadataTitle[] {
  const titleLangs = new Map<string, Set<string>>();
  const titleHasUntagged = new Set<string>();
  const titleKeys: string[] = [];
  const titleFirstOccurrence = new Map<string, MetadataTitle>();

  for (const t of titles) {
    const key = t.title.toLowerCase();
    if (!titleLangs.has(key)) {
      titleLangs.set(key, new Set());
      titleKeys.push(key);
      titleFirstOccurrence.set(key, t);
    }
    if (t.language) {
      titleLangs.get(key)!.add(t.language);
    } else {
      titleHasUntagged.add(key);
    }
  }

  return titleKeys.map((key) => {
    const first = titleFirstOccurrence.get(key)!;
    const langs = titleLangs.get(key)!;
    const unambiguous = langs.size === 1 && !titleHasUntagged.has(key);
    return {
      title: first.title,
      language: unambiguous ? [...langs][0] : undefined,
    };
  });
}

export interface Metadata {
  title: string;
  titles?: MetadataTitle[];
  year?: number;
  yearEnd?: number;
  originalLanguage?: string;
  releaseDate?: string;
  runtime?: number; // Runtime in minutes
  seasons?: {
    season_number: number;
    episode_count: number;
  }[];
  tmdbId?: number | null;
  tvdbId?: number | null;
  genres?: string[]; // Genre names (e.g., ["Action", "Drama"])
  nextAirDate?: string;
  firstAiredDate?: string;
  lastAiredDate?: string;
}
