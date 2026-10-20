import type { KeyboardEvent, PointerEvent } from "react";

import { skillIconUrl } from "../osrs-mmg/skillIconUrl";
import { skillColor } from "./skillColors";
import type { LaidOutSkillNode } from "./layoutTimeline";
import type { SkillPlayerStatus } from "./types";

function statusStroke(status: SkillPlayerStatus): string {
  if (status === "ready") return "#8a6a12";
  if (status === "locked") return "#8a3030";
  return "#5c4a32";
}

function truncateLabel(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(1, maxChars - 1))}…`;
}

type Props = {
  node: LaidOutSkillNode;
  status: SkillPlayerStatus;
  isFocus: boolean;
  isHighlight: boolean;
  muted: boolean;
  onActivate: () => void;
  onMenu: (point: { clientX: number; clientY: number }) => void;
  onFocus: () => void;
  onPointerDown?: (event: PointerEvent<SVGGElement>) => void;
  onPointerMove?: (event: PointerEvent<SVGGElement>) => void;
  onPointerUp?: (event: PointerEvent<SVGGElement>) => void;
};

export function SkillNodeMark({
  node,
  status,
  isFocus,
  isHighlight,
  muted,
  onActivate,
  onMenu,
  onFocus,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: Props) {
  const isSkill = node.category === "skill";
  const icon = isSkill && node.skill_key ? skillIconUrl(node.skill_key) : null;
  const badgeW = node.skillReq ? (node.skillReq.levelText.length > 3 ? 40 : 30) : 0;
  const textX = icon ? 26 : 8;
  const textMax = Math.max(8, Math.floor((node.width - textX - badgeW - 8) / 6.4));
  const fill = isHighlight || isFocus ? "#f3e2a0" : isSkill ? "#cfe4b8" : "#f4ead0";
  const clipId = `osrs-skill-node-${node.id.replace(/[^a-zA-Z0-9_-]/g, "-")}`;

  return (
    <g
      transform={`translate(${node.x},${node.y})`}
      className={[
        "osrs-quest__node",
        isSkill ? "osrs-quest__node--skill" : "osrs-quest__node--quest",
        isFocus ? "osrs-quest__node--focus" : "",
        isHighlight ? "osrs-quest__node--highlight" : "",
        muted ? "osrs-quest__node--muted" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      onClick={(event) => {
        event.stopPropagation();
        if (onPointerDown) return;
        onActivate();
      }}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.stopPropagation();
        onPointerDown?.(event);
      }}
      onPointerMove={(event) => onPointerMove?.(event)}
      onPointerUp={(event) => onPointerUp?.(event)}
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
        {node.level != null ? ` · level ${node.level}` : ""}
        {node.primary_skill ? ` · ${node.primary_skill}` : ""}
        {node.cross_skill_count != null ? ` · ${node.cross_skill_count} skills` : ""}
      </title>
      <clipPath id={clipId}>
        <rect width={node.width} height={node.height} rx={isSkill ? 14 : 6} />
      </clipPath>
      <g clipPath={`url(#${clipId})`}>
        <rect width={node.width} height={node.height} rx={isSkill ? 14 : 6} fill={fill} />
        {!isSkill && node.primary_skill ? (
          <rect width={8} height={node.height} fill={skillColor(node.primary_skill)} />
        ) : null}
      </g>
      <rect
        width={node.width}
        height={node.height}
        rx={isSkill ? 14 : 6}
        fill="none"
        stroke={isHighlight ? "#c45c12" : isFocus ? "#7b4f17" : statusStroke(status)}
        strokeWidth={isHighlight ? 3.8 : isFocus ? 2.6 : 1.7}
      />
      {icon ? <image href={icon} x={6} y={(node.height - 16) / 2} width={16} height={16} /> : null}
      <text className="osrs-quest__node-label">
        <tspan x={textX} y={19}>
          {truncateLabel(node.label, textMax)}
        </tspan>
        <tspan x={textX} y={35} className="osrs-quest__node-sub">
          {truncateLabel(
            isSkill ? "Skill" : `${node.method_type ?? "Method"}${node.xp != null ? ` · ${node.xp} xp` : ""}`,
            textMax + 2,
          )}
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
