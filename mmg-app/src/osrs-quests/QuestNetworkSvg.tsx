import { useEffect, useMemo, useRef } from "react";

import { skillIconUrl } from "../osrs-mmg/skillIconUrl";
import { attachQuestGraphZoom, edgeTouchesNode, neighborIdsFor } from "./graphInteraction";
import { layoutNetwork, type NetworkSkillLink } from "./layoutNetwork";
import type { LaidOutQuestNode } from "./neighborhood";
import { QuestGraphNodeMark } from "./QuestGraphNodeMark";
import type { QuestGraph, QuestGraphEdge, QuestPlayerStatus } from "./types";

const PAD_HEAD_Y = 28;
const HEADER_H = 34;

type Props = {
  graph: QuestGraph;
  visibleQuestIds: Set<string>;
  highlightId: string | null;
  statusById: Record<string, QuestPlayerStatus>;
  onNodeClick: (nodeId: string) => void;
  onNodeMenu: (nodeId: string, point: { clientX: number; clientY: number }) => void;
  onNodeFocus: (nodeId: string) => void;
  onBackgroundClick: () => void;
};

function questEdgePath(edge: QuestGraphEdge, nodesById: Map<string, LaidOutQuestNode>): string {
  const from = nodesById.get(edge.from_node_id);
  const to = nodesById.get(edge.to_node_id);
  if (!from || !to) {
    throw new Error(`quest network: layout missing endpoints for ${edge.id}`);
  }
  const x1 = from.x + from.width;
  const y1 = from.y + from.height / 2;
  const x2 = to.x;
  const y2 = to.y + to.height / 2;
  const mid = (x1 + x2) / 2;
  return `M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`;
}

function skillLinkPath(link: NetworkSkillLink): string {
  const mid = (link.x1 + link.x2) / 2;
  return `M ${link.x1} ${link.y1} C ${mid} ${link.y1}, ${mid} ${link.y2}, ${link.x2} ${link.y2}`;
}

