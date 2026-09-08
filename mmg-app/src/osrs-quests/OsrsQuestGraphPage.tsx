import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";

import { getActiveRankingsProfile, patchActiveProfileWomPlayer } from "../osrs-mmg/kphPreferences";
import { OsrsMmgSkillIcons } from "../osrs-mmg/OsrsMmgSkillIcons";
import type { SkillRequirement } from "../osrs-mmg/types";
import type { CharacterProfile } from "../osrs-character/types";
import { loadWomPlayer, refreshWomPlayer, WomApiError } from "../osrs-character/womClient";
import { QuestGraphLegend } from "./QuestGraphLegend";
import { QuestGraphSvg } from "./QuestGraphSvg";
import { loadQuestGraph } from "./loadGraph";
import { indexGraph, wikiUrl } from "./neighborhood";
import { playerContextFromProfile, skillRequirementMet, statusForNode } from "./playerState";
import {
  EMPTY_QUEST_FILTERS,
  isCompletableNode,
  nodeMatchesFilters,
  uniqueDifficulties,
  uniqueSeries,
} from "./questFilters";
import { loadCompletedQuestIds, toggleCompletedQuest } from "./questProgress";
import type { MembersFilter, QuestGraph, QuestGraphEdge, QuestGraphNode, QuestPlayerStatus } from "./types";

const DEFAULT_FOCUS_ID = "quest:tale-of-the-righteous";

function wikiCreditDate(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", { dateStyle: "medium" });
}

