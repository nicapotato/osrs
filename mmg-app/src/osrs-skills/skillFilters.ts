import type { CrossSkillFilter, MembersFilter, SkillGraphNode } from "./types";

export type SkillFilters = {
  members: MembersFilter;
  minCross: CrossSkillFilter;
  skill: string;
};

export const EMPTY_SKILL_FILTERS: SkillFilters = {
  members: "all",
  minCross: 3,
  skill: "",
};

export function methodMatchesFilters(node: SkillGraphNode, filters: SkillFilters): boolean {
  if (node.category !== "method") {
    throw new Error(`skill filters: expected method, got ${node.category}`);
  }
  if (filters.skill && node.primary_skill !== filters.skill) return false;
  if (filters.members === "members" && node.members === false) return false;
  if (filters.members === "f2p" && node.members === true) return false;
  const cross = node.cross_skill_count ?? 1;
  return cross >= filters.minCross;
}

export function uniquePrimarySkills(nodes: SkillGraphNode[]): string[] {
  const names = new Set<string>();
  for (const node of nodes) {
    if (node.category === "method" && node.primary_skill) names.add(node.primary_skill);
  }
  return [...names].sort((a, b) => a.localeCompare(b));
}