export function QuestNetworkSvg({
  graph,
  visibleQuestIds,
  highlightId,
  statusById,
  onNodeClick,
  onNodeMenu,
  onNodeFocus,
  onBackgroundClick,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const layout = useMemo(() => layoutNetwork(graph, visibleQuestIds), [graph, visibleQuestIds]);
  const questById = useMemo(
    () => new Map(layout.questNodes.map((node) => [node.id, node])),
    [layout.questNodes],
  );
  const allEdges = useMemo(
    () => [...layout.questEdges, ...layout.skillLinks.map((link) => link.edge)],
    [layout.questEdges, layout.skillLinks],
  );
  const hotIds = useMemo(
    () => (highlightId ? neighborIdsFor(allEdges, highlightId) : null),
    [allEdges, highlightId],
  );

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    return attachQuestGraphZoom(svg, [0.15, 2.5], true);
  }, [layout.width, layout.height]);

  return (
    <svg
      ref={svgRef}
      className="osrs-quest__svg"
      viewBox={`0 0 ${layout.width} ${layout.height}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="Full quest dependency network"
      onClick={(event) => {
        const target = event.target as Element | null;
        if (target?.closest?.(".osrs-quest__node")) return;
        onBackgroundClick();
      }}
    >
      <g className="osrs-quest__zoom">
        <g className="osrs-quest__hulls">
          {layout.hulls.map((hull) => (
            <g key={hull.series} className="osrs-quest__hull">
              <rect
                x={hull.x}
                y={hull.y}
                width={hull.width}
                height={hull.height}
                rx={12}
                fill={hull.color}
                fillOpacity={0.12}
                stroke={hull.color}
                strokeOpacity={0.45}
                strokeWidth={1.4}
              />
              <text className="osrs-quest__hull-label" x={hull.x + 10} y={hull.y + 14}>
                {hull.series}
              </text>
            </g>
          ))}
        </g>
        <g className="osrs-quest__edges">
          {layout.skillLinks.map((link) => {
            const hot = highlightId ? edgeTouchesNode(link.edge, highlightId) : false;
            return (
              <path
                key={link.edge.id}
                d={skillLinkPath(link)}
                className={[
                  "osrs-quest__edge",
                  "osrs-quest__edge--skill",
                  highlightId && hot ? "osrs-quest__edge--highlight" : "",
                  highlightId && !hot ? "osrs-quest__edge--dim" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              />
            );
          })}
          {layout.questEdges.map((edge) => {
            const hot = highlightId ? edgeTouchesNode(edge, highlightId) : false;
            return (
              <path
                key={edge.id}
                d={questEdgePath(edge, questById)}
                className={[
                  "osrs-quest__edge",
                  highlightId && hot ? "osrs-quest__edge--highlight" : "",
                  highlightId && !hot ? "osrs-quest__edge--dim" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              />
            );
          })}
        </g>
        <g className="osrs-quest__rails">
          {layout.rails.map((rail, index) => {
            const cx = rail.x + rail.width / 2;
            const selected = rail.node.id === highlightId;
            const linked = Boolean(hotIds && hotIds.has(rail.node.id));
            const muted = Boolean(hotIds && !hotIds.has(rail.node.id));
            const showAxis =
              (rail.side === "left" && index === 0) ||
              (rail.side === "right" && index === layout.rails.length - 1);
            return (
              <g
                key={rail.node.id}
                className={muted ? "osrs-quest__rail osrs-quest__node--muted" : "osrs-quest__rail"}
              >
                <line className="osrs-quest__rail-line" x1={cx} y1={rail.y1} x2={cx} y2={rail.y2} />
                {showAxis ? (
                  <>
                    <text className="osrs-quest__rail-level" x={cx + 8} y={rail.y1 + 3}>
                      1
                    </text>
                    <text className="osrs-quest__rail-level" x={cx + 8} y={rail.y2 + 3}>
                      99
                    </text>
                  </>
                ) : null}
                {rail.ticks.map((tick) => (
                  <circle
                    key={`${rail.node.id}-${tick.level}`}
                    className={`osrs-quest__node osrs-quest__rail-tick${selected ? " osrs-quest__node--highlight" : linked ? " osrs-quest__node--neighbor" : ""}`}
                    cx={cx}
                    cy={tick.y}
                    r={selected ? 5 : linked ? 4 : 3.2}
                    fill={selected || linked ? "#c45c12" : "#4f6b3a"}
                    onClick={(event) => {
                      event.stopPropagation();
                      onNodeClick(rail.node.id);
                    }}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      onNodeMenu(rail.node.id, { clientX: event.clientX, clientY: event.clientY });
                    }}
                    onDoubleClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      onNodeFocus(rail.node.id);
                    }}
                  >
                    <title>
                      {rail.node.label} {tick.level}
                    </title>
                  </circle>
                ))}
                <g
                  className={`osrs-quest__node osrs-quest__rail-head${selected ? " osrs-quest__node--highlight" : linked ? " osrs-quest__node--neighbor" : ""}`}
                  transform={`translate(${rail.x},${PAD_HEAD_Y})`}
                  role="button"
                  tabIndex={0}
                  onClick={(event) => {
                    event.stopPropagation();
                    onNodeClick(rail.node.id);
                  }}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    onNodeMenu(rail.node.id, { clientX: event.clientX, clientY: event.clientY });
                  }}
                  onDoubleClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    onNodeFocus(rail.node.id);
                  }}
                >
                  <title>{rail.node.label}</title>
                  <rect
                    width={rail.width}
                    height={HEADER_H}
                    rx={6}
                    fill="#cfe4b8"
                    stroke={selected || linked ? "#c45c12" : "#5c4a32"}
                    strokeWidth={selected ? 2.8 : linked ? 2.2 : 1.4}
                  />
                  {rail.node.skill_key ? (
                    <image
                      href={skillIconUrl(rail.node.skill_key)}
                      x={(rail.width - 16) / 2}
                      y={(HEADER_H - 16) / 2}
                      width={16}
                      height={16}
                    />
                  ) : null}
                </g>
              </g>
            );
          })}
        </g>
        <g className="osrs-quest__nodes">
          {layout.otherNodes.map((node) => (
            <QuestGraphNodeMark
              key={node.id}
              node={node}
              status={statusById[node.id] ?? "unknown"}
              isFocus={false}
              isHighlight={node.id === highlightId}
              isNeighbor={Boolean(hotIds && hotIds.has(node.id) && node.id !== highlightId)}
              muted={Boolean(hotIds && !hotIds.has(node.id))}
              onActivate={() => onNodeClick(node.id)}
              onMenu={(point) => onNodeMenu(node.id, point)}
              onFocus={() => onNodeFocus(node.id)}
            />
          ))}
          {layout.questNodes.map((node) => (
            <QuestGraphNodeMark
              key={node.id}
              node={node}
              status={statusById[node.id] ?? "unknown"}
              isFocus={false}
              isHighlight={node.id === highlightId}
              isNeighbor={Boolean(hotIds && hotIds.has(node.id) && node.id !== highlightId)}
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
