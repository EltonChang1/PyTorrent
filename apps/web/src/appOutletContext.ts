import type { ApiFn } from "./catalog/types";

export type TorrentJob = {
  id: string;
  name: string;
  download_dir: string;
  total: number;
  downloaded: number;
  uploaded?: number;
  complete: boolean;
  error: string | null;
};

export type AppOutletContext = {
  api: ApiFn;
  showToast: (msg: string, kind?: "ok" | "err") => void;
  refreshTorrents: () => Promise<void>;
  torrentRows: TorrentJob[];
  searchConfigured: boolean;
};
