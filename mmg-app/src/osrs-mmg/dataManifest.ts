import type { DataManifest } from "./types";
import { MANIFEST_URL } from "./dataConfig";

export async function fetchManifest(): Promise<DataManifest> {
  const res = await fetch(MANIFEST_URL, { cache: "no-cache" });
  if (!res.ok) {
    throw new Error(`Failed to load manifest (${res.status}) from ${MANIFEST_URL}`);
  }
  return (await res.json()) as DataManifest;
}

export function isManifestStale(
  remote: DataManifest,
  cachedSha256: string | null,
): boolean {
  if (!cachedSha256) return true;
  return remote.artifacts.database.sha256 !== cachedSha256;
}

/** True when the latest wiki snapshot is before today (UTC). */
export function isSnapshotOutdated(manifest: DataManifest | null): boolean {
  if (!manifest?.latest_snapshot_date) return true;
  const todayUtc = new Date().toISOString().slice(0, 10);
  return manifest.latest_snapshot_date < todayUtc;
}
