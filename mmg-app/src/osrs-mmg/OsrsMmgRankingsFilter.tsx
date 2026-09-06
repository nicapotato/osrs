import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

import { loadWomPlayer, refreshWomPlayer, WomApiError } from "../osrs-character/womClient";
import type { CharacterProfile } from "../osrs-character/types";
import { skillIconUrl } from "./skillIconUrl";
import {
  EMPTY_RANKINGS_FILTERS,
  OSRS_SKILL_KEYS,
  rankingsFiltersActive,
  type GroupContentFilter,
  type RankingsFilters,
} from "./rankingsFilters";

type Props = {
  filters: RankingsFilters;
  womPlayer: CharacterProfile | null;
  methodTypeOptions: string[];
  intensityOptions: string[];
  onChange: (filters: RankingsFilters) => void;
  onWomPlayerLoaded: (profile: CharacterProfile) => void;
};

function toggleValue(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

function formatSnapshotAge(value: string | null): string {
  if (!value) return "unknown date";
  return new Date(value).toLocaleString("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function OsrsMmgRankingsFilter({
  filters,
  womPlayer,
  methodTypeOptions,
  intensityOptions,
  onChange,
  onWomPlayerLoaded,
}: Props) {
  const [open, setOpen] = useState(false);
  const [usernameInput, setUsernameInput] = useState("");
  const [womLoading, setWomLoading] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const active = rankingsFiltersActive(filters);

  useEffect(() => {
    if (womPlayer?.displayName && !usernameInput) {
      setUsernameInput(womPlayer.displayName);
    }
  }, [womPlayer, usernameInput]);

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

  function setSkillLevel(skillKey: string, value: number) {
    const nextLevels = { ...filters.skillLevels };
    if (!Number.isFinite(value) || value <= 0) {
      delete nextLevels[skillKey];
    } else {
      nextLevels[skillKey] = Math.min(99, Math.max(1, Math.floor(value)));
    }
    onChange({ ...filters, skillLevels: nextLevels });
  }

  async function runWomLookup(mode: "load" | "refresh") {
    const username = usernameInput.trim() || womPlayer?.username || "";
    if (!username) {
      toast.error("Enter a RuneScape name first");
      return;
    }

    setWomLoading(true);
    try {
      const result =
        mode === "refresh" ? await refreshWomPlayer(username) : await loadWomPlayer(username);
      onWomPlayerLoaded(result.profile);
      setUsernameInput(result.profile.displayName);
      toast.success(mode === "refresh" ? "Character refreshed" : "Skill levels applied from WOM");
    } catch (err) {
      const message =
        err instanceof WomApiError ? err.message
        : err instanceof Error ? err.message : "WOM lookup failed";
      toast.error(message);
    } finally {
      setWomLoading(false);
    }
  }

  return (
    <div className="osrs-mmg__filter-menu" ref={rootRef}>
      <button
        type="button"
        className={active || womPlayer ? "osrs-mmg__btn osrs-mmg__btn--active" : "osrs-mmg__btn osrs-mmg__btn--ghost"}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        Filter{active || womPlayer ? " •" : ""}
      </button>

      {open ? (
        <div className="osrs-mmg__filter-popout">
          <div className="osrs-mmg__filter-section">
            <h3>Character (Wise Old Man)</h3>
            <label className="osrs-mmg__field">
              RuneScape name
              <input
                className="osrs-mmg__search-input"
                type="text"
                maxLength={12}
                placeholder="Lookup skills from WOM"
                value={usernameInput}
                disabled={womLoading}
                onChange={(e) => setUsernameInput(e.target.value)}
              />
            </label>
            <div className="osrs-mmg__filter-wom-actions">
              <button
                type="button"
                className="osrs-mmg__btn"
                disabled={womLoading || !usernameInput.trim()}
                onClick={() => void runWomLookup("load")}
              >
                {womLoading ? "Looking up…" : "Lookup"}
              </button>
              <button
                type="button"
                className="osrs-mmg__btn osrs-mmg__btn--ghost"
                disabled={womLoading || (!usernameInput.trim() && !womPlayer)}
                onClick={() => void runWomLookup("refresh")}
              >
                Refresh
              </button>
              <Link className="osrs-mmg__filter-link" to="/c">
                Character page
              </Link>
            </div>
            {womPlayer ? (
              <p className="osrs-mmg__filter-hint">
                {womPlayer.displayName} ({womPlayer.playerType}) — snapshot{" "}
                {formatSnapshotAge(womPlayer.snapshotCreatedAt ?? womPlayer.fetchedAt)}
              </p>
            ) : null}
          </div>

          <div className="osrs-mmg__filter-section">
            <h3>Bank / group</h3>
            <label className="osrs-mmg__field">
              Liquid GP
              <input
                className="osrs-mmg__search-input"
                type="number"
                min={0}
                step={1}
                placeholder="No cap"
                value={filters.liquidGp ?? ""}
                onChange={(e) => {
                  const raw = e.target.value.trim();
                  const parsed = Number(raw);
                  onChange({
                    ...filters,
                    liquidGp: raw === "" || !Number.isFinite(parsed) || parsed <= 0 ? null : Math.floor(parsed),
                  });
                }}
              />
            </label>
            <p className="osrs-mmg__filter-hint">
              Hide methods whose hourly input cost is above this budget.
            </p>
            <label className="osrs-mmg__field">
              Group content
              <select
                className="osrs-mmg__search-input"
                value={filters.groupContent}
                onChange={(e) =>
                  onChange({
                    ...filters,
                    groupContent: e.target.value as GroupContentFilter,
                  })
                }
              >
                <option value="any">Any</option>
                <option value="solo">Solo only</option>
                <option value="group">Group only</option>
              </select>
            </label>
            <div className="osrs-mmg__filter-party-range">
              <label className="osrs-mmg__field">
                Party min
                <input
                  className="osrs-mmg__search-input"
                  type="number"
                  min={1}
                  max={99}
                  placeholder="1"
                  value={filters.partySizeMin ?? ""}
                  onChange={(e) => {
                    const raw = e.target.value.trim();
                    const parsed = Number(raw);
                    onChange({
                      ...filters,
                      partySizeMin: raw === "" || !Number.isFinite(parsed) || parsed <= 0
                        ? null
                        : Math.floor(parsed),
                    });
                  }}
                />
              </label>
              <label className="osrs-mmg__field">
                Party max
                <input
                  className="osrs-mmg__search-input"
                  type="number"
                  min={1}
                  max={99}
                  placeholder="—"
                  value={filters.partySizeMax ?? ""}
                  onChange={(e) => {
                    const raw = e.target.value.trim();
                    const parsed = Number(raw);
                    onChange({
                      ...filters,
                      partySizeMax: raw === "" || !Number.isFinite(parsed) || parsed <= 0
                        ? null
                        : Math.floor(parsed),
                    });
                  }}
                />
              </label>
            </div>
          </div>

          <div className="osrs-mmg__filter-section">
            <h3>Method type</h3>
            <div className="osrs-mmg__filter-checks">
              {methodTypeOptions.map((option) => (
                <label key={option} className="osrs-mmg__filter-check">
                  <input
                    type="checkbox"
                    checked={filters.methodTypes.includes(option)}
                    onChange={() =>
                      onChange({
                        ...filters,
                        methodTypes: toggleValue(filters.methodTypes, option),
                      })
                    }
                  />
                  <span>{option}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="osrs-mmg__filter-section">
            <h3>Intensity</h3>
            <div className="osrs-mmg__filter-checks">
              {intensityOptions.map((option) => (
                <label key={option} className="osrs-mmg__filter-check">
                  <input
                    type="checkbox"
                    checked={filters.intensities.includes(option)}
                    onChange={() =>
                      onChange({
                        ...filters,
                        intensities: toggleValue(filters.intensities, option),
                      })
                    }
                  />
                  <span>{option}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="osrs-mmg__filter-section">
            <h3>Your skill levels</h3>
            <p className="osrs-mmg__filter-hint">
              Methods must meet every listed requirement at or below your level.
            </p>
            <div className="osrs-mmg__filter-skills-scroll">
              <table className="osrs-mmg__table osrs-mmg__filter-skills-table">
                <thead>
                  <tr>
                    <th>Skill</th>
                    <th>Level</th>
                  </tr>
                </thead>
                <tbody>
                  {OSRS_SKILL_KEYS.map((skillKey) => (
                    <tr key={skillKey}>
                      <td>
                        <span className="osrs-mmg__filter-skill-name">
                          <img src={skillIconUrl(skillKey)} alt="" width={20} height={20} />
                          {skillKey}
                        </span>
                      </td>
                      <td>
                        <input
                          className="osrs-mmg__filter-level-input"
                          type="number"
                          min={1}
                          max={99}
                          placeholder="—"
                          value={filters.skillLevels[skillKey] ?? ""}
                          onChange={(e) => {
                            const raw = e.target.value.trim();
                            setSkillLevel(skillKey, raw === "" ? 0 : Number(raw));
                          }}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="osrs-mmg__filter-actions">
            <button
              type="button"
              className="osrs-mmg__btn osrs-mmg__btn--ghost"
              disabled={!active && !womPlayer}
              onClick={() => onChange(EMPTY_RANKINGS_FILTERS)}
            >
              Clear filters
            </button>
            <button type="button" className="osrs-mmg__btn" onClick={() => setOpen(false)}>
              Done
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
