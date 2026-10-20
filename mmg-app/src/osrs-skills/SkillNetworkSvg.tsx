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
import { attachQuestGraphZoom } from "../osrs-quests/graphInteraction";
import { SkillNodeMark } from "./SkillNodeMark";
import { networkNodeSize, skillNetworkSubgraph } from "./layoutNetwork";
import type { LaidOutSkillNode } from "./layoutTimeline";
import { skillColor } from "./skillColors";
import type { SkillFilters } from "./skillFilters";
import type { SkillGraph, SkillGraphEdge, SkillGraphNode, SkillPlayerStatus } from "./types";

const VIEW_W = 2400;
const VIEW_H = 1800;

type SimNode = SkillGraphNode & SimulationNodeDatum & { width: number; height: number };
type SimLink = SimulationLinkDatum<SimNode> & { edge: SkillGraphEdge };

type Props = {
  graph: SkillGraph;
  filters: SkillFilters;
  isolatedId: string | null;
  highlightId: string | null;
  statusById: Record<string, SkillPlayerStatus>;
  onNodeClick: (nodeId: string) => void;
  onNodeMenu: (nodeId: string, point: { clientX: number; clientY: number }) => void;
  onNodeFocus: (nodeId: string) => void;
  onBackgroundClick: () => void;
};

