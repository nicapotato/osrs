import { difficultyFill, seriesColor } from "./questFilters";
import type { QuestGraphNode } from "./types";

export type PackTree = {
  name: string;
  id: string;
  kind: "root" | "family" | "leaf";
  node?: QuestGraphNode;
  children?: PackTree[];
  value?: number;
};

export function familyKey(node: QuestGraphNode): string {
  if (node.category === "skill") return "Skills";
  if (node.series) return node.series;
  if (node.category === "miniquest") return "Miniquests";
  if (node.category === "diary") return "Diaries";
  if (node.category === "quest") return "Standalone";
  return "Other";
}

export function buildQuestPackTree(nodes: QuestGraphNode[]): PackTree {
  const groups = new Map<string, QuestGraphNode[]>();
  for (const node of nodes) {
    const key = familyKey(node);
    const bucket = groups.get(key) ?? [];
    bucket.push(node);
    groups.set(key, bucket);
  }
  const children: PackTree[] = [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, members]) => ({
      name,
      id: `family:${name}`,
      kind: "family",
      children: members
        .slice()
        .sort((left, right) => left.label.localeCompare(right.label))
        .map((node) => ({
          name: node.label,
          id: node.id,
          kind: "leaf" as const,
          node,
          value: 1,
        })),
    }));
  if (children.length === 0) {
    throw new Error("quest pack: no visible nodes");
  }
  return { name: "Quests", id: "root", kind: "root", children };
}

export function packFill(tree: PackTree): string {
  if (tree.kind === "root") return "#e8d9b8";
  if (tree.kind === "leaf") {
    const node = tree.node;
    if (!node) throw new Error(`quest pack: leaf ${tree.id} missing node`);
    if (node.category === "quest") return difficultyFill(node.difficulty);
    if (node.category === "miniquest") return "#efe0c0";
    if (node.category === "diary") return "#d7e3ef";
    if (node.category === "skill") return "#cfe4b8";
    return "#e4d4f0";
  }
  if (tree.name === "Skills") return "#4f6b3a";
  if (tree.name === "Standalone" || tree.name === "Miniquests" || tree.name === "Diaries" || tree.name === "Other") {
    return "#8a7048";
  }
  return seriesColor(tree.name);
}
