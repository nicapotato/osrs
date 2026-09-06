import type { CharacterProfile } from "../osrs-character/types";

export function skillLevelsFromCharacterProfile(profile: CharacterProfile): Record<string, number> {
  const levels: Record<string, number> = {};
  for (const skill of profile.skills) {
    if (skill.level > 0) {
      levels[skill.skillKey] = skill.level;
    }
  }
  return levels;
}
