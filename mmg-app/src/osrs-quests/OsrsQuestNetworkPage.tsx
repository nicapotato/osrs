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
import { QuestNetworkSvg } from "./QuestNetworkSvg";
import { QuestNodeMenu } from "./QuestNodeMenu";
import type { MembersFilter, QuestGraph, QuestPlayerStatus } from "./types";

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

  useEffect(() => {
    selection.clear();
  }, [filters]);

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
            </nav>
          </div>
        </header>

        <div className="osrs-quest__toolbar">
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
          <p className="osrs-mmg__search-count osrs-quest__field">
            {visibleQuestIds.size} quest{visibleQuestIds.size === 1 ? "" : "s"}
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

        <div className="osrs-quest__canvas">
          {visibleQuestIds.size === 0 ? (
            <p className="osrs-quest__empty">No quests match these filters.</p>
          ) : (
            <QuestNetworkSvg
              graph={graph}
              visibleQuestIds={visibleQuestIds}
              highlightId={selection.highlightId}
              statusById={statusById}
              onNodeClick={selection.onNodeClick}
              onNodeMenu={selection.onNodeMenu}
              onNodeFocus={selection.onNodeFocus}
              onBackgroundClick={selection.clear}
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

      <QuestGraphLegend variant="network" />

      <p className="osrs-quest__credit">
        Wiki data {wikiCreditDate(graph.source.fetched_at)}. {graph.source.license}. Full map from{" "}
        <a href="https://oldschool.runescape.wiki/w/Module:Questreq/data" target="_blank" rel="noreferrer">
          OSRS Wiki Questreq
        </a>
        . Skills via Wise Old Man. Quest ticks stay on this device. Click a node to focus it and its
        connections; double-click to open its neighborhood. Right-click for wiki and complete.
      </p>
    </div>
  );
}
