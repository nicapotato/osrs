export function parseRequirementLevel(requirementText: string | null | undefined): number {
  if (!requirementText) return 0;
  const match = requirementText.trim().match(/(\d+)/);
  return match ? Number(match[1]) : 0;
}
