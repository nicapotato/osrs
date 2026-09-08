export const MMG_PATH = "/mmg";
export const CHARACTER_PATH = "/mmg/c";
export const QUESTS_PATH = "/quests";

export function methodPath(methodId: string): string {
  return `/mmg/m/${methodId}`;
}

export function questPath(nodeId?: string): string {
  if (!nodeId) return QUESTS_PATH;
  return `${QUESTS_PATH}/${encodeURIComponent(nodeId)}`;
}
