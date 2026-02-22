export interface MetadataTitle {
  title: string;
  language?: string; // ISO 639-1 language code, normalised from provider-specific formats
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
