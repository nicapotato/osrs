import { isCompletableNode } from "./questFilters";
import { neighborhoodIds, questNodeHeight, questNodeWidth } from "./neighborhood";
import type { QuestGraph, QuestGraphEdge, QuestGraphNode } from "./types";

export type NetworkSubgraph = {
  nodes: QuestGraphNode[];
  edges: QuestGraphEdge[];
};

function isReqNode(node: QuestGraphNode): boolean {
  return (
    node.category === "skill" ||
    node.category === "quest_points" ||
    node.category === "kudos" ||
    node.category === "resource" ||
    node.category === "combat"
  );
}

export function networkNodeSize(node: QuestGraphNode): { width: number; height: number } {
  if (node.category === "skill") return { width: 56, height: 46 };
  if (isReqNode(node)) return { width: questNodeWidth(node.label), height: questNodeHeight(node.category) };
  return { width: questNodeWidth(node.label), height: questNodeHeight(node.category) };
}

export function networkSubgraph(
  graph: QuestGraph,
  questIds: Set<string>,
  isolatedId: string | null,
  includeSkills = true,
): NetworkSubgraph {
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  const hood = isolatedId ? neighborhoodIds(graph, isolatedId) : null;

  const selected = new Set<string>();
  for (const node of graph.nodes) {
    if (isCompletableNode(node)) {
      if (!questIds.has(node.id)) continue;
      if (hood && !hood.has(node.id)) continue;
      selected.add(node.id);
    }
  }
  if (isolatedId) {
    const focus = nodesById.get(isolatedId);
    if (!focus) throw new Error(`quest network: unknown isolate ${isolatedId}`);
    selected.add(isolatedId);
  }

  for (const edge of graph.edges) {
    if (edge.relationship_type !== "requires_skill") continue;
    if (!selected.has(edge.to_node_id)) continue;
    const source = nodesById.get(edge.from_node_id);
    if (!source) throw new Error(`quest network: missing skill source ${edge.from_node_id}`);
    if (!isReqNode(source)) continue;
    if (source.category === "skill" && !includeSkills) continue;
    selected.add(source.id);
  }

  const nodes = graph.nodes.filter((node) => selected.has(node.id));
  const edges = graph.edges.filter(
    (edge) => selected.has(edge.from_node_id) && selected.has(edge.to_node_id),
  );
  return { nodes, edges };
}
