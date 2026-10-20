import { skillColor } from "./skillColors";
import type { SkillNetworkSubgraph } from "./layoutNetwork";
import type { SkillGraphNode } from "./types";

export type FlowNode = {
  id: string;
  label: string;
  color: string;
  nodeId: string | null;
};

export type FlowLink = {
  source: string;
  target: string;
  value: number;
  kind: "feeds" | "requires_skill";
};

function skillName(node: SkillGraphNode): string {
  if (node.category === "skill") return node.skill_key ?? node.label;
  if (node.primary_skill) return node.primary_skill;
  throw new Error(`skill flow: node ${node.id} has no skill`);
}

export function buildSkillChord(subgraph: SkillNetworkSubgraph): {
  names: string[];
  colors: string[];
  matrix: number[][];
} {
  const names: string[] = [];
  const seen = new Set<string>();
  for (const node of subgraph.nodes) {
    if (node.category !== "skill") continue;
    const name = skillName(node);
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
    const from = byId.get(edge.from_node_id);
    const to = byId.get(edge.to_node_id);
    if (!from || !to) throw new Error(`skill chord: missing endpoint for ${edge.id}`);
    let sourceName: string | null = null;
    let targetName: string | null = null;
    if (edge.relationship_type === "feeds" && from.category === "method" && to.category === "method") {
      sourceName = skillName(from);
      targetName = skillName(to);
    } else if (edge.relationship_type === "requires_skill" && from.category === "skill" && to.category === "method") {
      sourceName = skillName(to);
      targetName = skillName(from);
    }
    if (!sourceName || !targetName || sourceName === targetName) continue;
    const i = index.get(sourceName);
    const j = index.get(targetName);
    if (i === undefined || j === undefined) continue;
    matrix[i][j] += 1;
  }

  return { names, colors: names.map((name) => skillColor(name)), matrix };
}

export function buildSkillSankey(subgraph: SkillNetworkSubgraph): { nodes: FlowNode[]; links: FlowLink[] } {
  const byId = new Map(subgraph.nodes.map((node) => [node.id, node]));
  const nodes = new Map<string, FlowNode>();
  const links = new Map<string, FlowLink>();

  function addSkill(side: "L" | "R", name: string) {
    const id = `${side}:${name}`;
    if (!nodes.has(id)) {
      nodes.set(id, { id, label: name, color: skillColor(name), nodeId: `skill:${name.toLowerCase()}` });
    }
    return id;
  }

  function bump(source: string, target: string, kind: FlowLink["kind"]) {
    const key = `${source}->${target}:${kind}`;
    const existing = links.get(key);
    if (existing) {
      existing.value += 1;
      return;
    }
    links.set(key, { source, target, value: 1, kind });
  }

  for (const edge of subgraph.edges) {
    const from = byId.get(edge.from_node_id);
    const to = byId.get(edge.to_node_id);
    if (!from || !to) throw new Error(`skill sankey: missing endpoint for ${edge.id}`);
    if (edge.relationship_type === "feeds" && from.category === "method" && to.category === "method") {
      const sourceName = skillName(from);
      const targetName = skillName(to);
      if (sourceName === targetName) continue;
      bump(addSkill("L", sourceName), addSkill("R", targetName), "feeds");
    }
    if (edge.relationship_type === "requires_skill" && from.category === "skill" && to.category === "method") {
      const sourceName = skillName(to);
      const targetName = skillName(from);
      if (sourceName === targetName) continue;
      bump(addSkill("L", sourceName), addSkill("R", targetName), "requires_skill");
    }
  }
  return { nodes: [...nodes.values()], links: [...links.values()] };
}

export function chordHasValues(matrix: number[][]): boolean {
  return matrix.some((row) => row.some((value) => value > 0));
}
