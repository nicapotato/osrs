import { useEffect, useRef } from "react";
import { select, zoom, zoomIdentity } from "d3";

import { layoutNeighborhood, type LaidOutQuestNode } from "./neighborhood";
import { seriesColor } from "./questFilters";
import type { QuestGraph, QuestGraphEdge, QuestPlayerStatus } from "./types";

type Props = {
  graph: QuestGraph;
  focusId: string;
  statusById: Record<string, QuestPlayerStatus>;
  onSelect: (nodeId: string) => void;
};

function statusStroke(status: QuestPlayerStatus): string {
  if (status === "done") return "#2f6b2f";
  if (status === "ready") return "#8a6a12";
  if (status === "locked") return "#8a3030";
  return "#5c4a32";
}

function nodeFill(node: LaidOutQuestNode, isFocus: boolean): string {
  if (node.category === "skill") return "#d7e4c7";
  if (node.category === "quest_points" || node.category === "kudos" || node.category === "resource") {
    return "#e4d4f0";
  }
  if (isFocus) return "#f3e2a0";
  return "#f4ead0";
}

export function QuestGraphSvg({ graph, focusId, statusById, onSelect }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const layout = layoutNeighborhood(graph, focusId);
  const nodesById = new Map(layout.nodes.map((node) => [node.id, node]));

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const selection = select(svg);
    const zoomLayer = selection.select<SVGGElement>("g.osrs-quest__zoom");
    const behavior = zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.35, 2.5])
      .on("zoom", (event) => {
        zoomLayer.attr("transform", event.transform.toString());
      });
    selection.call(behavior);
    selection.call(behavior.transform, zoomIdentity);
    return () => {
      selection.on(".zoom", null);
    };
  }, [focusId, layout.width, layout.height]);

  function edgePath(edge: QuestGraphEdge): string {
    const from = nodesById.get(edge.from_node_id);
    const to = nodesById.get(edge.to_node_id);
    if (!from || !to) {
      throw new Error(`quest graph: layout missing endpoints for ${edge.id}`);
    }
    const x1 = from.x + from.width;
    const y1 = from.y + from.height / 2;
    const x2 = to.x;
    const y2 = to.y + to.height / 2;
    const mid = (x1 + x2) / 2;
    return `M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`;
  }

  return (
    <svg
      ref={svgRef}
      className="osrs-quest__svg"
      viewBox={`0 0 ${layout.width} ${layout.height}`}
      role="img"
      aria-label="Quest requirement neighborhood"
    >
      <g className="osrs-quest__zoom">
        <g className="osrs-quest__edges">
          {layout.edges.map((edge) => (
            <path
              key={edge.id}
              d={edgePath(edge)}
              className={
                edge.relationship_type === "requires_skill"
                  ? "osrs-quest__edge osrs-quest__edge--skill"
                  : "osrs-quest__edge"
              }
            />
          ))}
        </g>
        <g className="osrs-quest__nodes">
          {layout.nodes.map((node) => {
            const isFocus = node.id === focusId;
            return (
              <g
                key={node.id}
                transform={`translate(${node.x},${node.y})`}
                className={isFocus ? "osrs-quest__node osrs-quest__node--focus" : "osrs-quest__node"}
                onClick={() => onSelect(node.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelect(node.id);
                  }
                }}
              >
                <rect
                  width={node.width}
                  height={node.height}
                  rx={6}
                  fill={nodeFill(node, isFocus)}
                  stroke={isFocus ? "#7b4f17" : statusStroke(statusById[node.id] ?? "unknown")}
                  strokeWidth={isFocus ? 2.4 : 1.6}
                />
                <line
                  x1={0}
                  y1={0}
                  x2={6}
                  y2={0}
                  transform={`translate(0,${node.height})`}
                  stroke={seriesColor(node.series)}
                  strokeWidth={6}
                />
                <rect width={6} height={node.height} fill={seriesColor(node.series)} />
                <text x={12} y={node.height / 2 + 4} className="osrs-quest__node-label">
                  {node.label}
                </text>
              </g>
            );
          })}
        </g>
      </g>
    </svg>
  );
}
