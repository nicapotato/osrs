import { inferPartySize, partyRangesOverlap } from "./partySize";
import { hourlyInputAtKph } from "./rankMethods";
import { parseRequirementLevel } from "./skillLevels";
import type { MethodRankRow, SkillRequirement } from "./types";

export const OSRS_SKILL_KEYS = [
  "Attack",
  "Strength",
  "Defence",
  "Ranged",
  "Prayer",
  "Magic",
  "Runecraft",
  "Construction",
  "Hitpoints",
  "Agility",
  "Herblore",
  "Thieving",
  "Crafting",
  "Fletching",
  "Slayer",
  "Hunter",
  "Mining",
  "Smithing",
  "Fishing",
  "Cooking",
  "Firemaking",
  "Woodcutting",
  "Farming",
  "Sailing",
] as const;

export type GroupContentFilter = "any" | "solo" | "group";

export type RankingsFilters = {
  skillLevels: Record<string, number>;
  methodTypes: string[];
  intensities: string[];
  liquidGp: number | null;
  groupContent: GroupContentFilter;
  partySizeMin: number | null;
  partySizeMax: number | null;
};

export const EMPTY_RANKINGS_FILTERS: RankingsFilters = {
  skillLevels: {},
  methodTypes: [],
  intensities: [],
  liquidGp: null,
  groupContent: "any",
  partySizeMin: null,
  partySizeMax: null,
};

export function methodPrimaryType(row: MethodRankRow): string {
  return row.categories[0]?.trim() ?? "";
}

export function rankingsFiltersActive(filters: RankingsFilters): boolean {
  if (filters.methodTypes.length > 0 || filters.intensities.length > 0) return true;
  if (filters.liquidGp != null) return true;
  if (filters.groupContent !== "any") return true;
  if (filters.partySizeMin != null || filters.partySizeMax != null) return true;
  return Object.values(filters.skillLevels).some((level) => level > 0);
}

export function methodMeetsSkillLevels(
  skills: SkillRequirement[],
  skillLevels: Record<string, number>,
): boolean {
  const hasAnyLevel = Object.values(skillLevels).some((level) => level > 0);
  if (!hasAnyLevel) return true;

  for (const req of skills) {
    const required = parseRequirementLevel(req.requirementText);
    if (required <= 0) continue;
    const userLevel = skillLevels[req.skillKey] ?? 0;
    if (userLevel < required) return false;
  }
  return true;
}

function methodMatchesGroupFilters(row: MethodRankRow, filters: RankingsFilters): boolean {
  const party = inferPartySize(`${row.method_name} ${row.method_url}`);

  if (filters.groupContent === "solo" && (party.min !== 1 || party.max !== 1)) {
    return false;
  }
  if (filters.groupContent === "group" && party.min < 2) {
    return false;
  }

  if (filters.partySizeMin == null && filters.partySizeMax == null) {
    return true;
  }

  const userRange = {
    min: filters.partySizeMin ?? 1,
    max: filters.partySizeMax ?? 99,
  };
  return partyRangesOverlap(party, userRange);
}

export function methodMatchesRankingsFilters(
  row: MethodRankRow,
  skills: SkillRequirement[],
  filters: RankingsFilters,
  kph: number,
): boolean {
  if (filters.methodTypes.length > 0) {
    const primaryType = methodPrimaryType(row);
    if (!primaryType || !filters.methodTypes.includes(primaryType)) return false;
  }

  if (filters.intensities.length > 0) {
    const intensity = row.intensity.trim();
    if (!intensity || !filters.intensities.includes(intensity)) return false;
  }

  if (filters.liquidGp != null) {
    const inputHourly = hourlyInputAtKph(row, kph);
    if (inputHourly != null && inputHourly > filters.liquidGp) return false;
  }

  if (!methodMatchesGroupFilters(row, filters)) return false;

  return methodMeetsSkillLevels(skills, filters.skillLevels);
}

function parseOptionalPositiveInt(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.floor(parsed);
}

export function normalizeRankingsFilters(raw: unknown): RankingsFilters {
  if (!raw || typeof raw !== "object") return EMPTY_RANKINGS_FILTERS;
  const value = raw as Partial<RankingsFilters>;
  const skillLevels: Record<string, number> = {};
  if (value.skillLevels && typeof value.skillLevels === "object") {
    for (const [key, level] of Object.entries(value.skillLevels)) {
      const parsed = Number(level);
      if (Number.isFinite(parsed) && parsed > 0) {
        skillLevels[key] = Math.min(99, Math.floor(parsed));
      }
    }
  }

  const groupContent =
    value.groupContent === "solo" || value.groupContent === "group" ? value.groupContent : "any";
  const liquidParsed = Number(value.liquidGp);
  const liquidGp =
    Number.isFinite(liquidParsed) && liquidParsed > 0 ? Math.floor(liquidParsed) : null;

  return {
    skillLevels,
    methodTypes: Array.isArray(value.methodTypes) ? value.methodTypes.map(String) : [],
    intensities: Array.isArray(value.intensities) ? value.intensities.map(String) : [],
    liquidGp,
    groupContent,
    partySizeMin: parseOptionalPositiveInt(value.partySizeMin),
    partySizeMax: parseOptionalPositiveInt(value.partySizeMax),
  };
}

export function rankingsFiltersEqual(a: RankingsFilters, b: RankingsFilters): boolean {
  if (a.methodTypes.slice().sort().join("\0") !== b.methodTypes.slice().sort().join("\0")) {
    return false;
  }
  if (a.intensities.slice().sort().join("\0") !== b.intensities.slice().sort().join("\0")) {
    return false;
  }
  if (a.liquidGp !== b.liquidGp) return false;
  if (a.groupContent !== b.groupContent) return false;
  if (a.partySizeMin !== b.partySizeMin || a.partySizeMax !== b.partySizeMax) return false;
  const keys = new Set([...Object.keys(a.skillLevels), ...Object.keys(b.skillLevels)]);
  for (const key of keys) {
    if ((a.skillLevels[key] ?? null) !== (b.skillLevels[key] ?? null)) return false;
  }
  return true;
}

export function collectFilterOptions(rows: MethodRankRow[]): {
  methodTypes: string[];
  intensities: string[];
} {
  const methodTypes = new Set<string>();
  const intensities = new Set<string>();

  for (const row of rows) {
    const primaryType = methodPrimaryType(row);
    if (primaryType) methodTypes.add(primaryType);
    const intensity = row.intensity.trim();
    if (intensity) intensities.add(intensity);
  }

  return {
    methodTypes: [...methodTypes].sort(),
    intensities: [...intensities].sort(),
  };
}
