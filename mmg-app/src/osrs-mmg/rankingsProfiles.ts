import type {
  KphPreferencesFile,
  RankingsDraftState,
  RankingsProfile,
  RankingsProfilesFile,
} from "./types";
import { profileToDraft } from "./rankingsDraft";
import { normalizeRankingsFilters } from "./rankingsFilters";
import type { CharacterProfile } from "../osrs-character/types";

const PROFILES_STORAGE_KEY = "osrs-mmg-profiles-v2";
const LEGACY_STORAGE_KEY = "osrs-mmg-kph-v1";
export const MAX_RANKINGS_PROFILES = 20;

function createId(): string {
  return crypto.randomUUID();
}

function normalizeWomPlayer(raw: unknown): CharacterProfile | null {
  if (!raw || typeof raw !== "object") return null;
  const parsed = raw as CharacterProfile;
  if (!parsed.username || !Array.isArray(parsed.skills)) return null;
  return parsed;
}

function defaultProfile(name = "Default"): RankingsProfile {
  const now = new Date().toISOString();
  return {
    id: createId(),
    name,
    save_version: 0,
    updated_at: now,
    kph_by_method_id: {},
    disabled_method_ids: [],
    rankings_filters: normalizeRankingsFilters(null),
    wom_player: null,
  };
}

function emptyStore(): RankingsProfilesFile {
  const profile = defaultProfile();
  return {
    version: 2,
    active_profile_id: profile.id,
    profiles: [profile],
  };
}

function migrateLegacyStore(): RankingsProfilesFile | null {
  const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as KphPreferencesFile;
    if (parsed.version !== 1 || typeof parsed.kph_by_method_id !== "object") {
      return null;
    }

    const now = parsed.updated_at ?? new Date().toISOString();
    const profile: RankingsProfile = {
      id: createId(),
      name: "Default",
      save_version: 0,
      updated_at: now,
      kph_by_method_id: parsed.kph_by_method_id ?? {},
      disabled_method_ids: parsed.disabled_method_ids ?? [],
      rankings_filters: normalizeRankingsFilters(null),
      wom_player: null,
    };

    return {
      version: 2,
      active_profile_id: profile.id,
      profiles: [profile],
    };
  } catch {
    return null;
  }
}

