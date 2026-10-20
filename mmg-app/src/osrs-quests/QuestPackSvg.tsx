import { useEffect, useMemo, useRef, useState } from "react";
import { hierarchy, interpolateZoom, pack, type HierarchyCircularNode } from "d3";

import { networkSubgraph } from "./layoutNetwork";
import { buildQuestPackTree, packFill, type PackTree } from "./packTree";
import { seriesIconUrl } from "./questFilters";
import { skillIconUrl } from "../osrs-mmg/skillIconUrl";
import type { QuestGraph, QuestPlayerStatus } from "./types";

const SIZE = 960;

type View = [number, number, number];

type Props = {
  graph: QuestGraph;
  visibleQuestIds: Set<string>;
  isolatedId: string | null;
  includeSkills: boolean;
  statusById: Record<string, QuestPlayerStatus>;
  onNodeMenu: (nodeId: string, point: { clientX: number; clientY: number }) => void;
  onNodeFocus: (nodeId: string) => void;
};

function statusStroke(status: QuestPlayerStatus): string {
  if (status === "done") return "#2f6b2f";
  if (status === "ready") return "#8a6a12";
  if (status === "locked") return "#8a3030";
  return "#5c4a32";
}

function familyIcon(name: string): string | null {
  if (name === "Skills") return skillIconUrl("agility");
  return seriesIconUrl(name);
}

function crumb(node: HierarchyCircularNode<PackTree>): string {
  const names: string[] = [];
  let current: HierarchyCircularNode<PackTree> | null = node;
  while (current) {
    names.unshift(current.data.name);
    current = current.parent;
  }
  return names.join(" · ");
}

export function QuestPackSvg({
  graph,
  visibleQuestIds,
  isolatedId,
  includeSkills,
  statusById,
  onNodeMenu,
  onNodeFocus,
}: Props) {
  const subgraph = useMemo(
    () => networkSubgraph(graph, visibleQuestIds, isolatedId, includeSkills),
    [graph, includeSkills, isolatedId, visibleQuestIds],
  );
  const treeKey = useMemo(
    () => subgraph.nodes.map((node) => node.id).sort().join(","),
    [subgraph.nodes],
  );

  const root = useMemo(() => {
    const packed = pack<PackTree>()
      .size([SIZE, SIZE])
      .padding(4)(
        hierarchy(buildQuestPackTree(subgraph.nodes))
          .sum((node) => node.value ?? 0)
          .sort((left, right) => (right.value ?? 0) - (left.value ?? 0)),
      );
    if (packed.x == null || packed.y == null || packed.r == null) {
      throw new Error("quest pack: layout missing root circle");
    }
    return packed;
  }, [subgraph, treeKey]);

  const descendants = useMemo(() => root.descendants().slice(1), [root]);
  const [view, setView] = useState<View>(() => [root.x, root.y, root.r * 2]);
  const [focusId, setFocusId] = useState(root.data.id);
  const viewRef = useRef<View>([root.x, root.y, root.r * 2]);
  const rafRef = useRef(0);

  useEffect(() => {
    const next: View = [root.x, root.y, root.r * 2];
    viewRef.current = next;
    setView(next);
    setFocusId(root.data.id);
    return () => cancelAnimationFrame(rafRef.current);
  }, [root]);

  const focus = descendants.find((node) => node.data.id === focusId) ?? root;
  const k = SIZE / view[2];

  function zoomTo(node: HierarchyCircularNode<PackTree>) {
    if (node.x == null || node.y == null || node.r == null) {
      throw new Error(`quest pack: missing circle for ${node.data.id}`);
    }
    const from = viewRef.current;
    const to: View = [node.x, node.y, node.r * 2];
    setFocusId(node.data.id);
    const interp = interpolateZoom(from, to);
    const start = performance.now();
    cancelAnimationFrame(rafRef.current);
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 750);
      const next = interp(t);
      viewRef.current = next;
      setView(next);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }

  function onCircleClick(node: HierarchyCircularNode<PackTree>) {
    if (node.data.id === focusId) {
      zoomTo(node.parent ?? root);
      return;
    }
    zoomTo(node);
  }

  return (
    <svg
      className="osrs-quest__svg osrs-quest__svg--pack"
      viewBox={`${-SIZE / 2} ${-SIZE / 2} ${SIZE} ${SIZE}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="Zoomable quest family circle packing"
      onClick={() => zoomTo(root)}
    >
      <text className="osrs-quest__pack-crumb" x={-SIZE / 2 + 16} y={-SIZE / 2 + 22}>
        {crumb(focus)}
      </text>
      <g>
        {descendants.map((node) => {
          if (node.x == null || node.y == null || node.r == null) {
            throw new Error(`quest pack: missing circle for ${node.data.id}`);
          }
          const leaf = node.data.kind === "leaf";
          const interactive = Boolean(node.children) || node.parent === focus;
          const leafNode = node.data.node;
          return (
            <circle
              key={node.data.id}
              className={leaf ? "osrs-quest__pack-node osrs-quest__pack-node--leaf" : "osrs-quest__pack-node osrs-quest__pack-node--family"}
              cx={(node.x - view[0]) * k}
              cy={(node.y - view[1]) * k}
              r={Math.max(0.5, node.r * k)}
              fill={packFill(node.data)}
              stroke={leaf && leafNode ? statusStroke(statusById[leafNode.id] ?? "unknown") : packFill(node.data)}
              pointerEvents={interactive ? "auto" : "none"}
              onClick={(event) => {
                event.stopPropagation();
                onCircleClick(node);
              }}
              onContextMenu={(event) => {
                if (!leaf || !leafNode) return;
                event.preventDefault();
                event.stopPropagation();
                onNodeMenu(leafNode.id, { clientX: event.clientX, clientY: event.clientY });
              }}
              onDoubleClick={(event) => {
                if (!leaf || !leafNode) return;
                event.preventDefault();
                event.stopPropagation();
                onNodeFocus(leafNode.id);
              }}
            >
              <title>
                {node.data.name}
                {leafNode?.difficulty ? ` · ${leafNode.difficulty}` : ""}
                {node.children ? ` · ${node.children.length}` : ""}
              </title>
            </circle>
          );
        })}
      </g>
      <g className="osrs-quest__pack-labels" pointerEvents="none">
        {root.descendants().map((node) => {
          if (node.x == null || node.y == null || node.r == null) {
            throw new Error(`quest pack: missing label circle for ${node.data.id}`);
          }
          const show = node.parent === focus || (node === focus && node.data.kind === "leaf");
          if (!show) return null;
          const r = node.r * k;
          if (r < 14) return null;
          const font = Math.max(9, Math.min(15, r * 0.16));
          const maxChars = Math.max(6, Math.floor((r * 1.7) / (font * 0.58)));
          const label = node.data.name.length <= maxChars ? node.data.name : `${node.data.name.slice(0, maxChars - 1)}…`;
          const icon = node.data.kind === "family" && node.parent === root ? familyIcon(node.data.name) : null;
          return (
            <g key={`label:${node.data.id}`} transform={`translate(${(node.x - view[0]) * k},${(node.y - view[1]) * k})`}>
              {icon && r > 32 ? <image href={icon} x={-8} y={-font - 12} width={16} height={16} /> : null}
              <text className="osrs-quest__pack-label" y={icon && r > 32 ? 8 : 4} textAnchor="middle" fontSize={font}>
                {label}
              </text>
            </g>
          );
        })}
      </g>
    </svg>
  );
}
