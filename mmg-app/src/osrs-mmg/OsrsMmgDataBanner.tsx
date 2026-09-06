import { isSnapshotOutdated } from "./dataManifest";
import type { FetchProgress } from "./dataCache";
import type { LoadPhase } from "./useOsrsData";
import type { DataManifest } from "./types";

type Props = {
  loading: boolean;
  error: string | null;
  manifest: DataManifest | null;
  fromCache: boolean;
  loadPhase: LoadPhase;
  downloadProgress: FetchProgress | null;
  onReload: () => void;
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function loadPhaseLabel(phase: LoadPhase, fromCache: boolean): string {
  switch (phase) {
    case "manifest":
      return "Checking for updates…";
    case "cache":
      return "Reading cached database…";
    case "download":
      return "Downloading database…";
    case "open":
      return fromCache ? "Opening cached database…" : "Opening database…";
    default:
      return "Loading OSRS data…";
  }
}

export function OsrsMmgDataBanner({
  loading,
  error,
  manifest,
  fromCache,
  loadPhase,
  downloadProgress,
  onReload,
}: Props) {
  if (loading) {
    const percent =
      downloadProgress?.total ?
        Math.min(100, Math.round((downloadProgress.loaded / downloadProgress.total) * 100))
      : null;

    return (
      <div className="osrs-mmg__banner osrs-mmg__banner--loading" role="status" aria-live="polite">
        <div className="osrs-mmg__load-status">
          <span>{loadPhaseLabel(loadPhase, fromCache)}</span>
          {downloadProgress ?
            <span className="osrs-mmg__load-bytes">
              {formatBytes(downloadProgress.loaded)}
              {downloadProgress.total ? ` / ${formatBytes(downloadProgress.total)}` : ""}
              {percent != null ? ` (${percent}%)` : ""}
            </span>
          : null}
        </div>
        {loadPhase === "download" || loadPhase === "open" ?
          <div
            className="osrs-mmg__progress"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent ?? undefined}
            aria-label={loadPhaseLabel(loadPhase, fromCache)}
          >
            <div
              className={
                percent != null ?
                  "osrs-mmg__progress-bar"
                : "osrs-mmg__progress-bar osrs-mmg__progress-bar--indeterminate"
              }
              style={percent != null ? { width: `${percent}%` } : undefined}
            />
          </div>
        : null}
      </div>
    );
  }

  if (error) {
    return (
      <p className="osrs-mmg__banner osrs-mmg__banner--error">
        {error}{" "}
        <button type="button" onClick={onReload}>
          Retry
        </button>
      </p>
    );
  }

  if (!manifest || !isSnapshotOutdated(manifest)) {
    return null;
  }

  return (
    <p className="osrs-mmg__banner osrs-mmg__banner--stale">
      Data from {manifest.generated_at}
      {manifest.latest_snapshot_date ? ` · snapshot ${manifest.latest_snapshot_date}` : ""}
      {fromCache ? " · cached" : " · fresh download"}
      {" · "}
      <button type="button" onClick={onReload}>
        Refresh
      </button>
    </p>
  );
}
