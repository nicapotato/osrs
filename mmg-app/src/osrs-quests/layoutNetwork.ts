import { isCompletableNode, seriesColor } from "./questFilters";
import {
  questNodeHeight,
  questNodeWidth,
  type LaidOutQuestNode,
} from "./neighborhood";
import type { QuestGraph, QuestGraphEdge, QuestGraphNode } from "./types";

const LAYER_GAP = 196;
const ROW_GAP = 12;
const PAD = 28;
const RAIL_W = 30;
const RAIL_GAP = 8;
const OTHER_W = 118;
const HULL_PAD = 12;
const HEADER_H = 34;
const LEVEL_MIN = 1;
const LEVEL_MAX = 99;
const MIN_RAIL_SPAN = 400;

export type NetworkHull = {
  series: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
};

export type NetworkRail = {
  node: QuestGraphNode;
  x: number;
  y1: number;
  y2: number;
  width: number;
  side: "left" | "right";
  ticks: { level: number; y: number }[];
};

export type NetworkSkillLink = {
  edge: QuestGraphEdge;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

export type NetworkLayout = {
  questNodes: LaidOutQuestNode[];
  otherNodes: LaidOutQuestNode[];
  hulls: NetworkHull[];
  rails: NetworkRail[];
  questEdges: QuestGraphEdge[];
  skillLinks: NetworkSkillLink[];
  width: number;
  height: number;
};

function isSkill(node: QuestGraphNode): boolean {
  return node.category === "skill";
}

function isOtherReq(node: QuestGraphNode): boolean {
  return (
    node.category === "quest_points" ||
    node.category === "kudos" ||
    node.category === "resource" ||
    node.category === "combat"
  );
}

function levelY(level: number, y1: number, y2: number): number {
  const clamped = Math.min(LEVEL_MAX, Math.max(LEVEL_MIN, level));
  const t = (clamped - LEVEL_MIN) / (LEVEL_MAX - LEVEL_MIN);
  return y1 + t * (y2 - y1);
}

function compareNetworkNodes(a: QuestGraphNode, b: QuestGraphNode): number {
  const as = a.series ?? "";
  const bs = b.series ?? "";
  if (!as && bs) return 1;
  if (as && !bs) return -1;
  if (as !== bs) return as.localeCompare(bs);
  const idx = (a.series_index ?? "").localeCompare(b.series_index ?? "", undefined, {
    numeric: true,
    sensitivity: "base",
  });
  if (idx !== 0) return idx;
  return a.label.localeCompare(b.label);
}

export function layoutNetwork(graph: QuestGraph, visibleQuestIds: Set<string>): NetworkLayout {
  if (visibleQuestIds.size === 0) {
    return {
      questNodes: [],
      otherNodes: [],
      hulls: [],
      rails: [],
      questEdges: [],
      skillLinks: [],
      width: 640,
      height: 280,
    };
  }

  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  const questNodes = graph.nodes.filter((node) => visibleQuestIds.has(node.id));
  if (questNodes.length !== visibleQuestIds.size) {
    const missing = [...visibleQuestIds].filter((id) => !nodesById.has(id));
    throw new Error(`quest network: unknown visible node ${missing[0] ?? "?"}`);
  }

  const questEdges = graph.edges.filter(
    (edge) =>
      edge.relationship_type === "requires_quest" &&
      visibleQuestIds.has(edge.from_node_id) &&
      visibleQuestIds.has(edge.to_node_id),
  );

  const incoming = new Map<string, string[]>();
  for (const node of questNodes) incoming.set(node.id, []);
  for (const edge of questEdges) {
    const list = incoming.get(edge.to_node_id);
    if (!list) throw new Error(`quest network: missing incoming bucket ${edge.to_node_id}`);
    list.push(edge.from_node_id);
  }

  const memo = new Map<string, number>();
  function longest(id: string, stack: Set<string>): number {
    const cached = memo.get(id);
    if (cached !== undefined) return cached;
    if (stack.has(id)) throw new Error(`quest network: cycle involving ${id}`);
    stack.add(id);
    const deps = incoming.get(id);
    if (!deps) throw new Error(`quest network: missing node ${id}`);
    let best = 0;
    for (const dep of deps) {
      best = Math.max(best, 1 + longest(dep, stack));
    }
    stack.delete(id);
    memo.set(id, best);
    return best;
  }

  for (const node of questNodes) longest(node.id, new Set());

  const byLayer = new Map<number, QuestGraphNode[]>();
  for (const node of questNodes) {
    const layer = memo.get(node.id);
    if (layer === undefined) throw new Error(`quest network: missing layer ${node.id}`);
    const bucket = byLayer.get(layer) ?? [];
    bucket.push(node);
    byLayer.set(layer, bucket);
  }

  const layerKeys = [...byLayer.keys()].sort((a, b) => a - b);
  for (const layer of layerKeys) {
    const bucket = byLayer.get(layer);
    if (!bucket) throw new Error(`quest network: empty layer ${layer}`);
    bucket.sort(compareNetworkNodes);
  }

  const skillEdges = graph.edges.filter(
    (edge) => edge.relationship_type === "requires_skill" && visibleQuestIds.has(edge.to_node_id),
  );
  const usedFrom = new Set(skillEdges.map((edge) => edge.from_node_id));
  const visibleSkills = graph.nodes
    .filter((node) => isSkill(node) && usedFrom.has(node.id))
    .sort((a, b) => a.label.localeCompare(b.label));
  const visibleOther = graph.nodes
    .filter((node) => isOtherReq(node) && usedFrom.has(node.id))
    .sort((a, b) => a.label.localeCompare(b.label));

  const split = Math.ceil(visibleSkills.length / 2);
  const leftSkills = visibleSkills.slice(0, split);
  const rightSkills = visibleSkills.slice(split);
  const otherBlock = visibleOther.length > 0 ? OTHER_W + PAD : 0;
  const leftRailBlock = leftSkills.length * (RAIL_W + RAIL_GAP) - (leftSkills.length ? RAIL_GAP : 0);
  const rightRailBlock = rightSkills.length * (RAIL_W + RAIL_GAP) - (rightSkills.length ? RAIL_GAP : 0);
  const leftBlock = otherBlock + (leftSkills.length ? leftRailBlock + PAD : 0);

  let dagHeight = 0;
  for (const layer of layerKeys) {
    const bucket = byLayer.get(layer);
    if (!bucket) throw new Error(`quest network: empty layer ${layer}`);
    let height = 0;
    for (const node of bucket) {
      height += questNodeHeight(node.category) + ROW_GAP;
    }
    dagHeight = Math.max(dagHeight, Math.max(0, height - ROW_GAP));
  }

  const dagTop = PAD + HEADER_H + 8;
  const railY1 = dagTop;
  const railY2 = dagTop + Math.max(dagHeight, MIN_RAIL_SPAN);
  const dagX0 = PAD + leftBlock;

  const laidQuests: LaidOutQuestNode[] = [];
  let maxRight = dagX0;
  let maxBottom = railY2;

  for (const layer of layerKeys) {
    const bucket = byLayer.get(layer);
    if (!bucket) throw new Error(`quest network: empty layer ${layer}`);
    const colX = dagX0 + (layer - layerKeys[0]) * LAYER_GAP;
    let rowY = dagTop;
    for (const node of bucket) {
      if (!isCompletableNode(node)) {
        throw new Error(`quest network: non-quest in DAG ${node.id}`);
      }
      const width = questNodeWidth(node.label);
      const height = questNodeHeight(node.category);
      laidQuests.push({
        ...node,
        x: colX,
        y: rowY,
        width,
        height,
        layer,
        skillReq: null,
      });
      maxRight = Math.max(maxRight, colX + width);
      maxBottom = Math.max(maxBottom, rowY + height);
      rowY += height + ROW_GAP;
    }
  }

  const questById = new Map(laidQuests.map((node) => [node.id, node]));
  const bySeries = new Map<string, LaidOutQuestNode[]>();
  for (const node of laidQuests) {
    if (!node.series) continue;
    const members = bySeries.get(node.series) ?? [];
    members.push(node);
    bySeries.set(node.series, members);
  }

  const hulls: NetworkHull[] = [];
  for (const [series, members] of bySeries) {
    if (members.length < 2) continue;
    const x = Math.min(...members.map((node) => node.x)) - HULL_PAD;
    const y = Math.min(...members.map((node) => node.y)) - HULL_PAD;
    const right = Math.max(...members.map((node) => node.x + node.width)) + HULL_PAD;
    const bottom = Math.max(...members.map((node) => node.y + node.height)) + HULL_PAD;
    hulls.push({
      series,
      x,
      y,
      width: right - x,
      height: bottom - y,
      color: seriesColor(series),
    });
  }

  const rails: NetworkRail[] = [];
  const tickAt = new Map<string, Map<number, { x: number; y: number; side: "left" | "right" }>>();

  function placeRail(skill: QuestGraphNode, index: number, side: "left" | "right") {
    const x =
      side === "left"
        ? PAD + otherBlock + index * (RAIL_W + RAIL_GAP)
        : maxRight + PAD + index * (RAIL_W + RAIL_GAP);
    const levels = [
      ...new Set(
        skillEdges
          .filter((edge) => edge.from_node_id === skill.id && edge.level != null)
          .map((edge) => {
            if (edge.level == null) throw new Error(`quest network: skill edge ${edge.id} missing level`);
            return edge.level;
          }),
      ),
    ].sort((a, b) => a - b);
    const ticks = levels.map((level) => ({ level, y: levelY(level, railY1, railY2) }));
    rails.push({ node: skill, x, y1: railY1, y2: railY2, width: RAIL_W, side, ticks });
    const levelMap = new Map<number, { x: number; y: number; side: "left" | "right" }>();
    const cx = x + RAIL_W / 2;
    for (const tick of ticks) {
      levelMap.set(tick.level, { x: cx, y: tick.y, side });
    }
    tickAt.set(skill.id, levelMap);
  }

  leftSkills.forEach((skill, index) => placeRail(skill, index, "left"));
  rightSkills.forEach((skill, index) => placeRail(skill, index, "right"));

  const otherNodes: LaidOutQuestNode[] = [];
  let otherY = dagTop;
  for (const node of visibleOther) {
    const height = questNodeHeight(node.category);
    otherNodes.push({
      ...node,
      x: PAD,
      y: otherY,
      width: OTHER_W,
      height,
      layer: -2,
      skillReq: null,
    });
    otherY += height + ROW_GAP;
    maxBottom = Math.max(maxBottom, otherY);
  }
  const otherById = new Map(otherNodes.map((node) => [node.id, node]));

  const skillLinks: NetworkSkillLink[] = [];
  for (const edge of skillEdges) {
    const to = questById.get(edge.to_node_id);
    if (!to) throw new Error(`quest network: skill edge missing quest ${edge.to_node_id}`);
    const tickMap = tickAt.get(edge.from_node_id);
    if (tickMap) {
      if (edge.level == null) throw new Error(`quest network: skill edge ${edge.id} missing level`);
      const tick = tickMap.get(edge.level) ?? tickMap.get(Math.min(LEVEL_MAX, Math.max(LEVEL_MIN, edge.level)));
      if (!tick) throw new Error(`quest network: missing tick for ${edge.id}`);
      skillLinks.push({
        edge,
        x1: tick.x,
        y1: tick.y,
        x2: tick.side === "left" ? to.x : to.x + to.width,
        y2: to.y + to.height / 2,
      });
      continue;
    }
    const other = otherById.get(edge.from_node_id);
    if (!other) throw new Error(`quest network: missing skill source ${edge.from_node_id}`);
    skillLinks.push({
      edge,
      x1: other.x + other.width,
      y1: other.y + other.height / 2,
      x2: to.x,
      y2: to.y + to.height / 2,
    });
  }

  const rightExtent = rightSkills.length ? maxRight + PAD + rightRailBlock + PAD : maxRight + PAD;
  return {
    questNodes: laidQuests,
    otherNodes,
    hulls,
    rails,
    questEdges,
    skillLinks,
    width: Math.max(640, rightExtent),
    height: Math.max(280, maxBottom + PAD),
  };
}
