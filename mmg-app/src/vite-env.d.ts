/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_OSRS_DUCKDB_URL?: string;
  readonly VITE_OSRS_MANIFEST_URL?: string;
  readonly VITE_OSRS_DATA_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
