export type WomPlayerType = "unknown" | "regular" | "ironman" | "hardcore" | "ultimate";

export type CharacterSkillRow = {
  skillKey: string;
  womMetric: string;
  level: number;
  experience: number;
  rank: number;
};

export type CharacterProfile = {
  username: string;
  displayName: string;
  playerType: WomPlayerType;
  combatLevel: number | null;
  fetchedAt: string;
  snapshotCreatedAt: string | null;
  womUpdatedAt: string | null;
  skills: CharacterSkillRow[];
};

export type WomFetchMeta = {
  endpoint: "GET" | "POST";
  status: number;
  raw: unknown;
};
