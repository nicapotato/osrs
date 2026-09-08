import { useEffect, useRef } from "react";
import { select, zoom, zoomIdentity } from "d3";

import { skillIconUrl } from "../osrs-mmg/skillIconUrl";
import { categoryTitle, layoutNeighborhood, type LaidOutQuestNode } from "./neighborhood";
import { isCompletableNode, seriesColor } from "./questFilters";
import type { QuestGraph, QuestGraphEdge, QuestGraphNode, QuestPlayerStatus } from "./types";

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

function nodeKindClass(category: QuestGraphNode["category"]): string {
  if (category === "quest") return "osrs-quest__node--quest";
  if (category === "miniquest") return "osrs-quest__node--miniquest";
  if (category === "diary") return "osrs-quest__node--diary";
  if (category === "skill") return "osrs-quest__node--skill";
  return "osrs-quest__node--other";
}

function nodeFill(node: LaidOutQuestNode, isFocus: boolean): string {
  if (isFocus) return "#f3e2a0";
  if (node.category === "skill") return "#cfe4b8";
  if (node.category === "miniquest") return "#efe0c0";
  if (node.category === "diary") return "#d7e3ef";
  if (node.category === "quest") return "#f4ead0";
  return "#e4d4f0";
}

function nodeRadius(node: LaidOutQuestNode): number {
  if (node.category === "skill") return 14;
  if (node.category === "miniquest") return 8;
  if (node.category === "diary") return 4;
  if (node.category === "quest") return 6;
  return 10;
}

function truncateLabel(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(1, maxChars - 1))}…`;
}

function nodeSubtitle(node: LaidOutQuestNode): string {
  const kind = categoryTitle(node.category);
  if (node.skillReq) {
    return node.skillReq.boostable ? `${kind} · boostable` : kind;
  }
  if (node.series) {
    const chapter = node.series_index ? ` #${node.series_index}` : "";
    return `${kind} · ${node.series}${chapter}`;
  }
  return kind;
}

export function QuestGraphSvg({ graph, focusId, statusById, onSelect }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const layout = layoutNeighborhood(graph, focusId);
  const nodesById = new Map(layout.nodes.map((node) => [node.id, node]));
  const viewWidth = Math.max(layout.width + 80, 1280);
  const viewHeight = Math.max(layout.height + 80, 720);
  const viewX = -((viewWidth - layout.width) / 2);
  const viewY = -((viewHeight - layout.height) / 2);

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
      viewBox={`${viewX} ${viewY} ${viewWidth} ${viewHeight}`}
      preserveAspectRatio="xMidYMid meet"
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
            const showChain = isCompletableNode(node) && Boolean(node.series);
            const stripe = showChain ? 8 : 0;
            const hasIcon = node.category === "skill" && Boolean(node.skill_key);
            const iconSize = 16;
            const textX = stripe + (hasIcon ? 26 : 8);
            const badgeW = node.skillReq ? (node.skillReq.levelText.length > 3 ? 40 : 30) : 0;
            const textMax = Math.max(8, Math.floor((node.width - textX - badgeW - 8) / 6.4));
            const title = truncateLabel(node.label, textMax);
            const subtitle = truncateLabel(nodeSubtitle(node), textMax + 2);
            const kindClass = nodeKindClass(node.category);
            const clipId = `osrs-node-${node.id.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
            const radius = nodeRadius(node);
            return (
              <g
                key={node.id}
                transform={`translate(${node.x},${node.y})`}
                className={`osrs-quest__node ${kindClass}${isFocus ? " osrs-quest__node--focus" : ""}${showChain ? " osrs-quest__node--chain" : ""}`}
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
                <title>
                  {node.label}
                  {node.skillReq ? ` · level ${node.skillReq.levelText}` : ""}
                  {node.series ? ` · ${node.series}` : ""}
                </title>
                <clipPath id={clipId}>
                  <rect width={node.width} height={node.height} rx={radius} />
                </clipPath>
                <g clipPath={`url(#${clipId})`}>
                  <rect
                    width={node.width}
                    height={node.height}
                    rx={radius}
                    fill={nodeFill(node, isFocus)}
                  />
                  {showChain ? <rect width={8} height={node.height} fill={seriesColor(node.series)} /> : null}
                </g>
                <rect
                  width={node.width}
                  height={node.height}
                  rx={radius}
                  fill="none"
                  stroke={isFocus ? "#7b4f17" : statusStroke(statusById[node.id] ?? "unknown")}
                  strokeWidth={isFocus ? 2.6 : 1.7}
                />
                {hasIcon && node.skill_key ? (
                  <image
                    href={skillIconUrl(node.skill_key)}
                    x={stripe + 6}
                    y={(node.height - iconSize) / 2}
                    width={iconSize}
                    height={iconSize}
                  />
                ) : null}
                <text className="osrs-quest__node-label">
                  <tspan x={textX} y={19}>
                    {title}
                  </tspan>
                  <tspan x={textX} y={35} className="osrs-quest__node-sub">
                    {subtitle}
                  </tspan>
                </text>
                {node.skillReq ? (
                  <g transform={`translate(${node.width - badgeW - 5},${(node.height - 28) / 2})`}>
                    <rect
                      width={badgeW}
                      height={28}
                      rx={6}
                      className="osrs-quest__node-level"
                    />
                    <text
                      x={badgeW / 2}
                      y={19}
                      textAnchor="middle"
                      className="osrs-quest__node-level-text"
                    >
                      {node.skillReq.levelText}
                    </text>
                  </g>
                ) : null}
              </g>
            );
          })}
        </g>
      </g>
    </svg>
  );
}
