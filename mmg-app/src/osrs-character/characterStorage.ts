import type { CharacterProfile } from "./types";

const STORAGE_KEY = "osrs-character-profile-v1";

export function loadCharacterProfile(): CharacterProfile | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as CharacterProfile;
    if (!parsed.username || !Array.isArray(parsed.skills)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveCharacterProfile(profile: CharacterProfile): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
}

export function clearCharacterProfile(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function parseCharacterProfileImport(raw: unknown): CharacterProfile {
  if (!raw || typeof raw !== "object") {
    throw new Error("Invalid character JSON");
  }
  const parsed = raw as CharacterProfile;
  if (!parsed.username || !Array.isArray(parsed.skills)) {
    throw new Error("Invalid character JSON — missing username or skills");
  }
  return parsed;
}
