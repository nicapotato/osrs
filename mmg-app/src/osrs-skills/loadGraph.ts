import { parseSkillGraph } from "./graphSchema";
import type { SkillGraph } from "./types";

export function graphAssetUrl(): string {
  return `${import.meta.env.BASE_URL}osrs-skills/graph.json`;
}

export async function loadSkillGraph(): Promise<SkillGraph> {
  const response = await fetch(graphAssetUrl());
  if (!response.ok) {
    throw new Error(`skill graph: failed to load (${response.status})`);
  }
  return parseSkillGraph(await response.json());
}
