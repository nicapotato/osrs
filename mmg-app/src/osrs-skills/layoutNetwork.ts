import { indexSkillGraph, methodWidth, neighborhoodIds, skillNodeSize } from "./graphIndex";
import { methodMatchesFilters, type SkillFilters } from "./skillFilters";
import type { SkillGraph, SkillGraphEdge, SkillGraphNode } from "./types";

export type SkillNetworkSubgraph = {
  nodes: SkillGraphNode[];
  edges: SkillGraphEdge[];
};

export function networkNodeSize(node: SkillGraphNode): { width: number; height: number } {
  if (node.category === "skill") return skillNodeSize();
  return { width: methodWidth(node.label), height: 50 };
}

export function skillNetworkSubgraph(
  graph: SkillGraph,
  filters: SkillFilters,
  isolatedId: string | null,
): SkillNetworkSubgraph {
  const { nodesById } = indexSkillGraph(graph);
  const selected = new Set<string>();
  for (const node of graph.nodes) {
    if (node.category !== "method") continue;
    if (!methodMatchesFilters(node, filters)) continue;
    selected.add(node.id);
  }
  if (isolatedId) {
    const focus = nodesById.get(isolatedId);
    if (!focus) throw new Error(`skill network: unknown isolate ${isolatedId}`);
    const hood = neighborhoodIds(graph, isolatedId);
    for (const id of [...selected]) {
      if (!hood.has(id)) selected.delete(id);
    }
    selected.add(isolatedId);
  }
  for (const edge of graph.edges) {
    if (edge.relationship_type === "feeds") continue;
    if (!selected.has(edge.to_node_id)) continue;
    const source = nodesById.get(edge.from_node_id);
    if (!source) throw new Error(`skill network: missing source ${edge.from_node_id}`);
    if (source.category === "skill") selected.add(source.id);
  }
  const nodes = graph.nodes.filter((node) => selected.has(node.id));
  const edges = graph.edges.filter((edge) => selected.has(edge.from_node_id) && selected.has(edge.to_node_id));
  return { nodes, edges };
}
