import type { KeyboardEvent } from "react";

import { skillIconUrl } from "../osrs-mmg/skillIconUrl";
import { categoryTitle, type LaidOutQuestNode } from "./neighborhood";
import { isCompletableNode, seriesColor } from "./questFilters";
import type { QuestGraphNode, QuestPlayerStatus } from "./types";

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

function nodeFill(node: LaidOutQuestNode, isFocus: boolean, isHighlight: boolean, isNeighbor: boolean): string {
  if (isHighlight || isFocus) return "#f3e2a0";
  if (isNeighbor) return "#f8efd4";
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

type Props = {
  node: LaidOutQuestNode;
  status: QuestPlayerStatus;
  isFocus: boolean;
  isHighlight: boolean;
  isNeighbor: boolean;
  muted: boolean;
  onActivate: () => void;
  onMenu: (point: { clientX: number; clientY: number }) => void;
  onFocus: () => void;
};

export function QuestGraphNodeMark({
  node,
  status,
  isFocus,
  isHighlight,
  isNeighbor,
  muted,
  onActivate,
  onMenu,
  onFocus,
}: Props) {
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
  const className = [
    "osrs-quest__node",
    kindClass,
    isFocus ? "osrs-quest__node--focus" : "",
    isHighlight ? "osrs-quest__node--highlight" : "",
    isNeighbor ? "osrs-quest__node--neighbor" : "",
    showChain ? "osrs-quest__node--chain" : "",
    muted ? "osrs-quest__node--muted" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <g
      transform={`translate(${node.x},${node.y})`}
      className={className}
      onClick={(event) => {
        event.stopPropagation();
        onActivate();
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onMenu({ clientX: event.clientX, clientY: event.clientY });
      }}
      onDoubleClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onFocus();
      }}
      role="button"
      tabIndex={0}
      onKeyDown={(event: KeyboardEvent<SVGGElement>) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onActivate();
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
        <rect width={node.width} height={node.height} rx={radius} fill={nodeFill(node, isFocus, isHighlight, isNeighbor)} />
        {showChain ? <rect width={8} height={node.height} fill={seriesColor(node.series)} /> : null}
      </g>
      <rect
        width={node.width}
        height={node.height}
        rx={radius}
        fill="none"
        stroke={isHighlight ? "#c45c12" : isNeighbor ? "#c45c12" : isFocus ? "#7b4f17" : statusStroke(status)}
        strokeWidth={isHighlight ? 3.8 : isNeighbor ? 2.5 : isFocus ? 2.6 : 1.7}
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
          <rect width={badgeW} height={28} rx={6} className="osrs-quest__node-level" />
          <text x={badgeW / 2} y={19} textAnchor="middle" className="osrs-quest__node-level-text">
            {node.skillReq.levelText}
          </text>
        </g>
      ) : null}
    </g>
  );
}
