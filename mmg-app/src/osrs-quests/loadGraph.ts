import { parseQuestGraph } from "./graphSchema";
import type { QuestGraph } from "./types";

export function graphAssetUrl(): string {
  return `${import.meta.env.BASE_URL}osrs-quests/graph.json`;
}

export async function loadQuestGraph(): Promise<QuestGraph> {
  const response = await fetch(graphAssetUrl());
  if (!response.ok) {
    throw new Error(`quest graph: failed to load (${response.status})`);
  }
  return parseQuestGraph(await response.json());
}
