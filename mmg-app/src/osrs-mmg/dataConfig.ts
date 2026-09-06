/** Local dev: run `make import-osrs-db` — files in data/osrs-mmg/ (gitignored, dev server only). */
export const LOCAL_DUCKDB_URL = import.meta.env.VITE_OSRS_DUCKDB_URL?.trim() ?? "";
export const LOCAL_MANIFEST_URL = import.meta.env.VITE_OSRS_MANIFEST_URL?.trim() ?? "";

export const OSRS_DATA_BASE =
  import.meta.env.VITE_OSRS_DATA_BASE?.replace(/\/$/, "") ?? "";

export const MANIFEST_URL = `${OSRS_DATA_BASE}/manifest.json`;
export const DUCKDB_FILENAME = "osrs-mmg.duckdb";

export function duckdbUrlFromManifest(manifest: { artifacts: { database: { url: string } } }): string {
  return `${OSRS_DATA_BASE}/${manifest.artifacts.database.url}`;
}

export function isLocalDuckdbMode(): boolean {
  return LOCAL_DUCKDB_URL.length > 0;
}

export function isRemoteDataEnabled(): boolean {
  return OSRS_DATA_BASE.length > 0;
}

export function isLiveDataEnabled(): boolean {
  return isLocalDuckdbMode() || isRemoteDataEnabled();
}
