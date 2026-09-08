import type { MembersFilter, QuestGraphNode } from "./types";

export type QuestListFilters = {
  query: string;
  members: MembersFilter;
  series: string;
  difficulty: string;
};

export const EMPTY_QUEST_FILTERS: QuestListFilters = {
  query: "",
  members: "all",
  series: "",
  difficulty: "",
};

export function isCompletableNode(node: QuestGraphNode): boolean {
  return node.category === "quest" || node.category === "miniquest" || node.category === "diary";
}

export function uniqueSeries(nodes: QuestGraphNode[]): string[] {
  return [...new Set(nodes.map((node) => node.series).filter((value): value is string => Boolean(value)))].sort();
}

export function uniqueDifficulties(nodes: QuestGraphNode[]): string[] {
  return [
    ...new Set(nodes.map((node) => node.difficulty).filter((value): value is string => Boolean(value))),
  ].sort();
}

export function nodeMatchesFilters(node: QuestGraphNode, filters: QuestListFilters): boolean {
  if (!isCompletableNode(node)) return false;
  if (filters.members === "members" && node.members !== true) return false;
  if (filters.members === "f2p" && node.members !== false) return false;
  if (filters.series && node.series !== filters.series) return false;
  if (filters.difficulty && node.difficulty !== filters.difficulty) return false;
  const query = filters.query.trim().toLowerCase();
  if (!query) return true;
  return node.label.toLowerCase().includes(query) || (node.series ?? "").toLowerCase().includes(query);
}

export function seriesColor(series: string | null | undefined): string {
  if (!series) return "#8a7048";
  let hash = 0;
  for (let i = 0; i < series.length; i += 1) {
    hash = (hash * 31 + series.charCodeAt(i)) >>> 0;
  }
  const hues = [18, 32, 48, 92, 142, 188, 208, 262, 312, 338];
  const hue = hues[hash % hues.length];
  return `hsl(${hue} 42% 38%)`;
}
