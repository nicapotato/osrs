import { indexSkillGraph, methodWidth, neighborhoodIds, skillNodeSize } from "./graphIndex";
import type { SkillGraph, SkillGraphEdge, SkillGraphNode } from "./types";

export type LaidOutSkillNode = SkillGraphNode & {
  x: number;
  y: number;
  width: number;
  height: number;
  skillReq: { levelText: string } | null;
};

const METHOD_HEIGHT = 50;
const LEVEL_GAP = 58;
const COL_GAP = 12;
const PAD_X = 96;
const PAD_Y = 28;

export function layoutSkillTimeline(graph: SkillGraph, skillId: string): {
  nodes: LaidOutSkillNode[];
  edges: SkillGraphEdge[];
  width: number;
  height: number;
} {
  const { nodesById, outgoing } = indexSkillGraph(graph);
  const skill = nodesById.get(skillId);
  if (!skill || skill.category !== "skill") {
    throw new Error(`skill timeline: expected skill node ${skillId}`);
  }
  const methods = (outgoing.get(skillId) ?? [])
    .filter((edge) => edge.relationship_type === "unlocks")
    .map((edge) => {
      const node = nodesById.get(edge.to_node_id);
      if (!node) throw new Error(`skill timeline: missing method ${edge.to_node_id}`);
      return node;
    })
    .filter((node) => node.category === "method")
    .sort((a, b) => (a.level ?? 0) - (b.level ?? 0) || a.label.localeCompare(b.label));

  const byLevel = new Map<number, SkillGraphNode[]>();
  for (const method of methods) {
    const level = method.level;
    if (level == null) throw new Error(`skill timeline: method ${method.id} missing level`);
    const bucket = byLevel.get(level) ?? [];
    bucket.push(method);
    byLevel.set(level, bucket);
  }

  const size = skillNodeSize();
  const laid: LaidOutSkillNode[] = [
    {
      ...skill,
      x: 16,
      y: PAD_Y,
      width: size.width,
      height: size.height,
      skillReq: null,
    },
  ];
  let maxX = 16 + size.width;
  const edges: SkillGraphEdge[] = [];
  for (const [level, bucket] of [...byLevel.entries()].sort((a, b) => a[0] - b[0])) {
    let x = PAD_X;
    const y = PAD_Y + (level - 1) * LEVEL_GAP;
    for (const method of bucket) {
      const width = methodWidth(method.label);
      laid.push({
        ...method,
        x,
        y,
        width,
        height: METHOD_HEIGHT,
        skillReq: { levelText: String(level) },
      });
      edges.push({
        id: `timeline:${skillId}:${method.id}`,
        from_node_id: skillId,
        to_node_id: method.id,
        relationship_type: "unlocks",
        level,
      });
      x += width + COL_GAP;
      maxX = Math.max(maxX, x);
    }
  }
  return {
    nodes: laid,
    edges,
    width: Math.max(maxX + 24, 720),
    height: PAD_Y * 2 + 99 * LEVEL_GAP,
  };
}

export function layoutSkillNeighborhood(graph: SkillGraph, focusId: string): {
  nodes: LaidOutSkillNode[];
  edges: SkillGraphEdge[];
  width: number;
  height: number;
} {
  const { nodesById, incoming, outgoing } = indexSkillGraph(graph);
  const focus = nodesById.get(focusId);
  if (!focus) throw new Error(`skill neighborhood: unknown ${focusId}`);
  const ids = neighborhoodIds(graph, focusId);
  const columns: SkillGraphNode[][] = [[], [], []];
  for (const id of ids) {
    const node = nodesById.get(id);
    if (!node) throw new Error(`skill neighborhood: missing ${id}`);
    if (id === focusId) {
      columns[1].push(node);
      continue;
    }
    if ((incoming.get(focusId) ?? []).some((edge) => edge.from_node_id === id)) {
      columns[0].push(node);
      continue;
    }
    if ((outgoing.get(focusId) ?? []).some((edge) => edge.to_node_id === id)) {
      columns[2].push(node);
      continue;
    }
    columns[node.category === "skill" ? 0 : 2].push(node);
  }
  for (const col of columns) {
    col.sort((a, b) => (a.level ?? 0) - (b.level ?? 0) || a.label.localeCompare(b.label));
  }
  const laid: LaidOutSkillNode[] = [];
  const colX = [24, 280, 560];
  let height = 80;
  for (let col = 0; col < columns.length; col += 1) {
    let y = 24;
    for (const node of columns[col]) {
      const size = node.category === "skill" ? skillNodeSize() : { width: methodWidth(node.label), height: METHOD_HEIGHT };
      const reqEdge = (incoming.get(node.id) ?? []).find(
        (edge) => edge.relationship_type === "unlocks" || edge.relationship_type === "requires_skill",
      );
      laid.push({
        ...node,
        x: colX[col],
        y,
        width: size.width,
        height: size.height,
        skillReq: reqEdge?.level != null ? { levelText: String(reqEdge.level) } : null,
      });
      y += size.height + 14;
      height = Math.max(height, y);
    }
  }
  const edges = graph.edges.filter((edge) => ids.has(edge.from_node_id) && ids.has(edge.to_node_id));
  return { nodes: laid, edges, width: 820, height: height + 24 };
}
