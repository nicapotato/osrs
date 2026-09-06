const SKILL_ICON_OVERRIDES: Record<string, string> = {
  sailing: "sailing.png",
};

export function skillIconUrl(skillKey: string): string {
  const slug = skillKey.toLowerCase().replace(/\s+/g, "-");
  const filename = SKILL_ICON_OVERRIDES[slug] ?? `${slug}-icon.png`;
  return `${import.meta.env.BASE_URL}osrs-assets/${filename}`;
}
