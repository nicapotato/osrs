import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { getActiveRankingsProfile, patchActiveProfileWomPlayer } from "../osrs-mmg/kphPreferences";
import type { CharacterProfile } from "../osrs-character/types";
import { loadWomPlayer, refreshWomPlayer, WomApiError } from "../osrs-character/womClient";
import { QUESTS_PATH, questPath } from "../routes";
import { useQuestGraphSelection } from "./graphInteraction";
import { loadQuestGraph } from "./loadGraph";
import { indexGraph } from "./neighborhood";
import { playerContextFromProfile, statusForNode } from "./playerState";
import {
  EMPTY_QUEST_FILTERS,
  isCompletableNode,
  nodeMatchesFilters,
  uniqueDifficulties,
  uniqueSeries,
} from "./questFilters";
import { loadCompletedQuestIds, toggleCompletedQuest } from "./questProgress";
import { QuestGraphLegend } from "./QuestGraphLegend";
import { QuestHeatmap } from "./QuestHeatmap";
import { QuestNetworkSvg } from "./QuestNetworkSvg";
import { QuestPackSvg } from "./QuestPackSvg";
import { QuestNodeMenu } from "./QuestNodeMenu";
import type {
  HeatmapColumnMode,
  HeatmapMetric,
  HeatmapSort,
  MembersFilter,
  QuestGraph,
  QuestNetworkView,
  QuestPlayerStatus,
} from "./types";

function wikiCreditDate(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", { dateStyle: "medium" });
}

