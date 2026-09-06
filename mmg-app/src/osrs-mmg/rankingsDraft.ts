import type { CharacterProfile } from "../osrs-character/types";
import {
  EMPTY_RANKINGS_FILTERS,
  normalizeRankingsFilters,
  rankingsFiltersEqual,
} from "./rankingsFilters";
import type { RankingsDraftState, RankingsProfile } from "./types";

export function cloneRankingsDraft(state: RankingsDraftState): RankingsDraftState {
  return {
    kph_by_method_id: { ...state.kph_by_method_id },
    disabled_method_ids: [...state.disabled_method_ids],
    rankings_filters: normalizeRankingsFilters(state.rankings_filters),
    wom_player: state.wom_player ? { ...state.wom_player, skills: [...state.wom_player.skills] } : null,
  };
}

function womPlayersEqual(a: CharacterProfile | null, b: CharacterProfile | null): boolean {
  if (a === b) return true;
  if (!a || !b) return !a && !b;
  return a.username === b.username && a.fetchedAt === b.fetchedAt;
}

export function draftsEqual(a: RankingsDraftState, b: RankingsDraftState): boolean {
  const disabledA = [...a.disabled_method_ids].sort().join("\0");
  const disabledB = [...b.disabled_method_ids].sort().join("\0");
  if (disabledA !== disabledB) return false;

  const keys = new Set([
    ...Object.keys(a.kph_by_method_id),
    ...Object.keys(b.kph_by_method_id),
  ]);
  for (const key of keys) {
    if ((a.kph_by_method_id[key] ?? null) !== (b.kph_by_method_id[key] ?? null)) {
      return false;
    }
  }

  if (!womPlayersEqual(a.wom_player, b.wom_player)) return false;

  return rankingsFiltersEqual(
    normalizeRankingsFilters(a.rankings_filters),
    normalizeRankingsFilters(b.rankings_filters),
  );
}

export function disabledSetFromDraft(draft: RankingsDraftState): Set<string> {
  return new Set(draft.disabled_method_ids);
}

export function setRankingEnabledInDraft(
  draft: RankingsDraftState,
  methodId: string,
  enabled: boolean,
): RankingsDraftState {
  const disabled = new Set(draft.disabled_method_ids);
  if (enabled) disabled.delete(methodId);
  else disabled.add(methodId);
  return {
    ...draft,
    disabled_method_ids: [...disabled],
  };
}

export function setAllRankingEnabledInDraft(
  draft: RankingsDraftState,
  methodIds: string[],
  enabled: boolean,
): RankingsDraftState {
  const disabled = new Set(draft.disabled_method_ids);
  for (const methodId of methodIds) {
    if (enabled) disabled.delete(methodId);
    else disabled.add(methodId);
  }
  return {
    ...draft,
    disabled_method_ids: [...disabled],
  };
}

export function setDraftKph(
  draft: RankingsDraftState,
  methodId: string,
  kph: number,
): RankingsDraftState {
  return {
    ...draft,
    kph_by_method_id: { ...draft.kph_by_method_id, [methodId]: kph },
  };
}

export function profileToDraft(profile: RankingsProfile): RankingsDraftState {
  return cloneRankingsDraft({
    kph_by_method_id: profile.kph_by_method_id,
    disabled_method_ids: profile.disabled_method_ids,
    rankings_filters: profile.rankings_filters,
    wom_player: profile.wom_player,
  });
}

export function emptyRankingsDraft(): RankingsDraftState {
  return {
    kph_by_method_id: {},
    disabled_method_ids: [],
    rankings_filters: EMPTY_RANKINGS_FILTERS,
    wom_player: null,
  };
}