function asSimNode(node: SimLink["source"] | SimLink["target"]): SimNode {
  if (typeof node === "object" && node && "id" in node) return node as SimNode;
  throw new Error("skill network: link endpoint not resolved");
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

function hullPath(members: SimNode[], pad: number): string | null {
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
  return line<[number, number]>().curve(curveCatmullRomClosed)(hull);
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
  if (!ctm) throw new Error("skill network: missing screen CTM");
  const world = point.matrixTransform(ctm.inverse());
  return { x: world.x, y: world.y };
}

export function SkillNetworkSvg({
  graph,
  filters,
  isolatedId,
  highlightId,
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

  const subgraph = useMemo(() => skillNetworkSubgraph(graph, filters, isolatedId), [filters, graph, isolatedId]);
  const subgraphKey = useMemo(
    () => `${isolatedId ?? "full"}:${subgraph.nodes.map((node) => node.id).sort().join(",")}`,
    [isolatedId, subgraph.nodes],
  );

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    return attachQuestGraphZoom(svg, [0.12, 2.5], true);
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
        x: kept?.x ?? VIEW_W / 2 + Math.cos(angle) * 320,
        y: kept?.y ?? VIEW_H / 2 + Math.sin(angle) * 240,
        vx: kept?.vx ?? 0,
        vy: kept?.vy ?? 0,
      };
    });
    const byId = new Map(nodes.map((node) => [node.id, node]));
    const links: SimLink[] = subgraph.edges.map((edge) => {
      const source = byId.get(edge.from_node_id);
      const target = byId.get(edge.to_node_id);
      if (!source || !target) throw new Error(`skill network: missing link endpoint for ${edge.id}`);
      return { source, target, edge };
    });
    nodesRef.current = nodes;
    linksRef.current = links;

    const simulation = forceSimulation(nodes)
      .force(
        "link",
        forceLink<SimNode, SimLink>(links)
          .id((node) => node.id)
          .distance((link) => (link.edge.relationship_type === "feeds" ? 110 : 170))
          .strength((link) => (link.edge.relationship_type === "feeds" ? 0.45 : 0.12)),
      )
      .force("charge", forceManyBody<SimNode>().strength(-140).distanceMax(720))
      .force("collide", forceCollide<SimNode>().radius((node) => Math.max(node.width, node.height) * 0.42 + 6))
      .force("center", forceCenter(VIEW_W / 2, VIEW_H / 2).strength(0.07))
      .force("skillParkX", forceX<SimNode>(VIEW_W * 0.5).strength((node) => (node.category === "skill" ? 0.04 : 0)))
      .force("skillParkY", forceY<SimNode>(VIEW_H * 0.5).strength((node) => (node.category === "skill" ? 0.04 : 0)))
      .force("cluster", (alpha: number) => {
        const groups = new Map<string, SimNode[]>();
        for (const node of nodesRef.current) {
          const key = node.category === "skill" ? "skill-hubs" : node.primary_skill ?? "other";
          const bucket = groups.get(key) ?? [];
          bucket.push(node);
          groups.set(key, bucket);
        }
        for (const [key, members] of groups) {
          pullGroup(members, key === "skill-hubs" ? 0.22 : 0.08, alpha);
        }
      })
      .velocityDecay(0.32)
      .alpha(1)
      .alphaDecay(0.02);

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
  const hulls = useMemo(() => {
    const groups = new Map<string, SimNode[]>();
    for (const node of nodes) {
      if (node.x == null || node.y == null || node.category !== "method" || !node.primary_skill) continue;
      const bucket = groups.get(node.primary_skill) ?? [];
      bucket.push(node);
      groups.set(node.primary_skill, bucket);
    }
    const result: { key: string; d: string; color: string; cx: number; cy: number }[] = [];
    for (const [skill, members] of groups) {
      const d = hullPath(members, 20);
      if (!d) continue;
      result.push({
        key: skill,
        d,
        color: skillColor(skill),
        cx: members.reduce((sum, node) => sum + (node.x ?? 0), 0) / members.length,
        cy: members.reduce((sum, node) => sum + (node.y ?? 0), 0) / members.length,
      });
    }
    return result;
  }, [nodes, subgraphKey]);

  function beginDrag(node: SimNode, event: ReactPointerEvent<SVGGElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { id: node.id, x: event.clientX, y: event.clientY, moved: false };
  }

  function moveDrag(node: SimNode, event: ReactPointerEvent<SVGGElement>) {
    const drag = dragRef.current;
    if (!drag || drag.id !== node.id) return;
    if (!drag.moved && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 6) return;
    drag.moved = true;
    const svg = svgRef.current;
    const zoomLayer = zoomLayerRef.current;
    if (!svg || !zoomLayer) throw new Error("skill network: drag missing svg");
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
      aria-label="Skill method network"
      onPointerDown={(event) => {
        const target = event.target as Element | null;
        if (target?.closest?.(".osrs-quest__node")) return;
        panClickRef.current = { x: event.clientX, y: event.clientY, moved: false };
      }}
      onPointerMove={(event) => {
        if (panClickRef.current.moved) return;
        if (Math.hypot(event.clientX - panClickRef.current.x, event.clientY - panClickRef.current.y) > 6) {
          panClickRef.current.moved = true;
        }
      }}
      onClick={(event) => {
        const target = event.target as Element | null;
        if (target?.closest?.(".osrs-quest__node")) return;
        if (panClickRef.current.moved) return;
        onBackgroundClick();
      }}
    >
      <g className="osrs-quest__zoom" ref={zoomLayerRef}>
        <g className="osrs-quest__hulls">
          {hulls.map((hull) => (
            <g key={hull.key} className="osrs-quest__hull">
              <path d={hull.d} fill={hull.color} fillOpacity={0.14} stroke={hull.color} strokeOpacity={0.5} strokeWidth={2} />
              <text className="osrs-quest__hull-label" x={hull.cx} y={hull.cy - 36} textAnchor="middle">
                {hull.key}
              </text>
              <image href={skillIconUrl(hull.key)} x={hull.cx - 12} y={hull.cy - 30} width={24} height={24} />
            </g>
          ))}
        </g>
        <g className="osrs-quest__edges">
          {links.map((link) => {
            const from = asSimNode(link.source);
            const to = asSimNode(link.target);
            if (from.x == null || from.y == null || to.x == null || to.y == null) return null;
            const start = boxEdgePoint(from, to.x, to.y);
            const end = boxEdgePoint(to, from.x, from.y);
            const feeds = link.edge.relationship_type === "feeds";
            const label =
              link.edge.relationship_type === "unlocks" || link.edge.relationship_type === "requires_skill"
                ? String(link.edge.level ?? "")
                : link.edge.item_name ?? "";
            return (
              <g key={link.edge.id}>
                <path
                  d={`M ${start.x} ${start.y} L ${end.x} ${end.y}`}
                  className={feeds ? "osrs-quest__edge" : "osrs-quest__edge osrs-quest__edge--skill"}
                />
                {label ? (
                  <text className="osrs-quest__edge-label" x={(start.x + end.x) / 2} y={(start.y + end.y) / 2 - 4} textAnchor="middle">
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
            const laid: LaidOutSkillNode = {
              ...node,
              x: node.x - node.width / 2,
              y: node.y - node.height / 2,
              skillReq: node.level != null && node.category === "method" ? { levelText: String(node.level) } : null,
            };
            return (
              <SkillNodeMark
                key={node.id}
                node={laid}
                status={statusById[node.id] ?? "unknown"}
                isFocus={node.id === isolatedId}
                isHighlight={node.id === highlightId || node.id === isolatedId}
                muted={false}
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
