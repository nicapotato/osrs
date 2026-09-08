import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

import {
  getActiveRankingsProfile,
  patchActiveProfileWomPlayer,
} from "../osrs-mmg/kphPreferences";
import { skillIconUrl } from "../osrs-mmg/skillIconUrl";
import {
  clearCharacterProfile,
  loadCharacterProfile,
  parseCharacterProfileImport,
} from "./characterStorage";
import type { CharacterProfile, WomFetchMeta } from "./types";
import { loadWomPlayer, refreshWomPlayer, WomApiError } from "./womClient";

function formatTimestamp(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatXp(value: number): string {
  return value.toLocaleString("en-GB");
}

function loadInitialProfile(): CharacterProfile | null {
  const fromProfile = getActiveRankingsProfile().wom_player;
  if (fromProfile) return fromProfile;

  const legacy = loadCharacterProfile();
  if (!legacy) return null;

  patchActiveProfileWomPlayer(legacy);
  clearCharacterProfile();
  return legacy;
}

export default function OsrsCharacterPage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [usernameInput, setUsernameInput] = useState("");
  const [profile, setProfile] = useState<CharacterProfile | null>(() => loadInitialProfile());
  const [lastMeta, setLastMeta] = useState<WomFetchMeta | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showRaw, setShowRaw] = useState(false);

  useEffect(() => {
    function syncFromProfile() {
      const activeWom = getActiveRankingsProfile().wom_player;
      setProfile((prev) => (prev?.fetchedAt === activeWom?.fetchedAt ? prev : activeWom));
    }

    window.addEventListener("focus", syncFromProfile);
    return () => window.removeEventListener("focus", syncFromProfile);
  }, []);

  useEffect(() => {
    if (profile && !usernameInput) {
      setUsernameInput(profile.displayName);
    }
  }, [profile, usernameInput]);

  function persistProfile(next: CharacterProfile | null) {
    patchActiveProfileWomPlayer(next);
    setProfile(next);
  }

  async function runFetch(mode: "load" | "refresh") {
    setLoading(true);
    setError(null);

    try {
      const username = usernameInput.trim() || profile?.username || "";
      const result =
        mode === "refresh" ? await refreshWomPlayer(username) : await loadWomPlayer(username);

      persistProfile(result.profile);
      setLastMeta(result.meta);
      setUsernameInput(result.profile.displayName);
      toast.success(mode === "refresh" ? "Character refreshed from WOM" : "Character loaded");
    } catch (err) {
      const message =
        err instanceof WomApiError ? err.message
        : err instanceof Error ? err.message : "Request failed";
      setError(message);
      if (err instanceof WomApiError) {
        setLastMeta({ endpoint: mode === "refresh" ? "POST" : "GET", status: err.status, raw: err.body });
      }
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  function onClearSaved() {
    persistProfile(null);
    setLastMeta(null);
    setError(null);
    toast.success("Saved character cleared");
  }

  function onExportCharacter() {
    if (!profile) return;
    const blob = new Blob([JSON.stringify(profile, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `osrs-character-${profile.username.replace(/\s+/g, "-")}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Character exported");
  }

  async function onImportFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const parsed = parseCharacterProfileImport(JSON.parse(await file.text()));
      persistProfile(parsed);
      setLastMeta(null);
      setError(null);
      setUsernameInput(parsed.displayName);
      toast.success("Character imported");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed");
    }
  }

  return (
    <div className="osrs-mmg osrs-character">
      <header className="osrs-mmg__header osrs-mmg__header--compact">
        <div className="osrs-mmg__header-row">
          <h1>OSRS Character</h1>
          <nav className="osrs-mmg__header-nav" aria-label="Page links">
            <a href="/">Home</a>
            <Link to="/quests">Quests</Link>
          </nav>
        </div>
        <p>
          Load a player from{" "}
          <a href="https://wiseoldman.net" target="_blank" rel="noreferrer">
            Wise Old Man
          </a>
          . Saved to your active MMG rankings profile.
        </p>
      </header>

      <div className="osrs-character__panel">
        <label className="osrs-mmg__field">
          RuneScape name
          <input
            className="osrs-mmg__search-input"
            type="text"
            maxLength={12}
            placeholder="e.g. Lynx Titan"
            value={usernameInput}
            disabled={loading}
            onChange={(e) => setUsernameInput(e.target.value)}
          />
        </label>

        <div className="osrs-character__actions">
          <button
            type="button"
            className="osrs-mmg__btn"
            disabled={loading || !usernameInput.trim()}
            onClick={() => void runFetch("load")}
          >
            {loading ? "Looking up…" : "Lookup"}
          </button>
          <button
            type="button"
            className="osrs-mmg__btn osrs-mmg__btn--ghost"
            disabled={loading || (!usernameInput.trim() && !profile)}
            onClick={() => void runFetch("refresh")}
            title="POST /players/:username — triggers WOM to update from hiscores"
          >
            Refresh
          </button>
          <button
            type="button"
            className="osrs-mmg__btn osrs-mmg__btn--ghost"
            disabled={!profile}
            onClick={onExportCharacter}
          >
            Export
          </button>
          <button
            type="button"
            className="osrs-mmg__btn osrs-mmg__btn--ghost"
            onClick={() => fileRef.current?.click()}
          >
            Import
          </button>
          <button
            type="button"
            className="osrs-mmg__btn osrs-mmg__btn--ghost"
            disabled={!profile}
            onClick={onClearSaved}
          >
            Clear saved
          </button>
          <button
            type="button"
            className="osrs-mmg__btn osrs-mmg__btn--ghost"
            disabled={!lastMeta}
            onClick={() => setShowRaw((value) => !value)}
          >
            {showRaw ? "Hide" : "Show"} raw JSON
          </button>
          <Link className="osrs-mmg__btn osrs-mmg__btn--ghost" to="/mmg">
            Rankings
          </Link>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            hidden
            onChange={(e) => void onImportFileChange(e)}
          />
        </div>

      </div>

      {error ? <p className="osrs-character__error">{error}</p> : null}

      {profile ? (
        <>
          <dl className="osrs-character__meta">
            <div>
              <dt>Display name</dt>
              <dd>{profile.displayName}</dd>
            </div>
            <div>
              <dt>Account type</dt>
              <dd>{profile.playerType}</dd>
            </div>
            <div>
              <dt>Combat level</dt>
              <dd>{profile.combatLevel ?? "—"}</dd>
            </div>
            <div>
              <dt>Loaded at</dt>
              <dd>{formatTimestamp(profile.fetchedAt)}</dd>
            </div>
            <div>
              <dt>WOM updated</dt>
              <dd>{formatTimestamp(profile.womUpdatedAt)}</dd>
            </div>
            <div>
              <dt>Snapshot date</dt>
              <dd>{formatTimestamp(profile.snapshotCreatedAt)}</dd>
            </div>
          </dl>

          <div className="osrs-mmg__table-scroll">
            <table className="osrs-mmg__table osrs-character__skills-table">
              <thead>
                <tr>
                  <th>Skill</th>
                  <th>Level</th>
                  <th>XP</th>
                  <th>Rank</th>
                </tr>
              </thead>
              <tbody>
                {profile.skills.map((skill) => (
                  <tr key={skill.womMetric}>
                    <td>
                      <span className="osrs-character__skill-cell">
                        <img src={skillIconUrl(skill.skillKey)} alt="" width={20} height={20} />
                        {skill.skillKey}
                      </span>
                    </td>
                    <td>{skill.level}</td>
                    <td>{formatXp(skill.experience)}</td>
                    <td>{skill.rank > 0 ? skill.rank.toLocaleString("en-GB") : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <p className="osrs-character__empty">
          No character loaded. Enter a name and click Lookup, or Refresh if WOM returns 404.
        </p>
      )}

      {showRaw && lastMeta ? (
        <pre className="osrs-character__raw">{JSON.stringify(lastMeta.raw, null, 2)}</pre>
      ) : null}
    </div>
  );
}
