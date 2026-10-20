import { useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import {
  curveCatmullRomClosed,
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  line,
  polygonHull,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from "d3";

import { skillIconUrl } from "../osrs-mmg/skillIconUrl";
import { attachQuestGraphZoom } from "./graphInteraction";
import { networkNodeSize, networkSubgraph } from "./layoutNetwork";
import type { LaidOutQuestNode } from "./neighborhood";
import { seriesColor, seriesIconUrl } from "./questFilters";
import { QuestGraphNodeMark } from "./QuestGraphNodeMark";
import type { QuestGraph, QuestGraphEdge, QuestGraphNode, QuestPlayerStatus } from "./types";

const VIEW_W = 2400;
const VIEW_H = 1800;

type SimNode = QuestGraphNode &
  SimulationNodeDatum & {
    width: number;
    height: number;
  };

type SimLink = SimulationLinkDatum<SimNode> & {
  edge: QuestGraphEdge;
};

type Props = {
  graph: QuestGraph;
  visibleQuestIds: Set<string>;
  isolatedId: string | null;
  highlightId: string | null;
  includeSkills: boolean;
  statusById: Record<string, QuestPlayerStatus>;
  onNodeClick: (nodeId: string) => void;
  onNodeMenu: (nodeId: string, point: { clientX: number; clientY: number }) => void;
  onNodeFocus: (nodeId: string) => void;
  onBackgroundClick: () => void;
};

type HullShape = {
  key: string;
  label: string;
  d: string;
  cx: number;
  cy: number;
  color: string;
  icon: string | null;
};

const SKILLS_HULL_COLOR = "#4f6b3a";

function asSimNode(node: SimLink["source"] | SimLink["target"]): SimNode {
  if (typeof node === "object" && node && "id" in node) return node as SimNode;
  throw new Error("quest network: link endpoint not resolved");
}

function pullGroup(members: SimNode[], strength: number, alpha: number) {
  if (members.length < 2) return;
  const cx = members.reduce((sum, node) => sum + (node.x ?? 0), 0) / members.length;
  const cy = members.reduce((sum, node) => sum + (node.y ?? 0), 0) / members.length;
  for (const node of members) {
    node.vx = (node.vx ?? 0) + (cx - (node.x ?? 0)) * strength * alpha;
    node.vy = (node.vy ?? 0) + (cy - (node.y ?? 0)) * strength * alpha;
  }
}

function clusterForce(getNodes: () => SimNode[]) {
  function force(alpha: number) {
    const seriesGroups = new Map<string, SimNode[]>();
    const skills: SimNode[] = [];
    for (const node of getNodes()) {
      if (node.category === "skill") {
        skills.push(node);
        continue;
      }
      if (!node.series) continue;
      const bucket = seriesGroups.get(node.series) ?? [];
      bucket.push(node);
      seriesGroups.set(node.series, bucket);
    }
    for (const members of seriesGroups.values()) pullGroup(members, 0.09, alpha);
    pullGroup(skills, 0.28, alpha);
  }
  return force;
}

function hullPath(members: SimNode[], pad: number): HullShape | null {
  if (members.length < 2) return null;
  const pts: [number, number][] = [];
  for (const node of members) {
    if (node.x == null || node.y == null) continue;
    const x = node.x - node.width / 2 - pad;
    const y = node.y - node.height / 2 - pad;
    pts.push(
      [x, y],
      [x + node.width + pad * 2, y],
      [x + node.width + pad * 2, y + node.height + pad * 2],
      [x, y + node.height + pad * 2],
    );
  }
  if (pts.length < 3) return null;
  const hull = polygonHull(pts);
  if (!hull || hull.length < 3) return null;
  const d = line<[number, number]>().curve(curveCatmullRomClosed)(hull);
  if (!d) return null;
  return {
    key: "",
    label: "",
    d,
    cx: members.reduce((sum, node) => sum + (node.x ?? 0), 0) / members.length,
    cy: members.reduce((sum, node) => sum + (node.y ?? 0), 0) / members.length,
    color: "",
    icon: null,
  };
}

function hullsFromNodes(nodes: SimNode[]): HullShape[] {
  const groups = new Map<string, SimNode[]>();
  const skills: SimNode[] = [];
  for (const node of nodes) {
    if (node.x == null || node.y == null) continue;
    if (node.category === "skill") {
      skills.push(node);
      continue;
    }
    if (!node.series) continue;
    const bucket = groups.get(node.series) ?? [];
    bucket.push(node);
    groups.set(node.series, bucket);
  }
  const hulls: HullShape[] = [];
  for (const [series, members] of groups) {
    const shape = hullPath(members, 22);
    if (!shape) continue;
    hulls.push({
      ...shape,
      key: `series:${series}`,
      label: series,
      color: seriesColor(series),
      icon: seriesIconUrl(series),
    });
  }
  const skillHull = hullPath(skills, 26);
  if (skillHull) {
    hulls.push({
      ...skillHull,
      key: "skills",
      label: "Skills",
      color: SKILLS_HULL_COLOR,
      icon: skillIconUrl("agility"),
    });
  }
  return hulls;
}

function boxEdgePoint(node: SimNode, towardX: number, towardY: number): { x: number; y: number } {
  const x = node.x ?? 0;
  const y = node.y ?? 0;
  const dx = towardX - x;
  const dy = towardY - y;
  if (dx === 0 && dy === 0) return { x, y };
  const hw = node.width / 2;
  const hh = node.height / 2;
  const tx = dx === 0 ? Number.POSITIVE_INFINITY : hw / Math.abs(dx);
  const ty = dy === 0 ? Number.POSITIVE_INFINITY : hh / Math.abs(dy);
  const t = Math.min(tx, ty);
  return { x: x + dx * t, y: y + dy * t };
}

function clientToWorld(svg: SVGSVGElement, zoomLayer: SVGGElement, clientX: number, clientY: number): { x: number; y: number } {
  const point = svg.createSVGPoint();
  point.x = clientX;
  point.y = clientY;
  const ctm = zoomLayer.getScreenCTM();
  if (!ctm) throw new Error("quest network: missing screen CTM");
  const world = point.matrixTransform(ctm.inverse());
  return { x: world.x, y: world.y };
}

function edgeLabel(edge: QuestGraphEdge): string | null {
  if (edge.relationship_type !== "requires_skill" || edge.level == null) return null;
  return edge.boostable ? `${edge.level}*` : String(edge.level);
}

export function QuestNetworkSvg({
  graph,
  visibleQuestIds,
  isolatedId,
  highlightId,
  includeSkills,
  statusById,
  onNodeClick,
  onNodeMenu,
  onNodeFocus,
  onBackgroundClick,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const zoomLayerRef = useRef<SVGGElement>(null);
  const simRef = useRef<Simulation<SimNode, SimLink> | null>(null);
  const nodesRef = useRef<SimNode[]>([]);
  const linksRef = useRef<SimLink[]>([]);
  const dragRef = useRef<{ id: string; x: number; y: number; moved: boolean } | null>(null);
  const panClickRef = useRef({ x: 0, y: 0, moved: false });
  const [, setFrame] = useState(0);

  const subgraph = useMemo(
    () => networkSubgraph(graph, visibleQuestIds, isolatedId, includeSkills),
    [graph, includeSkills, isolatedId, visibleQuestIds],
  );
  const subgraphKey = useMemo(
    () => `${isolatedId ?? "full"}:${subgraph.nodes.map((node) => node.id).sort().join(",")}`,
    [isolatedId, subgraph.nodes],
  );

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    return attachQuestGraphZoom(svg, [0.15, 2.5], true);
  }, []);

  useEffect(() => {
    const previous = new Map(nodesRef.current.map((node) => [node.id, node]));
    const nodes: SimNode[] = subgraph.nodes.map((node, index) => {
      const size = networkNodeSize(node);
      const kept = previous.get(node.id);
      const angle = (index / Math.max(1, subgraph.nodes.length)) * Math.PI * 2;
      return {
        ...node,
        width: size.width,
        height: size.height,
        x: kept?.x ?? VIEW_W / 2 + Math.cos(angle) * 280,
        y: kept?.y ?? VIEW_H / 2 + Math.sin(angle) * 220,
        vx: kept?.vx ?? 0,
        vy: kept?.vy ?? 0,
      };
    });
    const byId = new Map(nodes.map((node) => [node.id, node]));
    const links: SimLink[] = subgraph.edges.map((edge) => {
      const source = byId.get(edge.from_node_id);
      const target = byId.get(edge.to_node_id);
      if (!source || !target) {
        throw new Error(`quest network: missing link endpoint for ${edge.id}`);
      }
      return { source, target, edge };
    });
    nodesRef.current = nodes;
    linksRef.current = links;

    const simulation = forceSimulation(nodes)
      .force(
        "link",
        forceLink<SimNode, SimLink>(links)
          .id((node) => node.id)
          .distance((link) => (link.edge.relationship_type === "requires_skill" ? 190 : 78))
          .strength((link) => (link.edge.relationship_type === "requires_skill" ? 0.05 : 0.62)),
      )
      .force("charge", forceManyBody<SimNode>().strength(-160).distanceMax(720))
      .force(
        "collide",
        forceCollide<SimNode>().radius((node) => Math.max(node.width, node.height) * 0.42 + 6),
      )
      .force("center", forceCenter(VIEW_W / 2, VIEW_H / 2).strength(0.08))
      .force(
        "skillParkX",
        forceX<SimNode>(VIEW_W * 0.22).strength((node) => (node.category === "skill" ? 0.08 : 0)),
      )
      .force(
        "skillParkY",
        forceY<SimNode>(VIEW_H * 0.5).strength((node) => (node.category === "skill" ? 0.045 : 0)),
      )
      .force("cluster", clusterForce(() => nodesRef.current))
      .velocityDecay(0.32)
      .alpha(1)
      .alphaDecay(0.018);

    let raf = 0;
    simulation.on("tick", () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        setFrame((frame) => frame + 1);
      });
    });
    simRef.current = simulation;
    setFrame((frame) => frame + 1);
    return () => {
      simulation.stop();
      if (raf) cancelAnimationFrame(raf);
      simRef.current = null;
    };
  }, [subgraph, subgraphKey]);

  const nodes = nodesRef.current;
  const links = linksRef.current;
  const hulls = hullsFromNodes(nodes);

  function beginDrag(node: SimNode, event: ReactPointerEvent<SVGGElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { id: node.id, x: event.clientX, y: event.clientY, moved: false };
  }

  function moveDrag(node: SimNode, event: ReactPointerEvent<SVGGElement>) {
    const drag = dragRef.current;
    if (!drag || drag.id !== node.id) return;
    const dist = Math.hypot(event.clientX - drag.x, event.clientY - drag.y);
    if (!drag.moved && dist < 6) return;
    drag.moved = true;
    const svg = svgRef.current;
    const zoomLayer = zoomLayerRef.current;
    if (!svg || !zoomLayer) throw new Error("quest network: drag missing svg");
    const world = clientToWorld(svg, zoomLayer, event.clientX, event.clientY);
    node.fx = world.x;
    node.fy = world.y;
    simRef.current?.alphaTarget(0.28).restart();
  }

  function endDrag(node: SimNode, event: ReactPointerEvent<SVGGElement>) {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag || drag.id !== node.id) return;
    node.fx = null;
    node.fy = null;
    simRef.current?.alphaTarget(0);
    if (!drag.moved) onNodeClick(node.id);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  return (
    <svg
      ref={svgRef}
      className="osrs-quest__svg"
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="Full quest dependency network"
      onPointerDown={(event) => {
        const target = event.target as Element | null;
        if (target?.closest?.(".osrs-quest__node")) return;
        panClickRef.current = { x: event.clientX, y: event.clientY, moved: false };
      }}
      onPointerMove={(event) => {
        const pan = panClickRef.current;
        if (pan.moved) return;
        if (Math.hypot(event.clientX - pan.x, event.clientY - pan.y) > 6) pan.moved = true;
      }}
      onClick={(event) => {
        const target = event.target as Element | null;
        if (target?.closest?.(".osrs-quest__node")) return;
        if (panClickRef.current.moved) return;
        onBackgroundClick();
      }}
    >
      <defs>
        <marker
          id="osrs-arrow-quest"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="11"
          markerHeight="11"
          orient="auto"
          markerUnits="userSpaceOnUse"
        >
          <path d="M 0 1 L 10 5 L 0 9 Z" fill="#8a7048" />
        </marker>
        <marker
          id="osrs-arrow-skill"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="9"
          markerHeight="9"
          orient="auto"
          markerUnits="userSpaceOnUse"
        >
          <path d="M 0 1 L 10 5 L 0 9 Z" fill="#4f6b3a" />
        </marker>
      </defs>
      <g className="osrs-quest__zoom" ref={zoomLayerRef}>
        <g className="osrs-quest__hulls">
          {hulls.map((hull) => (
            <g key={hull.key} className="osrs-quest__hull">
              <path d={hull.d} fill={hull.color} fillOpacity={0.16} stroke={hull.color} strokeOpacity={0.55} strokeWidth={2} />
              <text className="osrs-quest__hull-label" x={hull.cx} y={hull.cy - 44} textAnchor="middle">
                {hull.label}
              </text>
              {hull.icon ? (
                <image href={hull.icon} x={hull.cx - 12} y={hull.cy - 38} width={24} height={24} />
              ) : (
                <rect x={hull.cx - 10} y={hull.cy - 36} width={20} height={20} rx={4} fill={hull.color} />
              )}
            </g>
          ))}
        </g>
        <g className="osrs-quest__edges">
          {links.map((link) => {
            const from = asSimNode(link.source);
            const to = asSimNode(link.target);
            if (from.x == null || from.y == null || to.x == null || to.y == null) return null;
            const skill = link.edge.relationship_type === "requires_skill";
            const start = boxEdgePoint(from, to.x, to.y);
            const end = boxEdgePoint(to, from.x, from.y);
            const label = edgeLabel(link.edge);
            const mx = (start.x + end.x) / 2;
            const my = (start.y + end.y) / 2;
            return (
              <g key={link.edge.id}>
                <path
                  d={`M ${start.x} ${start.y} L ${end.x} ${end.y}`}
                  className={skill ? "osrs-quest__edge osrs-quest__edge--skill" : "osrs-quest__edge"}
                  markerEnd={skill ? "url(#osrs-arrow-skill)" : "url(#osrs-arrow-quest)"}
                />
                {label ? (
                  <text className="osrs-quest__edge-label" x={mx} y={my - 4} textAnchor="middle">
                    {label}
                  </text>
                ) : null}
              </g>
            );
          })}
        </g>
        <g className="osrs-quest__nodes">
          {nodes.map((node) => {
            if (node.x == null || node.y == null) return null;
            const laid: LaidOutQuestNode = {
              ...node,
              x: node.x - node.width / 2,
              y: node.y - node.height / 2,
              layer: 0,
              skillReq: null,
            };
            return (
              <QuestGraphNodeMark
                key={node.id}
                node={laid}
                status={statusById[node.id] ?? "unknown"}
                isFocus={node.id === isolatedId}
                isHighlight={node.id === highlightId || node.id === isolatedId}
                isNeighbor={false}
                muted={false}
                variant="network"
                onActivate={() => onNodeClick(node.id)}
                onMenu={(point) => onNodeMenu(node.id, point)}
                onFocus={() => onNodeFocus(node.id)}
                onPointerDown={(event) => beginDrag(node, event)}
                onPointerMove={(event) => moveDrag(node, event)}
                onPointerUp={(event) => endDrag(node, event)}
              />
            );
          })}
        </g>
      </g>
    </svg>
  );
}
