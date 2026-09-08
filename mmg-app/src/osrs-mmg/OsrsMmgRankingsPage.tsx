import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

import { isLiveDataEnabled } from "./dataConfig";
import { fetchMethodRankings, fetchMethodSkillsMap } from "./duckdbQueries";
import {
  cloneRankingsDraft,
  createRankingsProfile,
  deleteRankingsProfile,
  draftsEqual,
  getActiveRankingsProfile,
  listRankingsProfiles,
  loadActiveRankingsDraft,
  MAX_RANKINGS_PROFILES,
  patchActiveProfileWomPlayer,
  profileToDraft,
  saveActiveRankingsProfile,
  setActiveRankingsProfile,
} from "./kphPreferences";
import {
  disabledSetFromDraft,
  setAllRankingEnabledInDraft,
  setDraftKph,
  setRankingEnabledInDraft,
} from "./rankingsDraft";
import { RankingsUndoStack } from "./rankingsUndo";
import { formatGp, formatGpCompact, formatMargin, marginTone } from "./mmgCalc";
import { OsrsMmgDataBanner } from "./OsrsMmgDataBanner";
import { OsrsMmgKphToolbar } from "./OsrsMmgKphToolbar";
import { OsrsMmgProfileMenu } from "./OsrsMmgProfileMenu";
import { OsrsMmgRankingsFilter } from "./OsrsMmgRankingsFilter";
import { OsrsMmgSkillIcons } from "./OsrsMmgSkillIcons";
import {
  collectFilterOptions,
  methodMatchesRankingsFilters,
  normalizeRankingsFilters,
  rankingsFiltersActive,
} from "./rankingsFilters";
import { OsrsMmgTrendsPanel } from "./OsrsMmgTrendsPanel";
import { marginAtKph, profitAtKph, rankMethods, sortRowsByProfit, formatMethodCategories } from "./rankMethods";
import { SAMPLE_GUIDES } from "./sampleGuides";
import type { CharacterProfile } from "../osrs-character/types";
import type { MethodRankRow, RankingsDraftState, RankingsProfile, SkillRequirement } from "./types";
import { useOsrsData } from "./useOsrsData";
import { skillLevelsFromCharacterProfile } from "./womSkills";

function sampleSkillsMap(): Record<string, SkillRequirement[]> {
  return Object.fromEntries(
    SAMPLE_GUIDES.map((guide) => [guide.id, guide.skillRequirements]),
  );
}

function sampleToRankRows(): MethodRankRow[] {
  const sampleCategories: Record<string, string[]> = {
    marlin: ["Skilling", "Fishing"],
    tob: ["Combat", "High"],
    smithing: ["Skilling", "Smithing"],
    mokhaiotl: ["Combat", "Mid"],
  };

  return SAMPLE_GUIDES.map((g, i) => ({
    method_id: g.id,
    method_name: g.methodName,
    method_url: g.methodUrl,
    categories: sampleCategories[g.id] ?? ["Skilling"],
    intensity: "",
    is_members: null,
    default_kph: g.defaultKph,
    completions_unit_name: g.kphUnitName,
    input_total_pk: g.inputTotalPk,
    input_total_ph: g.inputTotalPh,
    output_total_pk: g.outputTotalPk,
    output_total_ph: g.outputTotalPh,
    profit_pk: g.outputTotalPk - g.inputTotalPk,
    profit_ph: g.outputTotalPh - g.inputTotalPh,
    profit_linear_approx: false,
    wiki_rank: i + 1,
    wiki_hourly_profit_gp: null,
    wiki_profit_gp:
      g.outputTotalPk * g.defaultKph +
      g.outputTotalPh -
      (g.inputTotalPk * g.defaultKph + g.inputTotalPh),
  }));
}

function loadProfileState() {
  const profile = getActiveRankingsProfile();
  const draft = profileToDraft(profile);
  return { profile, savedDraft: cloneRankingsDraft(draft), draft };
}

