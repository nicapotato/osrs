import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { getActiveRankingsProfile, patchActiveProfileWomPlayer } from "../osrs-mmg/kphPreferences";
import type { CharacterProfile } from "../osrs-character/types";
import { loadWomPlayer, refreshWomPlayer, WomApiError } from "../osrs-character/womClient";
import { useQuestGraphSelection } from "../osrs-quests/graphInteraction";
import { SKILLS_PATH, skillPath } from "../routes";
import { SkillChordSvg } from "./SkillChordSvg";
import { SkillGraphLegend } from "./SkillGraphLegend";
import { SkillNetworkSvg } from "./SkillNetworkSvg";
import { SkillNodeMenu } from "./SkillNodeMenu";
import { SkillSankeySvg } from "./SkillSankeySvg";
import { indexSkillGraph } from "./graphIndex";
import { skillNetworkSubgraph } from "./layoutNetwork";
import { loadSkillGraph } from "./loadGraph";
import { playerContextFromProfile, statusForNode } from "./playerState";
import { EMPTY_SKILL_FILTERS, uniquePrimarySkills, type SkillFilters } from "./skillFilters";
import type { CrossSkillFilter, MembersFilter, SkillGraph, SkillNetworkView, SkillPlayerStatus } from "./types";

function wikiCreditDate(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", { dateStyle: "medium" });
}

export default function OsrsSkillNetworkPage() {
  const navigate = useNavigate();
  const [graph, setGraph] = useState<SkillGraph | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<SkillFilters>(EMPTY_SKILL_FILTERS);
  const [view, setView] = useState<SkillNetworkView>("force");
  const [profile, setProfile] = useState<CharacterProfile | null>(() => getActiveRankingsProfile().wom_player);
  const [usernameInput, setUsernameInput] = useState(profile?.displayName ?? "");
  const [womLoading, setWomLoading] = useState(false);
  const [isolatedId, setIsolatedId] = useState<string | null>(null);

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

  const indexed = useMemo(() => (graph ? indexSkillGraph(graph) : null), [graph]);
  const playerCtx = useMemo(() => playerContextFromProfile(profile), [profile]);
  const statusById = useMemo(() => {
    const result: Record<string, SkillPlayerStatus> = {};
    if (!graph || !indexed) return result;
    for (const node of graph.nodes) {
      result[node.id] = statusForNode(graph, node, playerCtx, indexed.incoming);
    }
    return result;
  }, [graph, indexed, playerCtx]);
  const skillOptions = useMemo(() => (graph ? uniquePrimarySkills(graph.nodes) : []), [graph]);
  const visible = useMemo(
    () => (graph ? skillNetworkSubgraph(graph, filters, isolatedId) : null),
    [filters, graph, isolatedId],
  );

  const focusNode = useCallback(
    (nodeId: string) => {
      navigate(skillPath(nodeId));
    },
    [navigate],
  );
  const selection = useQuestGraphSelection(focusNode);

  function onNetworkNodeClick(nodeId: string) {
    selection.closeMenu();
    setIsolatedId((prev) => (prev === nodeId ? null : nodeId));
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
          <h1>Skill network</h1>
        </header>
        <p className="osrs-quest__error">{error}</p>
      </div>
    );
  }

  if (!graph || !indexed || !visible) {
    return (
      <div className="osrs-mmg osrs-mmg--fill osrs-quest">
        <p>Loading skill graph…</p>
      </div>
    );
  }

  const menu = selection.menu;
  const menuNode = menu ? indexed.nodesById.get(menu.nodeId) : null;
  if (menu && !menuNode) {
    throw new Error(`skill network: menu missing ${menu.nodeId}`);
  }

  return (
    <div className="osrs-mmg osrs-quest">
      <div className="osrs-quest__stage">
        <header className="osrs-mmg__header osrs-mmg__header--compact">
          <div className="osrs-mmg__header-row">
            <h1>Skill network</h1>
            <nav className="osrs-mmg__header-nav" aria-label="Page links">
              <a href="/">Home</a>
              <Link to="/mmg">Money makers</Link>
              <Link to="/quests">Quests</Link>
              <Link to={SKILLS_PATH}>Guide</Link>
            </nav>
          </div>
        </header>

        <div className="osrs-quest__toolbar">
          <label className="osrs-mmg__field osrs-quest__field">
            View
            <select value={view} onChange={(event) => setView(event.target.value as SkillNetworkView)}>
              <option value="force">Force network</option>
              <option value="chord">Chord</option>
              <option value="sankey">Sankey</option>
            </select>
          </label>
          <label className="osrs-mmg__field osrs-quest__field">
            Cross-skill
            <select
              value={String(filters.minCross)}
              onChange={(event) =>
                setFilters((prev) => ({ ...prev, minCross: Number(event.target.value) as CrossSkillFilter }))
              }
            >
              <option value="1">All methods</option>
              <option value="2">2+ skills</option>
              <option value="3">3+ skills</option>
            </select>
          </label>
          <label className="osrs-mmg__field osrs-quest__field">
            Members
            <select
              value={filters.members}
              onChange={(event) => setFilters((prev) => ({ ...prev, members: event.target.value as MembersFilter }))}
            >
              <option value="all">All</option>
              <option value="members">Members</option>
              <option value="f2p">Free-to-play</option>
            </select>
          </label>
          <label className="osrs-mmg__field osrs-quest__field">
            Primary skill
            <select value={filters.skill} onChange={(event) => setFilters((prev) => ({ ...prev, skill: event.target.value }))}>
              <option value="">All skills</option>
              {skillOptions.map((skill) => (
                <option key={skill} value={skill}>
                  {skill}
                </option>
              ))}
            </select>
          </label>
          <p className="osrs-mmg__search-count osrs-quest__field">{visible.nodes.filter((node) => node.category === "method").length} methods</p>
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

        <div className="osrs-quest__canvas">
          {visible.nodes.length === 0 ? (
            <p className="osrs-quest__empty">Nothing matches these filters.</p>
          ) : view === "force" ? (
            <SkillNetworkSvg
              graph={graph}
              filters={filters}
              isolatedId={isolatedId}
              highlightId={isolatedId}
              statusById={statusById}
              onNodeClick={onNetworkNodeClick}
              onNodeMenu={selection.onNodeMenu}
              onNodeFocus={selection.onNodeFocus}
              onBackgroundClick={() => {
                setIsolatedId(null);
                selection.clear();
              }}
            />
          ) : view === "chord" ? (
            <SkillChordSvg
              graph={graph}
              filters={filters}
              isolatedId={isolatedId}
              onSkillClick={(skill) => navigate(skillPath(`skill:${skill.toLowerCase()}`))}
            />
          ) : (
            <SkillSankeySvg
              graph={graph}
              filters={filters}
              isolatedId={isolatedId}
              onSkillClick={(skill) => navigate(skillPath(`skill:${skill.toLowerCase()}`))}
            />
          )}
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

      <SkillGraphLegend variant="network" />
      <p className="osrs-quest__credit">
        Wiki data {wikiCreditDate(graph.source.fetched_at)}. {graph.source.license}. Cross-skill methods from wiki
        Bucket recipes plus item feeds between gathering and processing. Click a node to isolate its neighborhood.
      </p>
    </div>
  );
}
