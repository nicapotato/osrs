export const MMG_PATH = "/mmg";
export const CHARACTER_PATH = "/mmg/c";
export const QUESTS_PATH = "/quests";
export const QUESTS_NETWORK_PATH = "/quests/network";
export const SKILLS_PATH = "/skills";
export const SKILLS_NETWORK_PATH = "/skills/network";

export function methodPath(methodId: string): string {
  return `/mmg/m/${methodId}`;
}

export function questPath(nodeId?: string): string {
  if (!nodeId) return QUESTS_PATH;
  return `${QUESTS_PATH}/${encodeURIComponent(nodeId)}`;
}

export function skillPath(nodeId?: string): string {
  if (!nodeId) return SKILLS_PATH;
  return `${SKILLS_PATH}/${encodeURIComponent(nodeId)}`;
}
