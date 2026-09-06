import { useRef } from "react";
import { toast } from "sonner";

import { exportKphBackup, exportProfilesBackup, importKphBackup, importProfilesBackup } from "./kphPreferences";
import type { KphPreferencesFile, RankingsProfilesFile } from "./types";

type Props = {
  onImported: () => void;
};

export function OsrsMmgKphToolbar({ onImported }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);

  function onExportProfiles() {
    const payload = exportProfilesBackup();
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "osrs-mmg-profiles-backup.json";
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Profiles exported");
  }

  function onExportActive() {
    const payload = exportKphBackup();
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "osrs-mmg-active-profile.json";
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Profile exported");
  }

  async function onFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as RankingsProfilesFile | KphPreferencesFile;
      if (parsed.version === 2) {
        importProfilesBackup(parsed);
      } else if (parsed.version === 1) {
        importKphBackup(parsed);
      } else {
        throw new Error("Unsupported backup version");
      }
      onImported();
      toast.success("Imported");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed");
    }
  }

  return (
    <>
      <button type="button" className="osrs-mmg__btn osrs-mmg__btn--ghost" onClick={onExportProfiles}>
        Export all
      </button>
      <button type="button" className="osrs-mmg__btn osrs-mmg__btn--ghost" onClick={onExportActive}>
        Export
      </button>
      <button type="button" className="osrs-mmg__btn osrs-mmg__btn--ghost" onClick={() => fileRef.current?.click()}>
        Import
      </button>
      <input ref={fileRef} type="file" accept="application/json" hidden onChange={onFileChange} />
    </>
  );
}
