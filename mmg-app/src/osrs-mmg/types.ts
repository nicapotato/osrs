import type { CharacterProfile } from "../osrs-character/types";
import type { RankingsFilters as RankingsFiltersState } from "./rankingsFilters";

export type IoLine = {
  itemName: string;
  wikiSlug: string;
  qtyPerCompletion: number;
  gpPerCompletion: number;
};

export type SkillRequirement = {
  skillKey: string;
  requirementText: string | null;
};

export type MmgGuide = {
  id: string;
  methodName: string;
  methodUrl: string;
  defaultKph: number;
  kphUnitName: string;
  assumptionText: string;
  inputTotalPk: number;
  inputTotalPh: number;
  outputTotalPk: number;
  outputTotalPh: number;
  inputs: IoLine[];
  outputs: IoLine[];
  skillRequirements: SkillRequirement[];
};

export type IoLineAtKph = IoLine & {
  qtyPerHour: number;
  gpPerHour: number;
};

export type MmgCalcResult = {
  kph: number;
  inputs: IoLineAtKph[];
  outputs: IoLineAtKph[];
  inputTotal: number;
  outputTotal: number;
  profit: number;
  margin: number | null;
};

export type DataManifest = {
  version: string;
  generated_at: string;
  latest_snapshot_date: string | null;
  method_count: number;
  client_profile?: "slim" | "full";
  snapshot_retention_days?: number;
  includes_price_metrics?: boolean;
  artifacts: {
    database: {
      url: string;
      bytes: number;
      sha256: string;
    };
  };
};

export type MethodRankRow = {
  method_id: string;
  method_name: string;
  method_url: string;
  categories: string[];
  intensity: string;
  is_members: boolean | null;
  default_kph: number;
  completions_unit_name: string;
  input_total_pk: number | null;
  input_total_ph: number | null;
  output_total_pk: number | null;
  output_total_ph: number | null;
  profit_pk: number;
  profit_ph: number;
  profit_linear_approx: boolean | null;
  wiki_rank: number | null;
  wiki_hourly_profit_gp: number | null;
  wiki_profit_gp: number | null;
};

export type PeriodGranularity = "day" | "week" | "month" | "quarter" | "year";

export type TrendPoint = {
  period: string;
  mean_profit: number;
  median_profit: number;
  p25: number;
  p75: number;
};

export type KphPreferencesFile = {
  version: 1;
  updated_at: string;
  kph_by_method_id: Record<string, number>;
  disabled_method_ids?: string[];
};

export type RankingsProfile = {
  id: string;
  name: string;
  save_version: number;
  updated_at: string;
  kph_by_method_id: Record<string, number>;
  disabled_method_ids: string[];
  rankings_filters: RankingsFiltersState;
  wom_player: CharacterProfile | null;
};

export type RankingsProfilesFile = {
  version: 2;
  active_profile_id: string;
  profiles: RankingsProfile[];
};

export type RankingsDraftState = {
  kph_by_method_id: Record<string, number>;
  disabled_method_ids: string[];
  rankings_filters: RankingsFiltersState;
  wom_player: CharacterProfile | null;
};

export type BreakdownIoType = "input" | "output";

export type RankedBreakdownLine = IoLineAtKph & {
  ioType: BreakdownIoType;
  lineKey: string;
};

export type MethodItemMetricRow = {
  period: string;
  wikiSlug: string;
  ioType: BreakdownIoType;
  itemName: string;
  qtyPerCompletion: number;
  price: number | null;
  volume: number | null;
};

export type ItemBreakdownChartPoint = {
  period: string;
  [seriesKey: string]: string | number | null;
};
