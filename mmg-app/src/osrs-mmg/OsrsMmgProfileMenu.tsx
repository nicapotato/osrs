import { useEffect, useRef, useState } from "react";

import type { RankingsProfile } from "./types";

type Props = {
  profiles: RankingsProfile[];
  activeProfile: RankingsProfile;
  hasUnsavedChanges: boolean;
  maxProfiles: number;
  onSelectProfile: (profileId: string) => void;
  onCreateProfile: () => void;
  onDeleteProfile: () => void;
};

function formatTimestamp(value: string): string {
  return new Date(value).toLocaleString("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function OsrsMmgProfileMenu({
  profiles,
  activeProfile,
  hasUnsavedChanges,
  maxProfiles,
  onSelectProfile,
  onCreateProfile,
  onDeleteProfile,
}: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    window.addEventListener("mousedown", onPointerDown);
    return () => window.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  return (
    <div className="osrs-mmg__profile-menu" ref={rootRef}>
      <button
        type="button"
        className="osrs-mmg__profile-trigger"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="osrs-mmg__profile-trigger-name">{activeProfile.name}</span>
        {hasUnsavedChanges ? <span className="osrs-mmg__unsaved-dot" aria-label="Unsaved changes" /> : null}
        <span className="osrs-mmg__profile-trigger-caret" aria-hidden>
          ▾
        </span>
      </button>

      {open ? (
        <div className="osrs-mmg__profile-dropdown">
          <div className="osrs-mmg__profile-dropdown-meta">
            <span>v{activeProfile.save_version}</span>
            <span>{formatTimestamp(activeProfile.updated_at)}</span>
          </div>

          <div className="osrs-mmg__profile-list">
            {profiles.map((profile) => (
              <button
                key={profile.id}
                type="button"
                className={
                  profile.id === activeProfile.id ?
                    "osrs-mmg__profile-option is-active"
                  : "osrs-mmg__profile-option"
                }
                onClick={() => {
                  onSelectProfile(profile.id);
                  setOpen(false);
                }}
              >
                <span>{profile.name}</span>
                <span className="osrs-mmg__profile-option-meta">v{profile.save_version}</span>
              </button>
            ))}
          </div>

          <div className="osrs-mmg__profile-dropdown-actions">
            <button type="button" disabled={profiles.length >= maxProfiles} onClick={onCreateProfile}>
              New
            </button>
            <button type="button" disabled={profiles.length <= 1} onClick={onDeleteProfile}>
              Delete
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
