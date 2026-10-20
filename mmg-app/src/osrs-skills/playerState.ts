import type { CharacterProfile } from "../osrs-character/types";
import { skillLevelsFromCharacterProfile } from "../osrs-mmg/womSkills";
import { indexSkillGraph } from "./graphIndex";
import type { SkillGraph, SkillGraphNode, SkillPlayerStatus } from "./types";

export type SkillPlayerContext = {
  skillLevels: Record<string, number>;
  hasSkills: boolean;
};

export function playerContextFromProfile(profile: CharacterProfile | null): SkillPlayerContext {
  const skillLevels = profile ? skillLevelsFromCharacterProfile(profile) : {};
  return {
    skillLevels,
    hasSkills: Object.keys(skillLevels).length > 0,
  };
}

export function statusForNode(
  graph: SkillGraph,
  node: SkillGraphNode,
  ctx: SkillPlayerContext,
  incoming = indexSkillGraph(graph).incoming,
): SkillPlayerStatus {
  if (node.category === "skill") {
    if (!ctx.hasSkills) return "unknown";
    const level = ctx.skillLevels[node.skill_key ?? node.label] ?? 0;
    return level > 1 ? "ready" : "unknown";
  }
  if (node.category !== "method") {
    throw new Error(`skill graph: unexpected category ${node.category}`);
  }
  if (!ctx.hasSkills) return "unknown";
  for (const edge of incoming.get(node.id) ?? []) {
    if (edge.relationship_type !== "unlocks" && edge.relationship_type !== "requires_skill") continue;
    const required = edge.level ?? 0;
    const from = graph.nodes.find((candidate) => candidate.id === edge.from_node_id);
    const skillKey = from?.skill_key ?? from?.label;
    if (!skillKey) {
      throw new Error(`skill graph: skill edge ${edge.id} missing skill node`);
    }
    const have = ctx.skillLevels[skillKey] ?? 0;
    if (have < required) return "locked";
  }
  return "ready";
}
