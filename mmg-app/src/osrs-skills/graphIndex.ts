import type { SkillGraph, SkillGraphEdge, SkillGraphNode } from "./types";

export function indexSkillGraph(graph: SkillGraph): {
  nodesById: Map<string, SkillGraphNode>;
  incoming: Map<string, SkillGraphEdge[]>;
  outgoing: Map<string, SkillGraphEdge[]>;
} {
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  const incoming = new Map<string, SkillGraphEdge[]>();
  const outgoing = new Map<string, SkillGraphEdge[]>();
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
  step: Map<string, SkillGraphEdge[]>,
  pick: (edge: SkillGraphEdge) => string,
): Set<string> {
  const seen = new Set<string>([startId]);
  const queue = [startId];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) break;
    for (const edge of step.get(current) ?? []) {
      const next = pick(edge);
      if (seen.has(next)) continue;
      seen.add(next);
      queue.push(next);
    }
  }
  return seen;
}

export function neighborhoodIds(graph: SkillGraph, focusId: string): Set<string> {
  const { nodesById, incoming, outgoing } = indexSkillGraph(graph);
  if (!nodesById.has(focusId)) {
    throw new Error(`skill graph: unknown focus ${focusId}`);
  }
  return new Set([...walk(focusId, incoming, (edge) => edge.from_node_id), ...walk(focusId, outgoing, (edge) => edge.to_node_id)]);
}

export function wikiUrl(node: SkillGraphNode): string {
  const slug = node.wiki_slug ?? node.label.replaceAll(" ", "_");
  return `https://oldschool.runescape.wiki/w/${encodeURI(slug)}`;
}

export function methodWidth(label: string): number {
  return Math.max(128, Math.min(220, 28 + label.length * 7.1));
}

export function skillNodeSize(): { width: number; height: number } {
  return { width: 56, height: 46 };
}
