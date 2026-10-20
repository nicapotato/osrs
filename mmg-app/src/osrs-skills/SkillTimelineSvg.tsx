import { useEffect, useMemo, useRef } from "react";

import { attachQuestGraphZoom } from "../osrs-quests/graphInteraction";
import { SkillNodeMark } from "./SkillNodeMark";
import { layoutSkillNeighborhood, layoutSkillTimeline } from "./layoutTimeline";
import type { SkillGraph, SkillGraphEdge, SkillPlayerStatus } from "./types";

type Props = {
  graph: SkillGraph;
  focusId: string;
  highlightId: string | null;
  statusById: Record<string, SkillPlayerStatus>;
  onNodeClick: (nodeId: string) => void;
  onNodeMenu: (nodeId: string, point: { clientX: number; clientY: number }) => void;
  onNodeFocus: (nodeId: string) => void;
  onBackgroundClick: () => void;
};

function edgePath(
  edge: SkillGraphEdge,
  nodesById: Map<string, { x: number; y: number; width: number; height: number }>,
): string {
  const from = nodesById.get(edge.from_node_id);
  const to = nodesById.get(edge.to_node_id);
  if (!from || !to) throw new Error(`skill timeline: missing endpoints for ${edge.id}`);
  const x1 = from.x + from.width;
  const y1 = from.y + from.height / 2;
  const x2 = to.x;
  const y2 = to.y + to.height / 2;
  const mid = (x1 + x2) / 2;
  return `M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`;
}

export function SkillTimelineSvg({
  graph,
  focusId,
  highlightId,
  statusById,
  onNodeClick,
  onNodeMenu,
  onNodeFocus,
  onBackgroundClick,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const layout = useMemo(() => {
    const focus = graph.nodes.find((node) => node.id === focusId);
    if (!focus) throw new Error(`skill timeline: unknown focus ${focusId}`);
    return focus.category === "skill" ? layoutSkillTimeline(graph, focusId) : layoutSkillNeighborhood(graph, focusId);
  }, [focusId, graph]);
  const isSkillFocus = graph.nodes.find((node) => node.id === focusId)?.category === "skill";
  const nodesById = new Map(layout.nodes.map((node) => [node.id, node]));
  const viewWidth = Math.max(layout.width + 80, 1100);
  const viewHeight = Math.max(layout.height + 40, 720);
  const hotIds = useMemo(() => {
    if (!highlightId) return null;
    const ids = new Set<string>([highlightId]);
    for (const edge of layout.edges) {
      if (edge.from_node_id === highlightId) ids.add(edge.to_node_id);
      if (edge.to_node_id === highlightId) ids.add(edge.from_node_id);
    }
    return ids;
  }, [highlightId, layout.edges]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    return attachQuestGraphZoom(svg, [0.2, 2.5], true);
  }, [focusId, layout.width, layout.height]);

  return (
    <svg
      ref={svgRef}
      className="osrs-quest__svg"
      viewBox={`0 0 ${viewWidth} ${viewHeight}`}
      preserveAspectRatio="xMinYMin meet"
      role="img"
      aria-label="Skill unlock timeline"
      onClick={(event) => {
        const target = event.target as Element | null;
        if (target?.closest?.(".osrs-quest__node")) return;
        onBackgroundClick();
      }}
    >
      <g className="osrs-quest__zoom">
        {isSkillFocus ? (
          <g className="osrs-skill__rail">
            <line className="osrs-quest__rail-line" x1={80} y1={28} x2={80} y2={layout.height - 20} />
            {Array.from({ length: 99 }, (_, index) => index + 1).map((level) => {
              const y = 28 + (level - 1) * 58 + 25;
              return (
                <text key={level} className="osrs-quest__rail-level" x={72} y={y} textAnchor="end">
                  {level % 5 === 0 || level === 1 ? level : ""}
                </text>
              );
            })}
          </g>
        ) : null}
        <g className="osrs-quest__edges">
          {layout.edges.map((edge) => {
            const skillish = edge.relationship_type !== "feeds";
            const hot = highlightId ? edge.from_node_id === highlightId || edge.to_node_id === highlightId : false;
            return (
              <path
                key={edge.id}
                d={edgePath(edge, nodesById)}
                className={[
                  "osrs-quest__edge",
                  skillish ? "osrs-quest__edge--skill" : "",
                  hot ? "osrs-quest__edge--highlight" : "",
                  highlightId && !hot ? "osrs-quest__edge--dim" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              />
            );
          })}
        </g>
        <g className="osrs-quest__nodes">
          {layout.nodes.map((node) => (
            <SkillNodeMark
              key={node.id}
              node={node}
              status={statusById[node.id] ?? "unknown"}
              isFocus={node.id === focusId}
              isHighlight={node.id === highlightId}
              muted={Boolean(hotIds && !hotIds.has(node.id))}
              onActivate={() => onNodeClick(node.id)}
              onMenu={(point) => onNodeMenu(node.id, point)}
              onFocus={() => onNodeFocus(node.id)}
            />
          ))}
        </g>
      </g>
    </svg>
  );
}