function parseSaveVersion(profile: RankingsProfile & { version_name?: string }): number {
  if (typeof profile.save_version === "number" && Number.isFinite(profile.save_version)) {
    return profile.save_version;
  }
  if (profile.version_name) {
    const parsed = Number.parseInt(profile.version_name.replace(/\D/g, ""), 10);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function normalizeStore(raw: RankingsProfilesFile): RankingsProfilesFile {
  const profiles = raw.profiles.slice(0, MAX_RANKINGS_PROFILES).map((profile) => ({
    id: profile.id,
    name: profile.name.trim() || "Untitled",
    save_version: parseSaveVersion(profile as RankingsProfile & { version_name?: string }),
    updated_at: profile.updated_at,
    kph_by_method_id: profile.kph_by_method_id ?? {},
    disabled_method_ids: profile.disabled_method_ids ?? [],
    rankings_filters: normalizeRankingsFilters(profile.rankings_filters),
    wom_player: normalizeWomPlayer(profile.wom_player),
  }));

  if (profiles.length === 0) {
    return emptyStore();
  }

  const activeProfileId = profiles.some((profile) => profile.id === raw.active_profile_id)
    ? raw.active_profile_id
    : profiles[0].id;

  return {
    version: 2,
    active_profile_id: activeProfileId,
    profiles,
  };
}

function readProfilesStore(): RankingsProfilesFile {
  const raw = localStorage.getItem(PROFILES_STORAGE_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as RankingsProfilesFile;
      if (parsed.version === 2 && Array.isArray(parsed.profiles)) {
        return normalizeStore(parsed);
      }
    } catch {
      // fall through to migration / empty store
    }
  }

  const migrated = migrateLegacyStore();
  const store = migrated ?? emptyStore();
  writeProfilesStore(store);
  return store;
}

function writeProfilesStore(store: RankingsProfilesFile): void {
  localStorage.setItem(PROFILES_STORAGE_KEY, JSON.stringify(normalizeStore(store)));
}

function getActiveProfileFromStore(store: RankingsProfilesFile): RankingsProfile {
  return (
    store.profiles.find((profile) => profile.id === store.active_profile_id) ??
    store.profiles[0]
  );
}

export function listRankingsProfiles(): RankingsProfile[] {
  return readProfilesStore().profiles;
}

export function getActiveRankingsProfile(): RankingsProfile {
  return getActiveProfileFromStore(readProfilesStore());
}

export function setActiveRankingsProfile(profileId: string): RankingsProfile {
  const store = readProfilesStore();
  if (!store.profiles.some((profile) => profile.id === profileId)) {
    throw new Error("Profile not found");
  }
  writeProfilesStore({ ...store, active_profile_id: profileId });
  return getActiveProfileFromStore(readProfilesStore());
}

export function createRankingsProfile(name: string): RankingsProfile {
  const store = readProfilesStore();
  if (store.profiles.length >= MAX_RANKINGS_PROFILES) {
    throw new Error(`Maximum of ${MAX_RANKINGS_PROFILES} profiles reached`);
  }

  const profile = defaultProfile(name.trim() || `Profile ${store.profiles.length + 1}`);
  const nextStore = {
    ...store,
    active_profile_id: profile.id,
    profiles: [...store.profiles, profile],
  };
  writeProfilesStore(nextStore);
  return profile;
}

export function deleteRankingsProfile(profileId: string): RankingsProfile {
  const store = readProfilesStore();
  if (store.profiles.length <= 1) {
    throw new Error("At least one profile is required");
  }

  const profiles = store.profiles.filter((profile) => profile.id !== profileId);
  const activeProfileId =
    store.active_profile_id === profileId ? profiles[0].id : store.active_profile_id;

  writeProfilesStore({ ...store, active_profile_id: activeProfileId, profiles });
  return getActiveProfileFromStore(readProfilesStore());
}

function writeProfileData(
  store: RankingsProfilesFile,
  profileId: string,
  patch: Partial<
    Pick<
      RankingsProfile,
      | "kph_by_method_id"
      | "disabled_method_ids"
      | "rankings_filters"
      | "wom_player"
      | "save_version"
      | "updated_at"
    >
  >,
): RankingsProfile {
  let savedProfile: RankingsProfile | null = null;
  const profiles = store.profiles.map((profile) => {
    if (profile.id !== profileId) return profile;
    savedProfile = { ...profile, ...patch };
    return savedProfile;
  });
  if (!savedProfile) throw new Error("Profile not found");
  writeProfilesStore({ ...store, profiles });
  return savedProfile;
}

export function saveActiveRankingsProfile(draft: RankingsDraftState): RankingsProfile {
  const store = readProfilesStore();
  const active = getActiveProfileFromStore(store);
  return writeProfileData(store, active.id, {
    save_version: active.save_version + 1,
    updated_at: new Date().toISOString(),
    kph_by_method_id: { ...draft.kph_by_method_id },
    disabled_method_ids: [...draft.disabled_method_ids],
    rankings_filters: normalizeRankingsFilters(draft.rankings_filters),
    wom_player: draft.wom_player,
  });
}

function patchActiveRankingsProfile(draft: RankingsDraftState): RankingsProfile {
  const store = readProfilesStore();
  const active = getActiveProfileFromStore(store);
  return writeProfileData(store, active.id, {
    kph_by_method_id: { ...draft.kph_by_method_id },
    disabled_method_ids: [...draft.disabled_method_ids],
    rankings_filters: normalizeRankingsFilters(draft.rankings_filters),
    wom_player: draft.wom_player,
  });
}

export function patchActiveProfileWomPlayer(womPlayer: CharacterProfile | null): RankingsProfile {
  const store = readProfilesStore();
  const active = getActiveProfileFromStore(store);
  return writeProfileData(store, active.id, {
    wom_player: womPlayer,
    updated_at: new Date().toISOString(),
  });
}

export function readKphMap(): Record<string, number> {
  return { ...getActiveRankingsProfile().kph_by_method_id };
}

export function readDisabledMethodIds(): string[] {
  return [...getActiveRankingsProfile().disabled_method_ids];
}

export function getUserKph(methodId: string, defaultKph: number): number {
  const value = getActiveRankingsProfile().kph_by_method_id[methodId];
  return value !== undefined && Number.isFinite(value) ? value : defaultKph;
}

export function setUserKph(methodId: string, kph: number): RankingsProfile {
  const active = getActiveRankingsProfile();
  return patchActiveRankingsProfile({
    kph_by_method_id: { ...active.kph_by_method_id, [methodId]: kph },
    disabled_method_ids: active.disabled_method_ids,
    rankings_filters: active.rankings_filters,
    wom_player: active.wom_player,
  });
}

export function exportProfilesBackup(): RankingsProfilesFile {
  return readProfilesStore();
}

export function exportKphBackup(): KphPreferencesFile {
  const active = getActiveRankingsProfile();
  return {
    version: 1,
    updated_at: active.updated_at,
    kph_by_method_id: active.kph_by_method_id,
    disabled_method_ids: active.disabled_method_ids,
  };
}

export function importProfilesBackup(file: RankingsProfilesFile): RankingsProfilesFile {
  if (file.version !== 2 || !Array.isArray(file.profiles)) {
    throw new Error("Invalid profiles backup file");
  }
  const store = normalizeStore(file);
  writeProfilesStore(store);
  return store;
}

export function importKphBackup(
  file: KphPreferencesFile,
  mergeStrategy: "import_wins" = "import_wins",
): RankingsDraftState {
  if (file.version !== 1 || typeof file.kph_by_method_id !== "object") {
    throw new Error("Invalid kph backup file");
  }

  const active = getActiveRankingsProfile();
  const mergedKph =
    mergeStrategy === "import_wins"
      ? { ...active.kph_by_method_id, ...file.kph_by_method_id }
      : { ...file.kph_by_method_id, ...active.kph_by_method_id };

  const mergedDisabled = new Set(active.disabled_method_ids);
  for (const methodId of file.disabled_method_ids ?? []) {
    mergedDisabled.add(methodId);
  }

  const draft: RankingsDraftState = {
    kph_by_method_id: mergedKph,
    disabled_method_ids: [...mergedDisabled],
    rankings_filters: active.rankings_filters,
    wom_player: active.wom_player,
  };

  patchActiveRankingsProfile(draft);
  return draft;
}

export function loadActiveRankingsDraft(): RankingsDraftState {
  return profileToDraft(getActiveRankingsProfile());
}