export default function OsrsQuestGraphPage() {
  const { nodeId: rawNodeId } = useParams();
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

  const focusId = rawNodeId ? decodeURIComponent(rawNodeId) : DEFAULT_FOCUS_ID;
  const indexed = useMemo(() => (graph ? indexGraph(graph) : null), [graph]);
  const focus = indexed?.nodesById.get(focusId) ?? null;

  const listNodes = useMemo(() => {
    if (!graph) return [];
    return graph.nodes
      .filter((node) => nodeMatchesFilters(node, filters))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [graph, filters]);

  const seriesOptions = useMemo(() => (graph ? uniqueSeries(graph.nodes) : []), [graph]);
  const difficultyOptions = useMemo(() => (graph ? uniqueDifficulties(graph.nodes) : []), [graph]);

  const playerCtx = useMemo(() => playerContextFromProfile(profile, completed), [profile, completed]);

  const statusById = useMemo(() => {
    const result: Record<string, QuestPlayerStatus> = {};
    if (!graph || !indexed) return result;
    for (const node of graph.nodes) {
      result[node.id] = statusForNode(graph, node, playerCtx, indexed.incoming);
    }
    return result;
  }, [graph, indexed, playerCtx]);

  const focusSkills: SkillRequirement[] = useMemo(() => {
    if (!graph || !indexed || !focus) return [];
    const reqs: SkillRequirement[] = [];
    for (const edge of indexed.incoming.get(focus.id) ?? []) {
      if (edge.relationship_type !== "requires_skill") continue;
      const source = indexed.nodesById.get(edge.from_node_id);
      if (!source) throw new Error(`quest graph: missing skill node ${edge.from_node_id}`);
      const flags = [
        edge.level != null ? String(edge.level) : "",
        edge.boostable ? "boostable" : "",
        edge.ironman_only ? "ironman" : "",
      ].filter(Boolean);
      reqs.push({
        skillKey: source.skill_key ?? source.label,
        requirementText: flags.join(" · ") || null,
      });
    }
    return reqs;
  }, [graph, indexed, focus]);

  function selectNode(nodeId: string) {
    navigate(`/quests/${encodeURIComponent(nodeId)}`);
  }

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

  function onToggleDone() {
    if (!focus || !isCompletableNode(focus)) return;
    const next = toggleCompletedQuest(profile?.username, focus.id);
    setCompleted(new Set(next));
  }

  if (error) {
    return (
      <div className="osrs-mmg osrs-quest">
        <header className="osrs-mmg__header osrs-mmg__header--compact">
          <h1>Quest graph</h1>
        </header>
        <p className="osrs-quest__error">{error}</p>
      </div>
    );
  }

  if (!graph || !indexed) {
    return (
      <div className="osrs-mmg osrs-quest">
        <p>Loading quest graph…</p>
      </div>
    );
  }

  if (!focus) {
    return (
      <div className="osrs-mmg osrs-quest">
        <header className="osrs-mmg__header osrs-mmg__header--compact">
          <h1>Quest graph</h1>
        </header>
        <p className="osrs-quest__error">Unknown node {focusId}.</p>
        <button type="button" className="osrs-mmg__btn" onClick={() => navigate("/quests")}>
          Back to default
        </button>
      </div>
    );
  }

  const incoming = indexed.incoming.get(focus.id) ?? [];
  const outgoing = indexed.outgoing.get(focus.id) ?? [];

  return (
    <div className="osrs-mmg osrs-quest">
      <header className="osrs-mmg__header osrs-mmg__header--compact">
        <div className="osrs-mmg__header-row">
          <h1>Quest graph</h1>
          <nav className="osrs-mmg__header-nav" aria-label="Page links">
            <a href="/">Home</a>
            <Link to="/mmg">Money makers</Link>
            <Link to="/mmg/c">Character</Link>
          </nav>
        </div>
        <p>
          Requirement neighborhood from{" "}
          <a href="https://oldschool.runescape.wiki/w/Module:Questreq/data" target="_blank" rel="noreferrer">
            OSRS Wiki Questreq
          </a>
          . Skills via Wise Old Man. Quest ticks stay on this device.
        </p>
      </header>

      <div className="osrs-quest__toolbar">
        <label className="osrs-mmg__field osrs-quest__field">
          Search
          <input
            className="osrs-mmg__search-input"
            value={filters.query}
            onChange={(event) => setFilters((prev) => ({ ...prev, query: event.target.value }))}
            placeholder="Quest or series"
          />
        </label>
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

      <div className="osrs-quest__layout">
        <aside className="osrs-quest__list" aria-label="Quests">
          <p className="osrs-mmg__search-count">{listNodes.length} shown</p>
          <ul>
            {listNodes.map((node) => (
              <li key={node.id}>
                <button
                  type="button"
                  className={
                    node.id === focus.id
                      ? "osrs-quest__list-btn osrs-quest__list-btn--active"
                      : "osrs-quest__list-btn"
                  }
                  onClick={() => selectNode(node.id)}
                >
                  <span className={`osrs-quest__dot osrs-quest__dot--${statusById[node.id] ?? "unknown"}`} />
                  <span>{node.label}</span>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <div className="osrs-quest__main">
          <div className="osrs-quest__canvas-stack">
            <div className="osrs-quest__canvas">
              <QuestGraphSvg
                graph={graph}
                focusId={focus.id}
                statusById={statusById}
                onSelect={selectNode}
              />
            </div>
            <QuestGraphLegend />
          </div>

          <section className="osrs-quest__detail">
            <div className="osrs-mmg__header-row">
              <h2>{focus.label}</h2>
              {isCompletableNode(focus) ? (
                <button type="button" className="osrs-mmg__btn" onClick={onToggleDone}>
                  {completed.has(focus.id) ? "Mark not done" : "Mark done"}
                </button>
              ) : null}
            </div>
            <p className="osrs-quest__meta">
              {[focus.category, focus.difficulty, focus.length, focus.members === false ? "F2P" : focus.members ? "Members" : null, focus.series]
                .filter(Boolean)
                .join(" · ")}
              {focus.series_index ? ` #${focus.series_index}` : ""}
            </p>
            <p>
              <a href={wikiUrl(focus)} target="_blank" rel="noreferrer">
                Open on OSRS Wiki
              </a>
            </p>
            <OsrsMmgSkillIcons skills={focusSkills} />
            <RequirementLists incoming={incoming} outgoing={outgoing} nodesById={indexed.nodesById} playerCtx={playerCtx} onSelect={selectNode} />
            <p className="osrs-quest__credit">
              Wiki data {wikiCreditDate(graph.source.fetched_at)}. {graph.source.license}.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}

function RequirementLists({
  incoming,
  outgoing,
  nodesById,
  playerCtx,
  onSelect,
}: {
  incoming: QuestGraphEdge[];
  outgoing: QuestGraphEdge[];
  nodesById: Map<string, QuestGraphNode>;
  playerCtx: ReturnType<typeof playerContextFromProfile>;
  onSelect: (id: string) => void;
}) {
  const questReqs = incoming.filter((edge) => edge.relationship_type === "requires_quest");
  const unlocks = outgoing.filter((edge) => edge.relationship_type === "requires_quest");
  return (
    <div className="osrs-quest__req-grid">
      <div>
        <h3>Requires</h3>
        {questReqs.length === 0 ? <p className="osrs-mmg__search-count">No quest requirements.</p> : (
          <ul>
            {questReqs.map((edge) => {
              const node = nodesById.get(edge.from_node_id);
              if (!node) throw new Error(`quest graph: missing required node ${edge.from_node_id}`);
              return (
                <li key={edge.id}>
                  <button type="button" className="osrs-quest__inline-link" onClick={() => onSelect(node.id)}>
                    {node.label}
                  </button>
                  {edge.started_only ? " (started)" : ""}
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <div>
        <h3>Unlocks</h3>
        {unlocks.length === 0 ? <p className="osrs-mmg__search-count">Nothing lists this as a requirement.</p> : (
          <ul>
            {unlocks.map((edge) => {
              const node = nodesById.get(edge.to_node_id);
              if (!node) throw new Error(`quest graph: missing unlock node ${edge.to_node_id}`);
              return (
                <li key={edge.id}>
                  <button type="button" className="osrs-quest__inline-link" onClick={() => onSelect(node.id)}>
                    {node.label}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <SkillEdgeNotes incoming={incoming} nodesById={nodesById} playerCtx={playerCtx} />
    </div>
  );
}

function SkillEdgeNotes({
  incoming,
  nodesById,
  playerCtx,
}: {
  incoming: QuestGraphEdge[];
  nodesById: Map<string, QuestGraphNode>;
  playerCtx: ReturnType<typeof playerContextFromProfile>;
}) {
  const skillEdges = incoming.filter((edge) => edge.relationship_type === "requires_skill");
  if (skillEdges.length === 0) return null;
  return (
    <div>
      <h3>Skill gates</h3>
      <ul>
        {skillEdges.map((edge) => {
          const node = nodesById.get(edge.from_node_id);
          if (!node) throw new Error(`quest graph: missing skill ${edge.from_node_id}`);
          const met = skillRequirementMet(
            playerCtx,
            node.skill_key ?? node.label,
            edge.level ?? 0,
            edge.ironman_only === true,
          );
          const tone = met === false ? "locked" : met === true ? "ready" : "unknown";
          return (
            <li key={edge.id}>
              <span className={`osrs-quest__dot osrs-quest__dot--${tone}`} />
              {node.label} {edge.level}
              {edge.boostable ? " (boostable)" : ""}
              {edge.ironman_only ? " (ironman)" : ""}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
