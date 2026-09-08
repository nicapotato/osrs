import type { QuestGraph, QuestGraphEdge, QuestGraphNode } from "./types";

export type LaidOutQuestNode = QuestGraphNode & {
  x: number;
  y: number;
  width: number;
  height: number;
  layer: number;
};

const NODE_HEIGHT = 36;
const LAYER_GAP = 210;
const ROW_GAP = 14;
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

function nodeWidth(label: string): number {
  return Math.max(96, Math.min(188, 18 + label.length * 7.1));
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
    bucket.forEach((node, index) => {
      const width = nodeWidth(node.label);
      const y = PAD_Y + index * (NODE_HEIGHT + ROW_GAP);
      laid.push({
        ...node,
        x: colX,
        y,
        width,
        height: NODE_HEIGHT,
        layer,
      });
      maxBottom = Math.max(maxBottom, y + NODE_HEIGHT);
      maxRight = Math.max(maxRight, colX + width);
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
