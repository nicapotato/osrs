import { isCompletableNode, seriesColor } from "./questFilters";
import type { NetworkSubgraph } from "./layoutNetwork";
import type { QuestGraphNode } from "./types";

export const STANDALONE_SERIES = "Standalone";

export type FlowNode = {
  id: string;
  label: string;
  color: string;
  kind: "series" | "skill" | "other";
  nodeId: string | null;
};

export type FlowLink = {
  source: string;
  target: string;
  value: number;
  kind: "requires_quest" | "requires_skill";
};

export function seriesGroupName(node: QuestGraphNode): string {
  if (!isCompletableNode(node)) {
    throw new Error(`quest flow: expected completable node ${node.id}`);
  }
  return node.series || STANDALONE_SERIES;
}

function groupColor(name: string): string {
  if (name === STANDALONE_SERIES) return "#8a7048";
  return seriesColor(name);
}

export function buildSeriesChord(subgraph: NetworkSubgraph): {
  names: string[];
  colors: string[];
  matrix: number[][];
} {
  const names: string[] = [];
  const seen = new Set<string>();
  for (const node of subgraph.nodes) {
    if (!isCompletableNode(node)) continue;
    const name = seriesGroupName(node);
    if (seen.has(name)) continue;
    seen.add(name);
    names.push(name);
  }
  names.sort((a, b) => a.localeCompare(b));
  const index = new Map(names.map((name, i) => [name, i]));
  const n = names.length;
  const matrix = Array.from({ length: n }, () => Array.from({ length: n }, () => 0));
  const byId = new Map(subgraph.nodes.map((node) => [node.id, node]));

  for (const edge of subgraph.edges) {
    if (edge.relationship_type !== "requires_quest") continue;
    const from = byId.get(edge.from_node_id);
    const to = byId.get(edge.to_node_id);
    if (!from || !to) throw new Error(`quest chord: missing endpoint for ${edge.id}`);
    if (!isCompletableNode(from) || !isCompletableNode(to)) continue;
    const i = index.get(seriesGroupName(from));
    const j = index.get(seriesGroupName(to));
    if (i === undefined || j === undefined) {
      throw new Error(`quest chord: unindexed series for ${edge.id}`);
    }
    matrix[i][j] += 1;
  }

  return {
    names,
    colors: names.map(groupColor),
    matrix,
  };
}

function leftId(kind: FlowNode["kind"], label: string): string {
  return `L:${kind}:${label}`;
}

function rightId(label: string): string {
  return `R:series:${label}`;
}

function addNode(nodes: Map<string, FlowNode>, node: FlowNode) {
  if (!nodes.has(node.id)) nodes.set(node.id, node);
}

function bumpLink(links: Map<string, FlowLink>, source: string, target: string, kind: FlowLink["kind"]) {
  const key = `${source}->${target}:${kind}`;
  const existing = links.get(key);
  if (existing) {
    existing.value += 1;
    return;
  }
  links.set(key, { source, target, value: 1, kind });
}

function sourceKind(node: QuestGraphNode): FlowNode["kind"] {
  if (node.category === "skill") return "skill";
  if (isCompletableNode(node)) return "series";
  return "other";
}

export function buildSeriesSankey(subgraph: NetworkSubgraph): { nodes: FlowNode[]; links: FlowLink[] } {
  const byId = new Map(subgraph.nodes.map((node) => [node.id, node]));
  const nodes = new Map<string, FlowNode>();
  const links = new Map<string, FlowLink>();

  for (const edge of subgraph.edges) {
    const from = byId.get(edge.from_node_id);
    const to = byId.get(edge.to_node_id);
    if (!from || !to) throw new Error(`quest sankey: missing endpoint for ${edge.id}`);
    if (!isCompletableNode(to)) continue;

    const targetName = seriesGroupName(to);
    const target = rightId(targetName);
    addNode(nodes, {
      id: target,
      label: targetName,
      color: groupColor(targetName),
      kind: "series",
      nodeId: null,
    });

    if (edge.relationship_type === "requires_quest") {
      if (!isCompletableNode(from)) continue;
      const sourceName = seriesGroupName(from);
      const source = leftId("series", sourceName);
      addNode(nodes, {
        id: source,
        label: sourceName,
        color: groupColor(sourceName),
        kind: "series",
        nodeId: null,
      });
      bumpLink(links, source, target, "requires_quest");
      continue;
    }

    if (edge.relationship_type !== "requires_skill") {
      throw new Error(`quest sankey: unknown edge type ${edge.relationship_type}`);
    }
    const kind = sourceKind(from);
    const sourceName = from.label;
    const source = leftId(kind, from.id);
    addNode(nodes, {
      id: source,
      label: sourceName,
      color: kind === "skill" ? "#4f6b3a" : groupColor(sourceName),
      kind,
      nodeId: from.id,
    });
    bumpLink(links, source, target, "requires_skill");
  }

  return { nodes: [...nodes.values()], links: [...links.values()] };
}

export function chordHasValues(matrix: number[][]): boolean {
  return matrix.some((row) => row.some((value) => value > 0));
}
