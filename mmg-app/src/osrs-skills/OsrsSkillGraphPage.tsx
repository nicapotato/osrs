import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";

import { getActiveRankingsProfile, patchActiveProfileWomPlayer } from "../osrs-mmg/kphPreferences";
import type { CharacterProfile } from "../osrs-character/types";
import { loadWomPlayer, refreshWomPlayer, WomApiError } from "../osrs-character/womClient";
import { useQuestGraphSelection } from "../osrs-quests/graphInteraction";
import { SKILLS_NETWORK_PATH, skillPath } from "../routes";
import { SkillGraphLegend } from "./SkillGraphLegend";
import { SkillNodeMenu } from "./SkillNodeMenu";
import { SkillTimelineSvg } from "./SkillTimelineSvg";
import { indexSkillGraph, wikiUrl } from "./graphIndex";
import { loadSkillGraph } from "./loadGraph";
import { playerContextFromProfile, statusForNode } from "./playerState";
import type { SkillGraph, SkillGraphNode, SkillPlayerStatus } from "./types";

const DEFAULT_FOCUS_ID = "skill:woodcutting";

function wikiCreditDate(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", { dateStyle: "medium" });
}

export default function OsrsSkillGraphPage() {
  const { nodeId: rawNodeId } = useParams();
  const navigate = useNavigate();
  const [graph, setGraph] = useState<SkillGraph | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [profile, setProfile] = useState<CharacterProfile | null>(() => getActiveRankingsProfile().wom_player);
  const [usernameInput, setUsernameInput] = useState(profile?.displayName ?? "");
  const [womLoading, setWomLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadSkillGraph()
      .then((loaded) => {
        if (!cancelled) setGraph(loaded);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load skill graph");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const focusId = rawNodeId ? decodeURIComponent(rawNodeId) : DEFAULT_FOCUS_ID;
  const indexed = useMemo(() => (graph ? indexSkillGraph(graph) : null), [graph]);
  const focus = indexed?.nodesById.get(focusId) ?? null;
  const playerCtx = useMemo(() => playerContextFromProfile(profile), [profile]);
  const statusById = useMemo(() => {
    const result: Record<string, SkillPlayerStatus> = {};
    if (!graph || !indexed) return result;
    for (const node of graph.nodes) {
      result[node.id] = statusForNode(graph, node, playerCtx, indexed.incoming);
    }
    return result;
  }, [graph, indexed, playerCtx]);

  const skillNodes = useMemo(
    () => (graph ? graph.nodes.filter((node) => node.category === "skill") : []),
    [graph],
  );
  const listNodes = useMemo(() => {
    if (!graph) return [];
    const needle = query.trim().toLowerCase();
    const focusNode = indexed?.nodesById.get(focusId) ?? null;
    const focusSkill = focusNode?.category === "skill" ? focusNode.skill_key : focusNode?.primary_skill;
    return graph.nodes
      .filter((node) => {
        if (needle) {
          return (
            node.label.toLowerCase().includes(needle) ||
            (node.primary_skill ?? "").toLowerCase().includes(needle) ||
            (node.skill_key ?? "").toLowerCase().includes(needle)
          );
        }
        if (node.category === "skill") return true;
        return Boolean(focusSkill) && node.primary_skill === focusSkill;
      })
      .sort((a, b) => {
        if (a.category !== b.category) return a.category === "skill" ? -1 : 1;
        return (a.level ?? 0) - (b.level ?? 0) || a.label.localeCompare(b.label);
      });
  }, [focusId, graph, indexed, query]);

  const selectNode = useCallback((nodeId: string) => {
    navigate(skillPath(nodeId));
  }, [navigate]);
  const selection = useQuestGraphSelection(selectNode);

  useEffect(() => {
    selection.clear();
  }, [focusId]);

  async function runWom(mode: "load" | "refresh") {
    setWomLoading(true);
    try {
      const username = usernameInput.trim() || profile?.username || "";
      const result = mode === "refresh" ? await refreshWomPlayer(username) : await loadWomPlayer(username);
      patchActiveProfileWomPlayer(result.profile);
      setProfile(result.profile);
      setUsernameInput(result.profile.displayName);
      toast.success(mode === "refresh" ? "Character refreshed from WOM" : "Character loaded");
    } catch (err) {
      const message =
        err instanceof WomApiError ? err.message : err instanceof Error ? err.message : "WOM lookup failed";
      toast.error(message);
    } finally {
      setWomLoading(false);
    }
  }

  if (error) {
    return (
      <div className="osrs-mmg osrs-mmg--fill osrs-quest">
        <header className="osrs-mmg__header osrs-mmg__header--compact">
          <h1>Skill guide</h1>
        </header>
        <p className="osrs-quest__error">{error}</p>
      </div>
    );
  }

  if (!graph || !indexed) {
    return (
      <div className="osrs-mmg osrs-mmg--fill osrs-quest">
        <p>Loading skill graph…</p>
      </div>
    );
  }

  if (!focus) {
    return (
      <div className="osrs-mmg osrs-mmg--fill osrs-quest">
        <header className="osrs-mmg__header osrs-mmg__header--compact">
          <h1>Skill guide</h1>
        </header>
        <p className="osrs-quest__error">Unknown node {focusId}.</p>
        <button type="button" className="osrs-mmg__btn" onClick={() => navigate(skillPath())}>
          Back to Woodcutting
        </button>
      </div>
    );
  }

  const incoming = indexed.incoming.get(focus.id) ?? [];
  const outgoing = indexed.outgoing.get(focus.id) ?? [];
  const menu = selection.menu;
  const menuNode = menu ? indexed.nodesById.get(menu.nodeId) : null;
  if (menu && !menuNode) {
    throw new Error(`skill graph: menu missing ${menu.nodeId}`);
  }

  return (
    <div className="osrs-mmg osrs-quest">
      <div className="osrs-quest__stage">
        <header className="osrs-mmg__header osrs-mmg__header--compact">
          <div className="osrs-mmg__header-row">
            <h1>Skill guide</h1>
            <nav className="osrs-mmg__header-nav" aria-label="Page links">
              <a href="/">Home</a>
              <Link to="/mmg">Money makers</Link>
              <Link to="/quests">Quests</Link>
              <Link to={SKILLS_NETWORK_PATH}>Network</Link>
            </nav>
          </div>
        </header>

        <div className="osrs-quest__toolbar">
          <label className="osrs-mmg__field osrs-quest__field">
            Skill
            <select value={focus.category === "skill" ? focus.id : `skill:${(focus.primary_skill ?? "").toLowerCase()}`} onChange={(event) => selectNode(event.target.value)}>
              {skillNodes.map((node) => (
                <option key={node.id} value={node.id}>
                  {node.label}
                </option>
              ))}
            </select>
          </label>
          <label className="osrs-mmg__field osrs-quest__field osrs-quest__field--grow">
            Search
            <input
              className="osrs-mmg__search-input"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Willow, trout, crystal helm…"
            />
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
              <button type="button" className="osrs-mmg__btn" disabled={womLoading || !usernameInput.trim()} onClick={() => void runWom("load")}>
                {womLoading ? "…" : "Lookup"}
              </button>
            </span>
          </label>
        </div>

        <div className="osrs-quest__layout">
          <ul className="osrs-skill__picker">
            {listNodes.slice(0, 80).map((node) => (
              <li key={node.id}>
                <button
                  type="button"
                  className={`osrs-quest__list-btn${node.id === focus.id ? " osrs-quest__list-btn--active" : ""}`}
                  onClick={() => selectNode(node.id)}
                >
                  <span className={`osrs-quest__dot osrs-quest__dot--${statusById[node.id] ?? "unknown"}`} />
                  {node.category === "method" && node.level != null ? `${node.level} · ` : ""}
                  {node.label}
                </button>
              </li>
            ))}
          </ul>
          <div className="osrs-quest__canvas">
            <SkillTimelineSvg
              graph={graph}
              focusId={focus.id}
              highlightId={selection.highlightId}
              statusById={statusById}
              onNodeClick={selectNode}
              onNodeMenu={selection.onNodeMenu}
              onNodeFocus={selection.onNodeFocus}
              onBackgroundClick={selection.clear}
            />
            {menu && menuNode ? (
              <SkillNodeMenu
                node={menuNode}
                x={menu.x}
                y={menu.y}
                onFocus={() => selection.onNodeFocus(menu.nodeId)}
                onClose={selection.closeMenu}
              />
            ) : null}
          </div>
        </div>
      </div>

      <SkillGraphLegend variant="timeline" />
      <FocusDetail focus={focus} incoming={incoming} outgoing={outgoing} nodesById={indexed.nodesById} onSelect={selectNode} fetchedAt={graph.source.fetched_at} license={graph.source.license} />
    </div>
  );
}

function FocusDetail({
  focus,
  incoming,
  outgoing,
  nodesById,
  onSelect,
  fetchedAt,
  license,
}: {
  focus: SkillGraphNode;
  incoming: SkillGraph["edges"];
  outgoing: SkillGraph["edges"];
  nodesById: Map<string, SkillGraphNode>;
  onSelect: (id: string) => void;
  fetchedAt: string;
  license: string;
}) {
  const unlocks = incoming.filter((edge) => edge.relationship_type === "unlocks" || edge.relationship_type === "requires_skill");
  const feedsIn = incoming.filter((edge) => edge.relationship_type === "feeds");
  const feedsOut = outgoing.filter((edge) => edge.relationship_type === "feeds");
  return (
    <section className="osrs-quest__detail">
      <h2>{focus.label}</h2>
      <p className="osrs-quest__meta">
        {[
          focus.category,
          focus.primary_skill,
          focus.level != null ? `level ${focus.level}` : null,
          focus.members === false ? "F2P" : focus.members ? "Members" : null,
          focus.cross_skill_count != null ? `${focus.cross_skill_count} skills` : null,
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>
      <p>
        <a href={wikiUrl(focus)} target="_blank" rel="noreferrer">
          Open on OSRS Wiki
        </a>
      </p>
      <div className="osrs-quest__req-grid">
        <EdgeList title="Skill requirements" edges={unlocks} nodesById={nodesById} pick="from" onSelect={onSelect} />
        <EdgeList title="Fed by" edges={feedsIn} nodesById={nodesById} pick="from" onSelect={onSelect} />
        <EdgeList title="Feeds" edges={feedsOut} nodesById={nodesById} pick="to" onSelect={onSelect} />
      </div>
      {focus.materials && focus.materials.length > 0 ? <p className="osrs-quest__meta">Materials: {focus.materials.join(", ")}</p> : null}
      {focus.outputs && focus.outputs.length > 0 ? <p className="osrs-quest__meta">Outputs: {focus.outputs.join(", ")}</p> : null}
      <p className="osrs-quest__credit">
        Wiki data {wikiCreditDate(fetchedAt)}. {license}. Level unlocks from skill calculators and level-up tables;
        multi-skill recipes from wiki Bucket. Skills via Wise Old Man.
      </p>
    </section>
  );
}

function EdgeList({
  title,
  edges,
  nodesById,
  pick,
  onSelect,
}: {
  title: string;
  edges: SkillGraph["edges"];
  nodesById: Map<string, SkillGraphNode>;
  pick: "from" | "to";
  onSelect: (id: string) => void;
}) {
  return (
    <div>
      <h3>{title}</h3>
      {edges.length === 0 ? (
        <p className="osrs-mmg__search-count">None.</p>
      ) : (
        <ul>
          {edges.map((edge) => {
            const id = pick === "from" ? edge.from_node_id : edge.to_node_id;
            const node = nodesById.get(id);
            if (!node) throw new Error(`skill graph: missing ${id}`);
            return (
              <li key={edge.id}>
                <button type="button" className="osrs-quest__inline-link" onClick={() => onSelect(node.id)}>
                  {node.label}
                </button>
                {edge.level != null ? ` ${edge.level}` : ""}
                {edge.item_name ? ` (${edge.item_name})` : ""}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
