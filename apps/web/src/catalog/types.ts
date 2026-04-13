/** Per-quality torrent options from the catalog API */
export type CatalogTorrentOption = {
  quality?: string;
  type?: string;
  size?: string;
  seeders?: string;
  leechers?: string;
  magnet: string;
};

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
  /** When present, user can pick quality/version before download */
  torrents?: CatalogTorrentOption[];
};

export type ApiFn = (path: string, init?: RequestInit) => Promise<Response>;
