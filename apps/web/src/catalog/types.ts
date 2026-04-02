export type CatalogItem = {
  name?: string;
  magnet?: string;
  size?: string;
  seeders?: string;
  leechers?: string;
  poster?: string | string[];
  /** Used with GET /catalog/poster when all poster URLs fail */
  imdb_code?: string;
  url?: string;
  category?: string;
};

export type ApiFn = (path: string, init?: RequestInit) => Promise<Response>;
