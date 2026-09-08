import type { CharacterProfile } from "../osrs-character/types";
import { skillLevelsFromCharacterProfile } from "../osrs-mmg/womSkills";
import { indexGraph } from "./neighborhood";
import type { QuestGraph, QuestGraphNode, QuestPlayerStatus } from "./types";

export type QuestPlayerContext = {
  skillLevels: Record<string, number>;
  ironman: boolean;
  hasSkills: boolean;
  completed: Set<string>;
};

export function playerContextFromProfile(
  profile: CharacterProfile | null,
  completed: Set<string>,
): QuestPlayerContext {
  const skillLevels = profile ? skillLevelsFromCharacterProfile(profile) : {};
  return {
    skillLevels,
    ironman: profile?.playerType === "ironman" || profile?.playerType === "hardcore" || profile?.playerType === "ultimate",
    hasSkills: Object.keys(skillLevels).length > 0,
    completed,
  };
}

function isCompletable(node: QuestGraphNode): boolean {
  return node.category === "quest" || node.category === "miniquest" || node.category === "diary";
}

export function statusForNode(
  graph: QuestGraph,
  node: QuestGraphNode,
  ctx: QuestPlayerContext,
  incoming = indexGraph(graph).incoming,
): QuestPlayerStatus {
  if (node.category === "skill") {
    if (!ctx.hasSkills) return "unknown";
    const level = ctx.skillLevels[node.skill_key ?? node.label] ?? 0;
    return level > 1 ? "ready" : "unknown";
  }
  if (!isCompletable(node)) {
    return "unknown";
  }
  if (ctx.completed.has(node.id)) return "done";

  let sawRequirement = false;
  for (const edge of incoming.get(node.id) ?? []) {
    if (edge.relationship_type === "requires_quest") {
      sawRequirement = true;
      if (!ctx.completed.has(edge.from_node_id)) return "locked";
    }
    if (edge.relationship_type === "requires_skill") {
      if (edge.ironman_only && !ctx.ironman) continue;
      if (!ctx.hasSkills) continue;
      sawRequirement = true;
      const required = edge.level ?? 0;
      const from = graph.nodes.find((candidate) => candidate.id === edge.from_node_id);
      const skillKey = from?.skill_key ?? from?.label;
      if (!skillKey) {
        throw new Error(`quest graph: skill edge ${edge.id} missing skill node`);
      }
      const have = ctx.skillLevels[skillKey] ?? 0;
      if (have < required) return "locked";
    }
  }
  if (sawRequirement || ctx.completed.size > 0 || ctx.hasSkills) return "ready";
  return "unknown";
}

export function skillRequirementMet(
  ctx: QuestPlayerContext,
  skillKey: string,
  level: number,
  ironmanOnly: boolean,
): boolean | null {
  if (ironmanOnly && !ctx.ironman) return true;
  if (!ctx.hasSkills) return null;
  return (ctx.skillLevels[skillKey] ?? 0) >= level;
}