export default function OsrsMmgRankingsPage() {
  const data = useOsrsData();
  const undoStackRef = useRef(new RankingsUndoStack());
  const [rows, setRows] = useState<MethodRankRow[]>([]);
  const [profiles, setProfiles] = useState<RankingsProfile[]>(() => listRankingsProfiles());
  const [activeProfile, setActiveProfile] = useState<RankingsProfile>(() => getActiveRankingsProfile());
  const [savedDraft, setSavedDraft] = useState<RankingsDraftState>(() => loadActiveRankingsDraft());
  const [draft, setDraft] = useState<RankingsDraftState>(() => loadActiveRankingsDraft());
  const [prefsVersion, setPrefsVersion] = useState(0);
  const [showTopN, setShowTopN] = useState(20);
  const [searchQuery, setSearchQuery] = useState("");
  const [rerankActive, setRerankActive] = useState(false);
  const [skillsByMethod, setSkillsByMethod] = useState<Record<string, SkillRequirement[]>>({});

  function refreshProfiles() {
    setProfiles(listRankingsProfiles());
    setActiveProfile(getActiveRankingsProfile());
  }

  function resetDraftFromActiveProfile(clearUndo = true) {
    const { profile, savedDraft: nextSavedDraft, draft: nextDraft } = loadProfileState();
    setActiveProfile(profile);
    setSavedDraft(nextSavedDraft);
    setDraft(nextDraft);
    if (clearUndo) undoStackRef.current.clear();
  }

  useEffect(() => {
    function syncWomFromProfile() {
      const activeWom = getActiveRankingsProfile().wom_player;
      setDraft((prev) => {
        if (prev.wom_player?.fetchedAt === activeWom?.fetchedAt) return prev;
        return { ...prev, wom_player: activeWom };
      });
      setSavedDraft((prev) => {
        if (prev.wom_player?.fetchedAt === activeWom?.fetchedAt) return prev;
        return { ...prev, wom_player: activeWom };
      });
    }

    window.addEventListener("focus", syncWomFromProfile);
    return () => window.removeEventListener("focus", syncWomFromProfile);
  }, []);

  useEffect(() => {
    if (!isLiveDataEnabled()) {
      resetDraftFromActiveProfile();
      setRows(sampleToRankRows());
      setSkillsByMethod(sampleSkillsMap());
      refreshProfiles();
      return;
    }
    if (!data.ready) return;
    void Promise.all([fetchMethodRankings(), fetchMethodSkillsMap()]).then(([loaded, skills]) => {
      resetDraftFromActiveProfile();
      setRows(loaded);
      setSkillsByMethod(skills);
      refreshProfiles();
    });
  }, [data.ready, prefsVersion]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!event.altKey || event.key.toLowerCase() !== "z") return;
      event.preventDefault();
      const previous = undoStackRef.current.pop();
      if (!previous) return;
      setDraft(cloneRankingsDraft(previous));
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const disabledMethodIds = useMemo(() => disabledSetFromDraft(draft), [draft]);

  const ranked = useMemo(
    () => rankMethods(rows, draft.kph_by_method_id, disabledMethodIds),
    [rows, draft.kph_by_method_id, disabledMethodIds],
  );

  const rankByMethodId = useMemo(
    () => new Map(ranked.map((row, index) => [row.method_id, index + 1])),
    [ranked],
  );

  const normalizedSearch = searchQuery.trim().toLowerCase();

  const filterOptions = useMemo(() => collectFilterOptions(rows), [rows]);

  const rankingsFilters = useMemo(
    () => normalizeRankingsFilters(draft.rankings_filters),
    [draft.rankings_filters],
  );

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      if (normalizedSearch && !row.method_name.toLowerCase().includes(normalizedSearch)) {
        return false;
      }
      const kph = draft.kph_by_method_id[row.method_id] ?? row.default_kph;
      return methodMatchesRankingsFilters(
        row,
        skillsByMethod[row.method_id] ?? [],
        rankingsFilters,
        kph,
      );
    });
  }, [rows, normalizedSearch, skillsByMethod, rankingsFilters, draft.kph_by_method_id]);

  const tableRows = useMemo(() => {
    const source = rerankActive ?
      filteredRows.filter((row) => !disabledMethodIds.has(row.method_id))
    : filteredRows;

    const sorted = sortRowsByProfit(source, draft.kph_by_method_id);
    if (normalizedSearch || rankingsFiltersActive(rankingsFilters)) {
      return sorted;
    }
    return sorted.slice(0, showTopN);
  }, [
    filteredRows,
    rerankActive,
    disabledMethodIds,
    normalizedSearch,
    rankingsFilters,
    showTopN,
    draft.kph_by_method_id,
  ]);

  const displayRankByMethodId = useMemo(() => {
    if (!rerankActive) {
      return rankByMethodId;
    }
    const reranked = sortRowsByProfit(
      filteredRows.filter((row) => !disabledMethodIds.has(row.method_id)),
      draft.kph_by_method_id,
    );
    return new Map(reranked.map((row, index) => [row.method_id, index + 1]));
  }, [rerankActive, filteredRows, disabledMethodIds, draft.kph_by_method_id, rankByMethodId]);

  const bulkTargetIds = useMemo(
    () => tableRows.map((row) => row.method_id),
    [tableRows],
  );

  const bulkAllEnabled =
    bulkTargetIds.length > 0 && bulkTargetIds.every((id) => !disabledMethodIds.has(id));
  const bulkSomeEnabled = bulkTargetIds.some((id) => !disabledMethodIds.has(id));

  const hasUnsavedChanges = useMemo(
    () => !draftsEqual(draft, savedDraft),
    [draft, savedDraft],
  );

  function pushUndoSnapshot() {
    undoStackRef.current.push(cloneRankingsDraft(draft));
  }

  function applyDraft(updater: (prev: RankingsDraftState) => RankingsDraftState) {
    setDraft((prev) => {
      undoStackRef.current.push(cloneRankingsDraft(prev));
      return updater(prev);
    });
  }

  function onDraftKphChange(methodId: string, value: number) {
    setDraft((prev) => setDraftKph(prev, methodId, value));
  }

  function onKphFocus() {
    pushUndoSnapshot();
  }

  function onRankingEnabledChange(methodId: string, enabled: boolean) {
    applyDraft((prev) => setRankingEnabledInDraft(prev, methodId, enabled));
  }

  function onSetAllRankingEnabled(enabled: boolean) {
    applyDraft((prev) => setAllRankingEnabledInDraft(prev, bulkTargetIds, enabled));
  }

  function onDiscardChanges() {
    setDraft(cloneRankingsDraft(savedDraft));
    undoStackRef.current.clear();
  }

  function onSave() {
    const saved = saveActiveRankingsProfile(draft);
    const nextSavedDraft = profileToDraft(saved);
    setSavedDraft(nextSavedDraft);
    setDraft(cloneRankingsDraft(nextSavedDraft));
    setActiveProfile(saved);
    setProfiles(listRankingsProfiles());
    undoStackRef.current.clear();
    toast.success(`Saved v${saved.save_version}`);
  }

  function confirmDiscard(message: string): boolean {
    if (!hasUnsavedChanges) return true;
    return window.confirm(message);
  }

  function onProfileSelect(profileId: string) {
    if (profileId === activeProfile.id) return;
    if (!confirmDiscard("Discard unsaved changes and switch profile?")) return;
    setActiveRankingsProfile(profileId);
    resetDraftFromActiveProfile();
    refreshProfiles();
  }

  function onCreateProfile() {
    if (profiles.length >= MAX_RANKINGS_PROFILES) {
      toast.error(`Maximum of ${MAX_RANKINGS_PROFILES} profiles reached`);
      return;
    }
    const name = window.prompt("Profile name");
    if (!name?.trim()) return;
    if (!confirmDiscard("Discard unsaved changes and create a new profile?")) return;
    createRankingsProfile(name.trim());
    resetDraftFromActiveProfile();
    refreshProfiles();
    toast.success("Profile created");
  }

  function onDeleteProfile() {
    if (profiles.length <= 1) {
      toast.error("At least one profile is required");
      return;
    }
    const message = hasUnsavedChanges
      ? `Delete profile "${activeProfile.name}"? Unsaved changes will be lost.`
      : `Delete profile "${activeProfile.name}"?`;
    if (!window.confirm(message)) return;
    deleteRankingsProfile(activeProfile.id);
    resetDraftFromActiveProfile();
    refreshProfiles();
    toast.success("Profile deleted");
  }

  const topForChart = useMemo(
    () => rankMethods(rows, draft.kph_by_method_id, disabledMethodIds).slice(0, 10),
    [rows, draft.kph_by_method_id, disabledMethodIds],
  );

  function onRankingsFiltersChange(next: typeof rankingsFilters) {
    applyDraft((prev) => ({
      ...prev,
      rankings_filters: normalizeRankingsFilters(next),
    }));
  }

  function onWomPlayerLoaded(profile: CharacterProfile) {
    const saved = patchActiveProfileWomPlayer(profile);
    setActiveProfile(saved);
    setProfiles(listRankingsProfiles());
    setSavedDraft((prev) => ({ ...prev, wom_player: profile }));
    applyDraft((prev) => ({
      ...prev,
      wom_player: profile,
      rankings_filters: {
        ...normalizeRankingsFilters(prev.rankings_filters),
        skillLevels: skillLevelsFromCharacterProfile(profile),
      },
    }));
  }

  const searchResultCount =
    normalizedSearch || rankingsFiltersActive(rankingsFilters) ? tableRows.length : null;

  return (
    <div className="osrs-mmg">
      <header className="osrs-mmg__header osrs-mmg__header--compact">
        <div className="osrs-mmg__header-row">
          <h1>OSRS Money Maker Rankings</h1>
          <nav className="osrs-mmg__header-nav" aria-label="Page links">
            <a href="/">Home</a>
            <Link to="/q">Quests</Link>
          </nav>
        </div>
        <p>Adjust kph, toggle methods, then Save. Click a method for the calculator.</p>
      </header>

      {isLiveDataEnabled() ? (
        <OsrsMmgDataBanner
          loading={data.loading}
          error={data.error}
          manifest={data.manifest}
          fromCache={data.fromCache}
          loadPhase={data.loadPhase}
          downloadProgress={data.downloadProgress}
          onReload={data.reload}
        />
      ) : (
        <p className="osrs-mmg__banner">
          Offline sample data (set VITE_OSRS_DUCKDB_URL or VITE_OSRS_DATA_BASE for live data)
        </p>
      )}

      <div className="osrs-mmg__controls">
        <OsrsMmgProfileMenu
          profiles={profiles}
          activeProfile={activeProfile}
          hasUnsavedChanges={hasUnsavedChanges}
          maxProfiles={MAX_RANKINGS_PROFILES}
          onSelectProfile={onProfileSelect}
          onCreateProfile={onCreateProfile}
          onDeleteProfile={onDeleteProfile}
        />
        <button type="button" className="osrs-mmg__btn" disabled={!hasUnsavedChanges} onClick={onSave}>
          Save
        </button>
        <button
          type="button"
          className="osrs-mmg__btn osrs-mmg__btn--ghost"
          disabled={!hasUnsavedChanges}
          onClick={onDiscardChanges}
        >
          Discard
        </button>

        <div className="osrs-mmg__controls-grow">
          <input
            className="osrs-mmg__search-input"
            type="search"
            value={searchQuery}
            placeholder="Search methods…"
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchResultCount != null ? (
            <span className="osrs-mmg__search-count">{searchResultCount}</span>
          ) : null}
        </div>

        <label className="osrs-mmg__topn-field osrs-mmg__topn-field--compact">
          Top
          <input
            className="osrs-mmg__topn-input"
            type="number"
            min={1}
            max={500}
            value={showTopN}
            disabled={normalizedSearch.length > 0 || rankingsFiltersActive(rankingsFilters)}
            onChange={(e) => {
              const next = Math.max(1, Math.min(500, Number(e.target.value) || 1));
              setShowTopN(next);
            }}
          />
        </label>

        <button
          type="button"
          className={rerankActive ? "osrs-mmg__btn osrs-mmg__btn--active" : "osrs-mmg__btn osrs-mmg__btn--ghost"}
          onClick={() => setRerankActive((value) => !value)}
        >
          Re-rank
        </button>

        <OsrsMmgRankingsFilter
          filters={rankingsFilters}
          womPlayer={draft.wom_player}
          methodTypeOptions={filterOptions.methodTypes}
          intensityOptions={filterOptions.intensities}
          onChange={onRankingsFiltersChange}
          onWomPlayerLoaded={onWomPlayerLoaded}
        />

        <OsrsMmgKphToolbar onImported={() => setPrefsVersion((n) => n + 1)} />
      </div>

      <div className="osrs-mmg__table-scroll osrs-mmg__table-scroll--wide">
        <table className="osrs-mmg__table osrs-mmg__table--rankings">
          <thead>
            <tr>
              <th className="osrs-mmg__rank-bulk-head osrs-mmg__toggle-cell">
                <label className="osrs-mmg__rank-toggle">
                  <input
                    type="checkbox"
                    checked={bulkAllEnabled}
                    ref={(el) => {
                      if (el) el.indeterminate = bulkSomeEnabled && !bulkAllEnabled;
                    }}
                    onChange={(e) => onSetAllRankingEnabled(e.target.checked)}
                  />
                  <span className="osrs-mmg__sr-only">Toggle all visible methods in rankings</span>
                </label>
              </th>
              <th className="osrs-mmg__rank-cell">#</th>
              <th className="osrs-mmg__method-cell">Method</th>
              <th className="osrs-mmg__type-cell">Type</th>
              <th className="osrs-mmg__skills-cell">Skills</th>
              <th className="osrs-mmg__wiki-gp-cell">Wiki GP/h</th>
              <th className="osrs-mmg__kph-cell">Your kph</th>
              <th className="osrs-mmg__adjusted-gp-cell">Adjusted GP/h</th>
              <th className="osrs-mmg__margin-cell">Margin</th>
              <th className="osrs-mmg__members-cell">Members</th>
            </tr>
          </thead>
          <tbody>
            {tableRows.map((row) => {
              const kph = draft.kph_by_method_id[row.method_id] ?? row.default_kph;
              const adjusted = profitAtKph(row, kph);
              const margin = marginAtKph(row, kph);
              const isDisabled = disabledMethodIds.has(row.method_id);
              const rank = displayRankByMethodId.get(row.method_id);
              const rankLabel = rerankActive || !isDisabled ? rank : null;
              return (
                <tr
                  key={row.method_id}
                  className={isDisabled ? "osrs-mmg__table-row--disabled" : undefined}
                >
                  <td className="osrs-mmg__toggle-cell">
                    <label className="osrs-mmg__rank-toggle">
                      <input
                        type="checkbox"
                        checked={!isDisabled}
                        onChange={(e) => onRankingEnabledChange(row.method_id, e.target.checked)}
                      />
                      <span className="osrs-mmg__sr-only">
                        {isDisabled ? "Excluded from rankings" : "Included in rankings"}
                      </span>
                    </label>
                  </td>
                  <td className="osrs-mmg__rank-cell">{rankLabel ?? "—"}</td>
                  <td className="osrs-mmg__method-cell">
                    {rankLabel != null ?
                      <span className="osrs-mmg__method-rank" aria-hidden="true">
                        {rankLabel}.{" "}
                      </span>
                    : null}
                    <Link to={`/m/${row.method_id}`}>{row.method_name}</Link>
                  </td>
                  <td className="osrs-mmg__type-cell">{formatMethodCategories(row.categories)}</td>
                  <td className="osrs-mmg__skills-cell">
                    <OsrsMmgSkillIcons skills={skillsByMethod[row.method_id] ?? []} compact />
                  </td>
                  <td className="osrs-mmg__wiki-gp-cell">
                    {row.wiki_hourly_profit_gp != null ?
                      <>
                        <span className="osrs-mmg__gp-full">{formatGp(row.wiki_hourly_profit_gp)}</span>
                        <span className="osrs-mmg__gp-compact">
                          {formatGpCompact(row.wiki_hourly_profit_gp)} gp
                        </span>
                      </>
                    : "—"}
                  </td>
                  <td className="osrs-mmg__kph-cell">
                    <input
                      className="osrs-mmg__kph-input"
                      type="number"
                      min={0}
                      step="any"
                      value={kph}
                      title={row.completions_unit_name}
                      onFocus={onKphFocus}
                      onChange={(e) => onDraftKphChange(row.method_id, Number(e.target.value))}
                    />
                    <span className="osrs-mmg__kph-unit">{row.completions_unit_name}</span>
                  </td>
                  <td className="osrs-mmg__adjusted-gp-cell">
                    <span className="osrs-mmg__gp-full">{formatGp(adjusted)}</span>
                    <span className="osrs-mmg__gp-compact">{formatGpCompact(adjusted)} gp</span>
                  </td>
                  <td className={`osrs-mmg__margin-cell osrs-mmg__margin-cell--${marginTone(margin)}`}>
                    {formatMargin(margin)}
                  </td>
                  <td className="osrs-mmg__members-cell">
                    {row.is_members ? "Yes" : row.is_members === false ? "No" : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {(isLiveDataEnabled() ? data.ready : true) ? (
        <OsrsMmgTrendsPanel mode="topN" topMethods={topForChart} topN={10} />
      ) : null}
    </div>
  );
}
