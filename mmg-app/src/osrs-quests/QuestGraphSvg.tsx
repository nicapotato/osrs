import { useEffect, useMemo, useRef } from "react";

import { attachQuestGraphZoom, edgeTouchesNode, neighborIdsFor } from "./graphInteraction";
import { layoutNeighborhood } from "./neighborhood";
import { QuestGraphNodeMark } from "./QuestGraphNodeMark";
import type { QuestGraph, QuestGraphEdge, QuestPlayerStatus } from "./types";

type Props = {
  graph: QuestGraph;
  focusId: string;
  highlightId: string | null;
  statusById: Record<string, QuestPlayerStatus>;
  onNodeClick: (nodeId: string) => void;
  onNodeMenu: (nodeId: string, point: { clientX: number; clientY: number }) => void;
  onNodeFocus: (nodeId: string) => void;
  onBackgroundClick: () => void;
};

export function QuestGraphSvg({
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
  const layout = layoutNeighborhood(graph, focusId);
  const nodesById = new Map(layout.nodes.map((node) => [node.id, node]));
  const viewWidth = Math.max(layout.width + 80, 1280);
  const viewHeight = Math.max(layout.height + 80, 720);
  const viewX = -((viewWidth - layout.width) / 2);
  const viewY = -((viewHeight - layout.height) / 2);
  const hotIds = useMemo(
    () => (highlightId ? neighborIdsFor(layout.edges, highlightId) : null),
    [highlightId, layout.edges],
  );

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    return attachQuestGraphZoom(svg, [0.35, 2.5], true);
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
      viewBox={`${viewX} ${viewY} ${viewWidth} ${viewHeight}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="Quest requirement neighborhood"
      onClick={(event) => {
        const target = event.target as Element | null;
        if (target?.closest?.(".osrs-quest__node")) return;
        onBackgroundClick();
      }}
    >
      <g className="osrs-quest__zoom">
        <g className="osrs-quest__edges">
          {layout.edges.map((edge) => {
            const hot = highlightId ? edgeTouchesNode(edge, highlightId) : false;
            const skill = edge.relationship_type === "requires_skill";
            return (
              <path
                key={edge.id}
                d={edgePath(edge)}
                className={[
                  "osrs-quest__edge",
                  skill ? "osrs-quest__edge--skill" : "",
                  highlightId && hot ? "osrs-quest__edge--highlight" : "",
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
            <QuestGraphNodeMark
              key={node.id}
              node={node}
              status={statusById[node.id] ?? "unknown"}
              isFocus={node.id === focusId}
              isHighlight={node.id === highlightId}
              isNeighbor={Boolean(hotIds && hotIds.has(node.id) && node.id !== highlightId)}
              muted={Boolean(hotIds && !hotIds.has(node.id) && node.id !== focusId)}
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
