import { useCallback, useEffect, useState } from "react";

import {
  isLocalDuckdbMode,
  isRemoteDataEnabled,
  LOCAL_DUCKDB_URL,
  LOCAL_MANIFEST_URL,
  duckdbUrlFromManifest,
} from "./dataConfig";
import { fetchDuckdbBytes, readCachedDuckdb, writeCachedDuckdb, type FetchProgress } from "./dataCache";
import { fetchManifest, isManifestStale } from "./dataManifest";
import { initDuckdbWithBytes } from "./duckdbClient";
import type { DataManifest } from "./types";

export type LoadPhase = "manifest" | "cache" | "download" | "open" | null;

type OsrsDataState = {
  ready: boolean;
  loading: boolean;
  error: string | null;
  manifest: DataManifest | null;
  fromCache: boolean;
  localMode: boolean;
  loadPhase: LoadPhase;
  downloadProgress: FetchProgress | null;
};

export function useOsrsData(): OsrsDataState & { reload: () => void } {
  const [state, setState] = useState<OsrsDataState>({
    ready: false,
    loading: isLocalDuckdbMode() || isRemoteDataEnabled(),
    error: null,
    manifest: null,
    fromCache: false,
    localMode: isLocalDuckdbMode(),
    loadPhase: isLocalDuckdbMode() || isRemoteDataEnabled() ? "manifest" : null,
    downloadProgress: null,
  });
  const [reloadToken, setReloadToken] = useState(0);

  const reload = useCallback(() => {
    setReloadToken((n) => n + 1);
  }, []);

  useEffect(() => {
    if (!isLocalDuckdbMode() && !isRemoteDataEnabled()) {
      setState({
        ready: false,
        loading: false,
        error: null,
        manifest: null,
        fromCache: false,
        localMode: false,
        loadPhase: null,
        downloadProgress: null,
      });
      return;
    }

    let cancelled = false;

    async function bootLocal(): Promise<void> {
      setState((s) => ({
        ...s,
        loadPhase: "download",
        downloadProgress: { loaded: 0, total: null },
      }));

      const bytes = await fetchDuckdbBytes(LOCAL_DUCKDB_URL, (progress) => {
        if (!cancelled) {
          setState((s) => ({ ...s, downloadProgress: progress }));
        }
      });

      const cacheKey = `${LOCAL_DUCKDB_URL}:${bytes.byteLength}`;

      let manifest: DataManifest | null = null;
      if (LOCAL_MANIFEST_URL) {
        const manifestRes = await fetch(LOCAL_MANIFEST_URL, { cache: "no-cache" });
        if (manifestRes.ok) {
          manifest = (await manifestRes.json()) as DataManifest;
        }
      }

      setState((s) => ({ ...s, loadPhase: "open", downloadProgress: null }));
      await initDuckdbWithBytes(bytes, cacheKey);
      if (!cancelled) {
        setState({
          ready: true,
          loading: false,
          error: null,
          manifest,
          fromCache: false,
          localMode: true,
          loadPhase: null,
          downloadProgress: null,
        });
      }
    }

    async function bootRemote(): Promise<void> {
      setState((s) => ({ ...s, loadPhase: "manifest", downloadProgress: null }));
      const manifest = await fetchManifest();

      setState((s) => ({ ...s, loadPhase: "cache" }));
      const cached = await readCachedDuckdb();
      const stale = isManifestStale(manifest, cached?.sha256 ?? null);

      let bytes: ArrayBuffer;
      let fromCache = false;
      if (!stale && cached) {
        bytes = cached.bytes;
        fromCache = true;
        setState((s) => ({ ...s, loadPhase: "open", downloadProgress: null }));
      } else {
        setState((s) => ({
          ...s,
          loadPhase: "download",
          downloadProgress: { loaded: 0, total: null },
        }));
        bytes = await fetchDuckdbBytes(duckdbUrlFromManifest(manifest), (progress) => {
          if (!cancelled) {
            setState((s) => ({ ...s, downloadProgress: progress }));
          }
        });
        await writeCachedDuckdb({
          sha256: manifest.artifacts.database.sha256,
          bytes,
          fetchedAt: new Date().toISOString(),
        });
        setState((s) => ({ ...s, loadPhase: "open", downloadProgress: null }));
      }

      await initDuckdbWithBytes(bytes, manifest.artifacts.database.sha256);
      if (!cancelled) {
        setState({
          ready: true,
          loading: false,
          error: null,
          manifest,
          fromCache,
          localMode: false,
          loadPhase: null,
          downloadProgress: null,
        });
      }
    }

    async function boot() {
      setState((s) => ({
        ...s,
        loading: true,
        error: null,
        loadPhase: "manifest",
        downloadProgress: null,
      }));
      try {
        if (isLocalDuckdbMode()) {
          await bootLocal();
        } else {
          await bootRemote();
        }
      } catch (err) {
        if (!cancelled) {
          setState({
            ready: false,
            loading: false,
            error: err instanceof Error ? err.message : String(err),
            manifest: null,
            fromCache: false,
            localMode: isLocalDuckdbMode(),
            loadPhase: null,
            downloadProgress: null,
          });
        }
      }
    }

    void boot();
    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  return { ...state, reload };
}
