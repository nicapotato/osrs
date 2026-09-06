import { marginRatio } from "./mmgCalc";
import type { MethodRankRow } from "./types";

export function profitAtKph(row: Pick<MethodRankRow, "profit_pk" | "profit_ph">, kph: number): number {
  return row.profit_pk * kph + row.profit_ph;
}

export function hourlyInputAtKph(
  row: Pick<MethodRankRow, "input_total_pk" | "input_total_ph">,
  kph: number,
): number | null {
  if (row.input_total_pk == null && row.input_total_ph == null) return null;
  return (row.input_total_pk ?? 0) * kph + (row.input_total_ph ?? 0);
}

export function hourlyOutputAtKph(
  row: Pick<MethodRankRow, "output_total_pk" | "output_total_ph">,
  kph: number,
): number | null {
  if (row.output_total_pk == null && row.output_total_ph == null) return null;
  return (row.output_total_pk ?? 0) * kph + (row.output_total_ph ?? 0);
}

export function marginAtKph(row: MethodRankRow, kph: number): number | null {
  const input = hourlyInputAtKph(row, kph);
  const output = hourlyOutputAtKph(row, kph);
  if (input == null || output == null) return null;
  return marginRatio(output, input);
}

export function rankMethods(
  rows: MethodRankRow[],
  kphByMethodId: Record<string, number>,
  excludedMethodIds?: ReadonlySet<string>,
): MethodRankRow[] {
  const eligible =
    excludedMethodIds?.size ?
      rows.filter((row) => !excludedMethodIds.has(row.method_id))
    : rows;

  return sortRowsByProfit(eligible, kphByMethodId);
}

export function sortRowsByProfit(
  rows: MethodRankRow[],
  kphByMethodId: Record<string, number>,
): MethodRankRow[] {
  return [...rows].sort((a, b) => {
    const kphA = kphByMethodId[a.method_id] ?? a.default_kph;
    const kphB = kphByMethodId[b.method_id] ?? b.default_kph;
    return profitAtKph(b, kphB) - profitAtKph(a, kphA);
  });
}

export function normalizeMethodCategories(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(String).filter(Boolean);
  }
  if (value == null) return [];
  if (typeof value === "string") {
    let trimmed = value.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      trimmed = trimmed.slice(1, -1);
    }
    if (trimmed.startsWith("[")) {
      try {
        const parsed = JSON.parse(trimmed.replace(/'/g, '"')) as unknown;
        if (Array.isArray(parsed)) {
          return parsed.map(String).filter(Boolean);
        }
      } catch {
        // fall through
      }
    }
    return trimmed
      .split(",")
      .map((part) => part.trim().replace(/^\[|\]$/g, ""))
      .filter(Boolean);
  }
  return [String(value)];
}

export function formatMethodCategories(categories: unknown): string {
  const list = normalizeMethodCategories(categories);
  if (!list.length) return "—";
  return list.join(", ");
}
