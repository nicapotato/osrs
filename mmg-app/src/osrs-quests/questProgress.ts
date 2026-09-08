const STORAGE_KEY = "osrs-quest-progress-v1";
const LOCAL_USERNAME = "_local";

type ProgressFile = {
  version: 1;
  by_username: Record<string, string[]>;
};

function emptyStore(): ProgressFile {
  return { version: 1, by_username: {} };
}

function readStore(): ProgressFile {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return emptyStore();
  try {
    const parsed = JSON.parse(raw) as ProgressFile;
    if (parsed.version !== 1 || typeof parsed.by_username !== "object" || !parsed.by_username) {
      throw new Error("quest progress: unexpected store shape");
    }
    return parsed;
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("quest progress:")) throw err;
    throw new Error("quest progress: stored JSON is invalid");
  }
}

function writeStore(store: ProgressFile): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

export function progressKey(username: string | null | undefined): string {
  const trimmed = username?.trim().toLowerCase();
  return trimmed || LOCAL_USERNAME;
}

export function loadCompletedQuestIds(username: string | null | undefined): Set<string> {
  const store = readStore();
  return new Set(store.by_username[progressKey(username)] ?? []);
}

export function saveCompletedQuestIds(username: string | null | undefined, ids: Set<string>): void {
  const store = readStore();
  store.by_username[progressKey(username)] = [...ids].sort();
  writeStore(store);
}

export function toggleCompletedQuest(
  username: string | null | undefined,
  questId: string,
): Set<string> {
  const ids = loadCompletedQuestIds(username);
  if (ids.has(questId)) ids.delete(questId);
  else ids.add(questId);
  saveCompletedQuestIds(username, ids);
  return ids;
}
