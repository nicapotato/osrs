import type { MembersFilter, QuestGraphNode } from "./types";

export type CompletableKind = "quest" | "miniquest" | "diary";

export type QuestKindFilters = {
  quest: boolean;
  miniquest: boolean;
  diary: boolean;
  skill: boolean;
};

export type QuestListFilters = {
  query: string;
  members: MembersFilter;
  series: string;
  difficulty: string;
  kinds: QuestKindFilters;
};

export const EMPTY_QUEST_FILTERS: QuestListFilters = {
  query: "",
  members: "all",
  series: "",
  difficulty: "",
  kinds: { quest: true, miniquest: true, diary: true, skill: true },
};

export function isCompletableNode(node: QuestGraphNode): boolean {
  return node.category === "quest" || node.category === "miniquest" || node.category === "diary";
}

export function uniqueSeries(nodes: QuestGraphNode[]): string[] {
  return [...new Set(nodes.map((node) => node.series).filter((value): value is string => Boolean(value)))].sort();
}

export function uniqueDifficulties(nodes: QuestGraphNode[]): string[] {
  return [
    ...new Set(nodes.map((node) => node.difficulty).filter((value): value is string => Boolean(value))),
  ].sort();
}

function kindEnabled(category: QuestGraphNode["category"], kinds: QuestKindFilters): boolean {
  if (category === "quest") return kinds.quest;
  if (category === "miniquest") return kinds.miniquest;
  if (category === "diary") return kinds.diary;
  throw new Error(`quest graph: unexpected completable category ${category}`);
}

export function nodeMatchesFilters(node: QuestGraphNode, filters: QuestListFilters): boolean {
  if (!isCompletableNode(node)) return false;
  if (!kindEnabled(node.category, filters.kinds)) return false;
  if (filters.members === "members" && node.members !== true) return false;
  if (filters.members === "f2p" && node.members !== false) return false;
  if (filters.series && node.series !== filters.series) return false;
  if (filters.difficulty && node.difficulty !== filters.difficulty) return false;
  const query = filters.query.trim().toLowerCase();
  if (!query) return true;
  return node.label.toLowerCase().includes(query) || (node.series ?? "").toLowerCase().includes(query);
}

export const DIFFICULTY_ORDER = [
  "Novice",
  "Intermediate",
  "Experienced",
  "Master",
  "Grandmaster",
  "Special",
  "Unrated",
] as const;

export function difficultyBucket(difficulty: string | null | undefined): (typeof DIFFICULTY_ORDER)[number] {
  if (!difficulty) return "Unrated";
  if ((DIFFICULTY_ORDER as readonly string[]).includes(difficulty)) {
    return difficulty as (typeof DIFFICULTY_ORDER)[number];
  }
  throw new Error(`quest graph: unknown difficulty ${difficulty}`);
}

export function difficultyRank(difficulty: string | null | undefined): number {
  return DIFFICULTY_ORDER.indexOf(difficultyBucket(difficulty));
}

export function difficultyFill(difficulty: string | null | undefined): string {
  if (!difficulty) return "#f4ead0";
  if (difficulty === "Novice") return "#b7d59a";
  if (difficulty === "Intermediate") return "#ead56a";
  if (difficulty === "Experienced") return "#e0a24a";
  if (difficulty === "Master") return "#d46a5a";
  if (difficulty === "Grandmaster") return "#9b6bb8";
  if (difficulty === "Special") return "#d4c4a8";
  throw new Error(`quest graph: unknown difficulty ${difficulty}`);
}

const SERIES_ICON_FILES: Record<string, string> = {
  Camelot: "camelot.png",
  "Demon Slayer": "demon-slayer.png",
  Dorgeshuun: "dorgeshuun.png",
  Dragonkin: "dragonkin.png",
  "Elemental Workshop": "elemental-workshop.png",
  Elf: "elf.png",
  Fairytale: "fairytale.png",
  Fremennik: "fremennik.png",
  Gnome: "gnome.png",
  "Great Kourend": "great-kourend.png",
  Kharidian: "kharidian.png",
  Mahjarrat: "mahjarrat.png",
  Miscellania: "miscellania.png",
  Myreque: "myreque.png",
  "Order of Wizards": "order-of-wizards.png",
  Penguin: "penguin.png",
  Pirate: "pirate.png",
  "Rag and Bone Man": "rag-and-bone-man.png",
  "Red Axe": "red-axe.png",
  "Temple Knight": "temple-knight.png",
  Troll: "troll.png",
  "Twilight Emissaries": "twilight-emissaries.png",
  "Twisted Tales": "twisted-tales.png",
};

export function seriesIconUrl(series: string | null | undefined): string | null {
  if (!series) return null;
  const file = SERIES_ICON_FILES[series];
  if (!file) return null;
  return `${import.meta.env.BASE_URL}osrs-assets/series/${file}`;
}

export function seriesColor(series: string | null | undefined): string {
  if (!series) return "#8a7048";
  let hash = 0;
  for (let i = 0; i < series.length; i += 1) {
    hash = (hash * 31 + series.charCodeAt(i)) >>> 0;
  }
  const hues = [18, 32, 48, 92, 142, 188, 208, 262, 312, 338];
  const hue = hues[hash % hues.length];
  return `hsl(${hue} 42% 38%)`;
}
