import { useEffect, useMemo, useRef } from "react";
import { sankey, sankeyLinkHorizontal, type SankeyGraph, type SankeyLink, type SankeyNode } from "d3-sankey";

import { attachQuestGraphZoom } from "../osrs-quests/graphInteraction";
import { skillNetworkSubgraph } from "./layoutNetwork";
import { buildSkillSankey, type FlowLink, type FlowNode } from "./skillFlow";
import type { SkillFilters } from "./skillFilters";
import type { SkillGraph } from "./types";

const VIEW_W = 1400;
const VIEW_H = 900;

type SNode = SankeyNode<FlowNode, FlowLink>;
type SLink = SankeyLink<FlowNode, FlowLink>;

type Props = {
  graph: SkillGraph;
  filters: SkillFilters;
  isolatedId: string | null;
  onSkillClick: (skill: string) => void;
};

export function SkillSankeySvg({ graph, filters, isolatedId, onSkillClick }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const subgraph = useMemo(() => skillNetworkSubgraph(graph, filters, isolatedId), [filters, graph, isolatedId]);
  const flow = useMemo(() => buildSkillSankey(subgraph), [subgraph]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    return attachQuestGraphZoom(svg, [0.35, 2.5], true);
  }, [flow.nodes.map((node) => node.id).join(",")]);

  if (flow.nodes.length < 2 || flow.links.length === 0) {
    return (
      <p className="osrs-quest__empty">
        Sankey needs producer → consumer skill flows. Lower the cross-skill filter.
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
    throw new Error(`skill sankey: layout failed (${err instanceof Error ? err.message : "unknown"})`);
  }

  const linkPath = sankeyLinkHorizontal<SNode, SLink>();

  return (
    <svg
      ref={svgRef}
      className="osrs-quest__svg osrs-quest__svg--static"
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="Skill flow sankey"
    >
      <g className="osrs-quest__zoom">
        {graphLayout.links.map((link, index) => {
          const d = linkPath(link);
          if (!d) throw new Error("skill sankey: link path failed");
          const source = link.source as SNode;
          return (
            <path key={`link-${index}`} d={d} fill={source.color} fillOpacity={0.4} className="osrs-quest__sankey-link">
              <title>
                {source.label} → {(link.target as SNode).label}: {link.value}
              </title>
            </path>
          );
        })}
        {graphLayout.nodes.map((node) => {
          if (node.x0 == null || node.x1 == null || node.y0 == null || node.y1 == null) {
            throw new Error(`skill sankey: node ${node.id} missing layout`);
          }
          return (
            <g key={node.id} className="osrs-quest__sankey-node" onClick={() => onSkillClick(node.label)}>
              <rect x={node.x0} y={node.y0} width={node.x1 - node.x0} height={node.y1 - node.y0} fill={node.color} />
              <text
                x={node.x0 < VIEW_W / 2 ? node.x1 + 8 : node.x0 - 8}
                y={(node.y0 + node.y1) / 2}
                textAnchor={node.x0 < VIEW_W / 2 ? "start" : "end"}
                dy="0.35em"
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
