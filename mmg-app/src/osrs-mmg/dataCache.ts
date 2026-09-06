const DB_NAME = "osrs-mmg-cache";
const STORE = "artifacts";
const DUCKDB_KEY = "duckdb";

type CachedArtifact = {
  sha256: string;
  bytes: ArrayBuffer;
  fetchedAt: string;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB open failed"));
  });
}

export async function readCachedDuckdb(): Promise<CachedArtifact | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(DUCKDB_KEY);
    req.onsuccess = () => resolve((req.result as CachedArtifact | undefined) ?? null);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB read failed"));
  });
}

export async function writeCachedDuckdb(artifact: CachedArtifact): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(artifact, DUCKDB_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB write failed"));
  });
}

export type FetchProgress = {
  loaded: number;
  total: number | null;
};

export async function fetchBytesWithProgress(
  url: string,
  onProgress?: (progress: FetchProgress) => void,
): Promise<ArrayBuffer> {
  const res = await fetch(url, { cache: "no-cache" });
  if (!res.ok) {
    throw new Error(`Failed to download DuckDB (${res.status})`);
  }

  const totalHeader = res.headers.get("content-length");
  const total = totalHeader ? Number(totalHeader) : null;

  if (!res.body || !onProgress) {
    return res.arrayBuffer();
  }

  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    onProgress({ loaded, total });
  }

  const out = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out.buffer;
}

export async function fetchDuckdbBytes(
  url: string,
  onProgress?: (progress: FetchProgress) => void,
): Promise<ArrayBuffer> {
  return fetchBytesWithProgress(url, onProgress);
}
