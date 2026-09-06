import type { CharacterProfile, CharacterSkillRow, WomFetchMeta, WomPlayerType } from "./types";

const WOM_BASE = "https://api.wiseoldman.net/v2";

const WOM_SKILL_METRICS = [
  "attack",
  "strength",
  "defence",
  "ranged",
  "prayer",
  "magic",
  "runecrafting",
  "construction",
  "hitpoints",
  "agility",
  "herblore",
  "thieving",
  "crafting",
  "fletching",
  "slayer",
  "hunter",
  "mining",
  "smithing",
  "fishing",
  "cooking",
  "firemaking",
  "woodcutting",
  "farming",
  "sailing",
] as const;

const METRIC_TO_SKILL_KEY: Record<(typeof WOM_SKILL_METRICS)[number], string> = {
  attack: "Attack",
  strength: "Strength",
  defence: "Defence",
  ranged: "Ranged",
  prayer: "Prayer",
  magic: "Magic",
  runecrafting: "Runecraft",
  construction: "Construction",
  hitpoints: "Hitpoints",
  agility: "Agility",
  herblore: "Herblore",
  thieving: "Thieving",
  crafting: "Crafting",
  fletching: "Fletching",
  slayer: "Slayer",
  hunter: "Hunter",
  mining: "Mining",
  smithing: "Smithing",
  fishing: "Fishing",
  cooking: "Cooking",
  firemaking: "Firemaking",
  woodcutting: "Woodcutting",
  farming: "Farming",
  sailing: "Sailing",
};

export class WomApiError extends Error {
  status: number;
  body: unknown;

  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = "WomApiError";
    this.status = status;
    this.body = body;
  }
}

function womHeaders(): HeadersInit {
  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  const apiKey = import.meta.env.VITE_WOM_API_KEY;
  if (typeof apiKey === "string" && apiKey.trim()) {
    headers["x-api-key"] = apiKey.trim();
  }
  return headers;
}

function normalizeUsername(username: string): string {
  const trimmed = username.trim();
  if (!trimmed) {
    throw new Error("Enter a RuneScape name (1–12 characters).");
  }
  if (trimmed.length > 12) {
    throw new Error("RuneScape names are at most 12 characters.");
  }
  return trimmed;
}

function parsePlayerType(value: unknown): WomPlayerType {
  if (
    value === "regular" ||
    value === "ironman" ||
    value === "hardcore" ||
    value === "ultimate" ||
    value === "unknown"
  ) {
    return value;
  }
  return "unknown";
}

function parseSkillRow(metric: string, raw: unknown): CharacterSkillRow | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const level = Number(row.level);
  const experience = Number(row.experience);
  const rank = Number(row.rank);
  if (!Number.isFinite(level)) return null;

  const skillKey = METRIC_TO_SKILL_KEY[metric as (typeof WOM_SKILL_METRICS)[number]];
  if (!skillKey) return null;

  return {
    skillKey,
    womMetric: metric,
    level,
    experience: Number.isFinite(experience) ? experience : 0,
    rank: Number.isFinite(rank) ? rank : -1,
  };
}

function profileFromWomResponse(raw: unknown, username: string): CharacterProfile {
  if (!raw || typeof raw !== "object") {
    throw new Error("Unexpected WOM response shape.");
  }

  const body = raw as Record<string, unknown>;
  const snapshot = body.latestSnapshot as Record<string, unknown> | null | undefined;
  const data = snapshot?.data as Record<string, unknown> | undefined;
  const skillsRaw = data?.skills as Record<string, unknown> | undefined;

  const skills: CharacterSkillRow[] = [];
  for (const metric of WOM_SKILL_METRICS) {
    const row = parseSkillRow(metric, skillsRaw?.[metric]);
    if (row) skills.push(row);
  }

  return {
    username: String(body.username ?? username),
    displayName: String(body.displayName ?? body.username ?? username),
    playerType: parsePlayerType(body.type),
    combatLevel: typeof body.combatLevel === "number" ? body.combatLevel : null,
    fetchedAt: new Date().toISOString(),
    snapshotCreatedAt: typeof snapshot?.createdAt === "string" ? snapshot.createdAt : null,
    womUpdatedAt: typeof body.updatedAt === "string" ? body.updatedAt : null,
    skills,
  };
}

async function requestWomPlayer(username: string, method: "GET" | "POST"): Promise<WomFetchMeta> {
  const normalized = normalizeUsername(username);
  const url = `${WOM_BASE}/players/${encodeURIComponent(normalized)}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: womHeaders(),
    });
  } catch (err) {
    const message =
      err instanceof TypeError ?
        "Network error — likely CORS blocked the request from this origin. Try from localhost or check browser console."
      : err instanceof Error ? err.message : "Network request failed.";
    throw new Error(message);
  }

  const text = await response.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }

  if (!response.ok) {
    const detail =
      body && typeof body === "object" && "message" in body ?
        String((body as { message: unknown }).message)
      : typeof body === "string" ? body : response.statusText;
    if (response.status === 404 && method === "GET") {
      throw new WomApiError(
        "Player not found on Wise Old Man. Try Refresh to track them first (POST).",
        response.status,
        body,
      );
    }
    if (response.status === 429) {
      throw new WomApiError("WOM rate limit hit — wait a minute and try again.", response.status, body);
    }
    throw new WomApiError(detail || `WOM request failed (${response.status})`, response.status, body);
  }

  return { endpoint: method, status: response.status, raw: body };
}

export async function loadWomPlayer(username: string): Promise<{ profile: CharacterProfile; meta: WomFetchMeta }> {
  const meta = await requestWomPlayer(username, "GET");
  return {
    profile: profileFromWomResponse(meta.raw, normalizeUsername(username)),
    meta,
  };
}

export async function refreshWomPlayer(username: string): Promise<{ profile: CharacterProfile; meta: WomFetchMeta }> {
  const meta = await requestWomPlayer(username, "POST");
  return {
    profile: profileFromWomResponse(meta.raw, normalizeUsername(username)),
    meta,
  };
}