export default function OsrsQuestNetworkPage() {
  const navigate = useNavigate();
  const [graph, setGraph] = useState<QuestGraph | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState(EMPTY_QUEST_FILTERS);
  const [profile, setProfile] = useState<CharacterProfile | null>(() => getActiveRankingsProfile().wom_player);
  const [usernameInput, setUsernameInput] = useState(profile?.displayName ?? "");
  const [womLoading, setWomLoading] = useState(false);
  const [isolatedId, setIsolatedId] = useState<string | null>(null);
  const [view, setView] = useState<QuestNetworkView>("pack");
  const [heatmapColumns, setHeatmapColumns] = useState<HeatmapColumnMode>("series");
  const [heatmapMetric, setHeatmapMetric] = useState<HeatmapMetric>("quests");
  const [heatmapColumnSort, setHeatmapColumnSort] = useState<HeatmapSort>("levelSum");
  const [heatmapRowSort, setHeatmapRowSort] = useState<HeatmapSort>("levelSum");
  const [completed, setCompleted] = useState<Set<string>>(
    () => loadCompletedQuestIds(getActiveRankingsProfile().wom_player?.username),
  );

  useEffect(() => {
    let cancelled = false;
    loadQuestGraph()
      .then((loaded) => {
        if (!cancelled) setGraph(loaded);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load quest graph");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const indexed = useMemo(() => (graph ? indexGraph(graph) : null), [graph]);
  const seriesOptions = useMemo(() => (graph ? uniqueSeries(graph.nodes) : []), [graph]);
  const difficultyOptions = useMemo(() => (graph ? uniqueDifficulties(graph.nodes) : []), [graph]);
  const playerCtx = useMemo(() => playerContextFromProfile(profile, completed), [profile, completed]);

  const visibleQuestIds = useMemo(() => {
    if (!graph) return new Set<string>();
    return new Set(graph.nodes.filter((node) => nodeMatchesFilters(node, filters)).map((node) => node.id));
  }, [filters, graph]);

  const statusById = useMemo(() => {
    const result: Record<string, QuestPlayerStatus> = {};
    if (!graph || !indexed) return result;
    for (const node of graph.nodes) {
      result[node.id] = statusForNode(graph, node, playerCtx, indexed.incoming);
    }
    return result;
  }, [graph, indexed, playerCtx]);

  const focusNode = useCallback(
    (nodeId: string) => {
      navigate(questPath(nodeId));
    },
    [navigate],
  );
  const selection = useQuestGraphSelection(focusNode);

  function onNetworkNodeClick(nodeId: string) {
    selection.closeMenu();
    setIsolatedId((prev) => (prev === nodeId ? null : nodeId));
  }

  function onNetworkBackground() {
    setIsolatedId(null);
    selection.clear();
  }

  useEffect(() => {
    setIsolatedId(null);
    selection.clear();
  }, [filters, view]);

  async function runWom(mode: "load" | "refresh") {
    setWomLoading(true);
    try {
      const username = usernameInput.trim() || profile?.username || "";
      const result = mode === "refresh" ? await refreshWomPlayer(username) : await loadWomPlayer(username);
      patchActiveProfileWomPlayer(result.profile);
      setProfile(result.profile);
      setUsernameInput(result.profile.displayName);
      setCompleted(loadCompletedQuestIds(result.profile.username));
      toast.success(mode === "refresh" ? "Character refreshed from WOM" : "Character loaded");
    } catch (err) {
      const message =
        err instanceof WomApiError ? err.message : err instanceof Error ? err.message : "WOM lookup failed";
      toast.error(message);
    } finally {
      setWomLoading(false);
    }
  }

  function onToggleNodeDone(nodeId: string) {
    const node = indexed?.nodesById.get(nodeId);
    if (!node || !isCompletableNode(node)) return;
    setCompleted(new Set(toggleCompletedQuest(profile?.username, nodeId)));
  }

  if (error) {
    return (
      <div className="osrs-mmg osrs-mmg--fill osrs-quest">
        <header className="osrs-mmg__header osrs-mmg__header--compact">
          <h1>Quest network</h1>
        </header>
        <p className="osrs-quest__error">{error}</p>
      </div>
    );
  }

  if (!graph || !indexed) {
    return (
      <div className="osrs-mmg osrs-mmg--fill osrs-quest">
        <p>Loading quest graph…</p>
      </div>
    );
  }

  const menu = selection.menu;
  const menuNode = menu ? indexed.nodesById.get(menu.nodeId) : null;
  if (menu && !menuNode) {
    throw new Error(`quest network: menu missing ${menu.nodeId}`);
  }

  return (
    <div className="osrs-mmg osrs-quest">
      <div className="osrs-quest__stage">
        <header className="osrs-mmg__header osrs-mmg__header--compact">
          <div className="osrs-mmg__header-row">
            <h1>Quest network</h1>
            <nav className="osrs-mmg__header-nav" aria-label="Page links">
              <a href="/">Home</a>
              <Link to="/mmg">Money makers</Link>
              <Link to="/mmg/c">Character</Link>
              <Link to={QUESTS_PATH}>Neighborhood</Link>
              <Link to="/skills">Skills</Link>
            </nav>
          </div>
        </header>

        <div className="osrs-quest__toolbar">
          <label className="osrs-mmg__field osrs-quest__field">
            View
            <select value={view} onChange={(event) => setView(event.target.value as QuestNetworkView)}>
              <option value="pack">Family packing</option>
              <option value="heatmap">Skill heatmap</option>
              <option value="force">Force network</option>
            </select>
          </label>
          {view === "heatmap" ? (
            <>
              <label className="osrs-mmg__field osrs-quest__field">
                Columns
                <select
                  value={heatmapColumns}
                  onChange={(event) => {
                    const next = event.target.value as HeatmapColumnMode;
                    setHeatmapColumns(next);
                    setHeatmapColumnSort(next === "difficulty" ? "difficulty" : "levelSum");
                  }}
                >
                  <option value="series">Storyline</option>
                  <option value="difficulty">Difficulty</option>
                </select>
              </label>
              <label className="osrs-mmg__field osrs-quest__field">
                Cell
                <select
                  value={heatmapMetric}
                  onChange={(event) => setHeatmapMetric(event.target.value as HeatmapMetric)}
                >
                  <option value="quests">Quest count</option>
                  <option value="maxLevel">Max level</option>
                  <option value="sumLevel">Sum of levels</option>
                </select>
              </label>
              <label className="osrs-mmg__field osrs-quest__field">
                Sort columns
                <select
                  value={heatmapColumnSort}
                  onChange={(event) => setHeatmapColumnSort(event.target.value as HeatmapSort)}
                >
                  <option value="name">Name</option>
                  <option value="quests">Quest count</option>
                  <option value="levelSum">Level sum</option>
                  <option value="difficulty">Difficulty</option>
                </select>
              </label>
              <label className="osrs-mmg__field osrs-quest__field">
                Sort rows
                <select
                  value={heatmapRowSort}
                  onChange={(event) => setHeatmapRowSort(event.target.value as HeatmapSort)}
                >
                  <option value="name">Name</option>
                  <option value="quests">Quest count</option>
                  <option value="levelSum">Level sum</option>
                </select>
              </label>
            </>
          ) : null}
          <label className="osrs-mmg__field osrs-quest__field">
            Members
            <select
              value={filters.members}
              onChange={(event) =>
                setFilters((prev) => ({ ...prev, members: event.target.value as MembersFilter }))
              }
            >
              <option value="all">All</option>
              <option value="members">Members</option>
              <option value="f2p">Free-to-play</option>
            </select>
          </label>
          <label className="osrs-mmg__field osrs-quest__field">
            Series
            <select
              value={filters.series}
              onChange={(event) => setFilters((prev) => ({ ...prev, series: event.target.value }))}
            >
              <option value="">All storylines</option>
              {seriesOptions.map((series) => (
                <option key={series} value={series}>
                  {series}
                </option>
              ))}
            </select>
          </label>
          <label className="osrs-mmg__field osrs-quest__field">
            Difficulty
            <select
              value={filters.difficulty}
              onChange={(event) => setFilters((prev) => ({ ...prev, difficulty: event.target.value }))}
            >
              <option value="">All</option>
              {difficultyOptions.map((difficulty) => (
                <option key={difficulty} value={difficulty}>
                  {difficulty}
                </option>
              ))}
            </select>
          </label>
          <fieldset className="osrs-mmg__field osrs-quest__field osrs-quest__kinds">
            <legend>Type</legend>
            <span className="osrs-quest__kinds-row">
              <label>
                <input
                  type="checkbox"
                  checked={filters.kinds.quest}
                  onChange={(event) =>
                    setFilters((prev) => ({ ...prev, kinds: { ...prev.kinds, quest: event.target.checked } }))
                  }
                />
                Quests
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={filters.kinds.miniquest}
                  onChange={(event) =>
                    setFilters((prev) => ({
                      ...prev,
                      kinds: { ...prev.kinds, miniquest: event.target.checked },
                    }))
                  }
                />
                Miniquests
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={filters.kinds.diary}
                  onChange={(event) =>
                    setFilters((prev) => ({ ...prev, kinds: { ...prev.kinds, diary: event.target.checked } }))
                  }
                />
                Diaries
              </label>
              {view === "heatmap" ? null : (
                <label>
                  <input
                    type="checkbox"
                    checked={filters.kinds.skill}
                    onChange={(event) =>
                      setFilters((prev) => ({ ...prev, kinds: { ...prev.kinds, skill: event.target.checked } }))
                    }
                  />
                  Skills
                </label>
              )}
            </span>
          </fieldset>
          <p className="osrs-mmg__search-count osrs-quest__field">
            {visibleQuestIds.size} shown
          </p>
          <label className="osrs-mmg__field osrs-quest__field osrs-quest__field--grow">
            Wise Old Man
            <span className="osrs-quest__wom">
              <input
                className="osrs-mmg__search-input"
                maxLength={12}
                value={usernameInput}
                disabled={womLoading}
                onChange={(event) => setUsernameInput(event.target.value)}
                placeholder="RuneScape name"
              />
              <button
                type="button"
                className="osrs-mmg__btn"
                disabled={womLoading || !usernameInput.trim()}
                onClick={() => void runWom("load")}
              >
                {womLoading ? "…" : "Lookup"}
              </button>
              <button
                type="button"
                className="osrs-mmg__btn osrs-mmg__btn--ghost"
                disabled={womLoading || !usernameInput.trim()}
                onClick={() => void runWom("refresh")}
              >
                Refresh
              </button>
            </span>
          </label>
        </div>

        <div className={`osrs-quest__canvas${view === "heatmap" ? " osrs-quest__canvas--heatmap" : ""}`}>
          {visibleQuestIds.size === 0 ? (
            <p className="osrs-quest__empty">Nothing matches these filters.</p>
          ) : view === "pack" ? (
            <QuestPackSvg
              graph={graph}
              visibleQuestIds={visibleQuestIds}
              isolatedId={isolatedId}
              includeSkills={filters.kinds.skill}
              statusById={statusById}
              onNodeMenu={selection.onNodeMenu}
              onNodeFocus={selection.onNodeFocus}
            />
          ) : view === "heatmap" ? (
            <QuestHeatmap
              graph={graph}
              visibleQuestIds={visibleQuestIds}
              statusById={statusById}
              columnMode={heatmapColumns}
              metric={heatmapMetric}
              columnSort={heatmapColumnSort}
              rowSort={heatmapRowSort}
              onNodeMenu={selection.onNodeMenu}
              onNodeFocus={selection.onNodeFocus}
            />
          ) : (
            <QuestNetworkSvg
              graph={graph}
              visibleQuestIds={visibleQuestIds}
              isolatedId={isolatedId}
              highlightId={isolatedId}
              includeSkills={filters.kinds.skill}
              statusById={statusById}
              onNodeClick={onNetworkNodeClick}
              onNodeMenu={selection.onNodeMenu}
              onNodeFocus={selection.onNodeFocus}
              onBackgroundClick={onNetworkBackground}
            />
          )}
          {menu && menuNode ? (
            <QuestNodeMenu
              node={menuNode}
              x={menu.x}
              y={menu.y}
              completed={completed.has(menu.nodeId)}
              onFocus={() => selection.onNodeFocus(menu.nodeId)}
              onToggleDone={() => onToggleNodeDone(menu.nodeId)}
              onClose={selection.closeMenu}
            />
          ) : null}
        </div>
      </div>

      <QuestGraphLegend variant={view === "pack" ? "pack" : view === "heatmap" ? "heatmap" : "network"} />

      <p className="osrs-quest__credit">
        Wiki data {wikiCreditDate(graph.source.fetched_at)}. {graph.source.license}. Full map from{" "}
        <a href="https://oldschool.runescape.wiki/w/Module:Questreq/data" target="_blank" rel="noreferrer">
          OSRS Wiki Questreq
        </a>
        . Skills via Wise Old Man. Quest ticks stay on this device.
        {view === "pack"
          ? " Click a family circle to zoom in; click the parchment to zoom out. Double-click a quest for its neighborhood. Right-click for wiki and complete."
          : view === "heatmap"
            ? " Darker cells are a heavier skill tax on that storyline or difficulty. Click a cell, skill, or column to list the quests. Click a name for its neighborhood; right-click for wiki and complete."
            : " Click a node to isolate its neighborhood; click it again (or the canvas) to restore the map. Drag nodes to rearrange. Double-click opens the neighborhood page. Right-click for wiki and complete."}
      </p>
    </div>
  );
}
