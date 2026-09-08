import type { QuestGraph, QuestGraphEdge, QuestGraphNode } from "./types";

export type SkillReqDisplay = {
  levelText: string;
  boostable: boolean;
};

export type LaidOutQuestNode = QuestGraphNode & {
  x: number;
  y: number;
  width: number;
  height: number;
  layer: number;
  skillReq: SkillReqDisplay | null;
};

const QUEST_NODE_HEIGHT = 50;
const SKILL_NODE_HEIGHT = 46;
const LAYER_GAP = 236;
const ROW_GAP = 16;
const PAD_X = 24;
const PAD_Y = 24;

export function indexGraph(graph: QuestGraph): {
  nodesById: Map<string, QuestGraphNode>;
  incoming: Map<string, QuestGraphEdge[]>;
  outgoing: Map<string, QuestGraphEdge[]>;
} {
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  const incoming = new Map<string, QuestGraphEdge[]>();
  const outgoing = new Map<string, QuestGraphEdge[]>();
  for (const edge of graph.edges) {
    const ins = incoming.get(edge.to_node_id) ?? [];
    ins.push(edge);
    incoming.set(edge.to_node_id, ins);
    const outs = outgoing.get(edge.from_node_id) ?? [];
    outs.push(edge);
    outgoing.set(edge.from_node_id, outs);
  }
  return { nodesById, incoming, outgoing };
}

function walk(
  startId: string,
  step: Map<string, QuestGraphEdge[]>,
  pick: (edge: QuestGraphEdge) => string,
): Map<string, number> {
  const dist = new Map<string, number>([[startId, 0]]);
  const queue = [startId];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) break;
    const depth = dist.get(current);
    if (depth === undefined) {
      throw new Error(`quest graph: missing BFS depth for ${current}`);
    }
    for (const edge of step.get(current) ?? []) {
      const next = pick(edge);
      if (dist.has(next)) continue;
      dist.set(next, depth + 1);
      queue.push(next);
    }
  }
  return dist;
}

function nodeWidth(label: string, extra = 0): number {
  return Math.max(132, Math.min(236, 28 + label.length * 7.2 + extra));
}

function nodeHeight(category: QuestGraphNode["category"]): number {
  return category === "skill" || category === "quest_points" || category === "kudos" || category === "resource" || category === "combat"
    ? SKILL_NODE_HEIGHT
    : QUEST_NODE_HEIGHT;
}

export function categoryTitle(category: QuestGraphNode["category"]): string {
  if (category === "quest") return "Quest";
  if (category === "miniquest") return "Miniquest";
  if (category === "diary") return "Diary";
  if (category === "skill") return "Skill";
  if (category === "quest_points") return "Quest points";
  if (category === "kudos") return "Kudos";
  if (category === "combat") return "Combat";
  return "Other";
}

export function skillReqForNode(
  node: QuestGraphNode,
  edges: QuestGraphEdge[],
  focusId: string,
  visibleIds?: Set<string>,
): SkillReqDisplay | null {
  if (node.category === "quest" || node.category === "miniquest" || node.category === "diary") {
    return null;
  }
  const outs = edges.filter((edge) => {
    if (edge.from_node_id !== node.id || edge.relationship_type !== "requires_skill" || edge.level == null) {
      return false;
    }
    return !visibleIds || visibleIds.has(edge.to_node_id);
  });
  if (outs.length === 0) return null;
  const toFocus = outs.find((edge) => edge.to_node_id === focusId);
  const levels = (toFocus ? [toFocus] : outs).map((edge) => {
    if (edge.level == null) throw new Error(`quest graph: skill edge ${edge.id} missing level`);
    return edge.level;
  });
  const min = Math.min(...levels);
  const max = Math.max(...levels);
  return {
    levelText: min === max ? String(min) : `${min}–${max}`,
    boostable: outs.some((edge) => edge.boostable),
  };
}

export function layoutNeighborhood(graph: QuestGraph, focusId: string): {
  nodes: LaidOutQuestNode[];
  edges: QuestGraphEdge[];
  width: number;
  height: number;
} {
  const { nodesById, incoming, outgoing } = indexGraph(graph);
  if (!nodesById.has(focusId)) {
    throw new Error(`quest graph: unknown focus ${focusId}`);
  }

  const ancestorDist = walk(focusId, incoming, (edge) => edge.from_node_id);
  const descendantDist = walk(focusId, outgoing, (edge) => edge.to_node_id);

  const layers = new Map<string, number>();
  for (const [id, dist] of ancestorDist) {
    if (id === focusId) continue;
    layers.set(id, -dist);
  }
  layers.set(focusId, 0);
  for (const [id, dist] of descendantDist) {
    if (id === focusId) continue;
    layers.set(id, dist);
  }

  const byLayer = new Map<number, QuestGraphNode[]>();
  for (const [id, layer] of layers) {
    const node = nodesById.get(id);
    if (!node) throw new Error(`quest graph: neighborhood missing ${id}`);
    const bucket = byLayer.get(layer) ?? [];
    bucket.push(node);
    byLayer.set(layer, bucket);
  }

  const visibleIds = new Set(layers.keys());
  const layerKeys = [...byLayer.keys()].sort((a, b) => a - b);
  const laid: LaidOutQuestNode[] = [];
  let maxBottom = 0;
  let maxRight = 0;

  for (const layer of layerKeys) {
    const bucket = byLayer.get(layer);
    if (!bucket) throw new Error(`quest graph: empty layer ${layer}`);
    bucket.sort((a, b) => {
      if (a.category !== b.category) return a.category.localeCompare(b.category);
      return a.label.localeCompare(b.label);
    });
    const colX = PAD_X + (layer - layerKeys[0]) * LAYER_GAP;
    let rowY = PAD_Y;
    bucket.forEach((node) => {
      const skillReq = skillReqForNode(node, graph.edges, focusId, visibleIds);
      const extra = skillReq ? (skillReq.levelText.length > 3 ? 46 : 36) : 0;
      const width = nodeWidth(node.label, extra);
      const height = nodeHeight(node.category);
      laid.push({
        ...node,
        x: colX,
        y: rowY,
        width,
        height,
        layer,
        skillReq,
      });
      maxBottom = Math.max(maxBottom, rowY + height);
      maxRight = Math.max(maxRight, colX + width);
      rowY += height + ROW_GAP;
    });
  }

  const visible = new Set(laid.map((node) => node.id));
  const edges = graph.edges.filter(
    (edge) => visible.has(edge.from_node_id) && visible.has(edge.to_node_id),
  );

  return {
    nodes: laid,
    edges,
    width: Math.max(640, maxRight + PAD_X),
    height: Math.max(280, maxBottom + PAD_Y),
  };
}

export function wikiUrl(node: QuestGraphNode): string {
  const slug = node.wiki_slug ?? node.label.replaceAll(" ", "_");
  return `https://oldschool.runescape.wiki/w/${encodeURI(slug)}`;
}
