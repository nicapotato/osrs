import { useEffect, useMemo, useRef } from "react";
import { sankey, sankeyLinkHorizontal, type SankeyGraph, type SankeyLink, type SankeyNode } from "d3-sankey";

import { attachQuestGraphZoom } from "./graphInteraction";
import { networkSubgraph } from "./layoutNetwork";
import { buildSeriesSankey, type FlowLink, type FlowNode } from "./seriesFlow";
import type { QuestGraph } from "./types";

const VIEW_W = 1400;
const VIEW_H = 900;

type SNode = SankeyNode<FlowNode, FlowLink>;
type SLink = SankeyLink<FlowNode, FlowLink>;

type Props = {
  graph: QuestGraph;
  visibleQuestIds: Set<string>;
  isolatedId: string | null;
  onSeriesClick: (series: string) => void;
  onNodeClick: (nodeId: string) => void;
};

export function QuestSankeySvg({ graph, visibleQuestIds, isolatedId, onSeriesClick, onNodeClick }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const subgraph = useMemo(
    () => networkSubgraph(graph, visibleQuestIds, isolatedId),
    [graph, isolatedId, visibleQuestIds],
  );
  const flow = useMemo(() => buildSeriesSankey(subgraph), [subgraph]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    return attachQuestGraphZoom(svg, [0.35, 2.5], true);
  }, [flow.nodes.map((node) => node.id).join(",")]);

  if (flow.nodes.length < 2 || flow.links.length === 0) {
    return (
      <p className="osrs-quest__empty">
        Sankey needs requirement flows between storylines or skills. Relax filters or pick Force network.
      </p>
    );
  }

  const layout = sankey<FlowNode, FlowLink>()
    .nodeId((node) => node.id)
    .nodeWidth(18)
    .nodePadding(12)
    .extent([
      [24, 24],
      [VIEW_W - 24, VIEW_H - 24],
    ]);

  let graphLayout: SankeyGraph<FlowNode, FlowLink>;
  try {
    graphLayout = layout({
      nodes: flow.nodes.map((node) => ({ ...node })),
      links: flow.links.map((link) => ({ ...link })),
    });
  } catch (err) {
    throw new Error(
      `quest sankey: layout failed (${err instanceof Error ? err.message : "unknown"})`,
    );
  }

  const linkPath = sankeyLinkHorizontal<SNode, SLink>();

  return (
    <svg
      ref={svgRef}
      className="osrs-quest__svg osrs-quest__svg--static"
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="Quest requirement sankey"
    >
      <g className="osrs-quest__zoom">
        {graphLayout.links.map((link, index) => {
          const d = linkPath(link);
          if (!d) throw new Error("quest sankey: link path failed");
          const source = link.source as SNode;
          const target = link.target as SNode;
          return (
            <path
              key={`link-${index}`}
              d={d}
              className={
                link.kind === "requires_skill"
                  ? "osrs-quest__sankey-link osrs-quest__sankey-link--skill"
                  : "osrs-quest__sankey-link"
              }
              stroke={source.color}
              strokeWidth={Math.max(1.5, link.width ?? 1)}
            >
              <title>
                {source.label} → {target.label}: {link.value}
              </title>
            </path>
          );
        })}
        {graphLayout.nodes.map((node) => {
          if (node.x0 == null || node.x1 == null || node.y0 == null || node.y1 == null) {
            throw new Error(`quest sankey: missing box for ${node.id}`);
          }
          const width = node.x1 - node.x0;
          const height = Math.max(2, node.y1 - node.y0);
          const labelLeft = node.x0 < VIEW_W / 2;
          return (
            <g
              key={node.id}
              className="osrs-quest__sankey-node"
              onClick={() => {
                if (node.nodeId) onNodeClick(node.nodeId);
                else onSeriesClick(node.label);
              }}
            >
              <title>{node.label}</title>
              <rect x={node.x0} y={node.y0} width={width} height={height} fill={node.color} rx={2} />
              <text
                className="osrs-quest__sankey-label"
                x={labelLeft ? node.x1 + 8 : node.x0 - 8}
                y={(node.y0 + node.y1) / 2}
                dy="0.35em"
                textAnchor={labelLeft ? "start" : "end"}
              >
                {node.label}
              </text>
            </g>
          );
        })}
      </g>
    </svg>
  );
}
