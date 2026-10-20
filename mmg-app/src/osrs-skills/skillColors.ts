const SKILL_COLORS: Record<string, string> = {
  attack: "#8a3030",
  strength: "#6b3a18",
  defence: "#3a5a8a",
  ranged: "#3d6b3a",
  prayer: "#d0c48a",
  magic: "#4a3a8a",
  runecraft: "#6b4a8a",
  construction: "#8a6a3a",
  hitpoints: "#8a3a4a",
  agility: "#3a6b5a",
  herblore: "#4f6b3a",
  thieving: "#4a3a5a",
  crafting: "#8a7048",
  fletching: "#6a7a3a",
  slayer: "#3a3a4a",
  hunter: "#5a6b3a",
  mining: "#5a5a5a",
  smithing: "#6a6a72",
  fishing: "#3a7ca5",
  cooking: "#b55b2a",
  firemaking: "#c45c12",
  woodcutting: "#3d8c40",
  farming: "#4f7a32",
  sailing: "#2f6b7a",
};

export function skillColor(skillKey: string | undefined): string {
  if (!skillKey) return "#5c4a32";
  return SKILL_COLORS[skillKey.toLowerCase()] ?? "#5c4a32";
}

export function skillSlug(skillKey: string): string {
  return skillKey.toLowerCase().replace(/\s+/g, "-");
}
