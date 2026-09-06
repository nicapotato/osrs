import type { PeriodGranularity } from "./types";

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;
const MONTHS_LONG = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

function parsePeriod(value: string | number | Date): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value);
  }

  const raw = String(value).trim();
  if (!raw) return null;

  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    return new Date(Date.UTC(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3])));
  }

  const unixMatch = raw.match(/^(\d{10,13})$/);
  if (unixMatch) {
    const n = Number(unixMatch[1]);
    return new Date(n < 1e12 ? n * 1000 : n);
  }

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function toIsoDate(value: Date | string): string {
  const parsed = parsePeriod(value);
  if (!parsed) return String(value);
  return parsed.toISOString().slice(0, 10);
}

function yearSuffix(year: number): string {
  return String(year).slice(-2);
}

export function formatPeriodAxisLabel(
  value: string | number | Date,
  granularity: PeriodGranularity,
): string {
  const date = parsePeriod(value);
  if (!date) return String(value);

  const day = date.getUTCDate();
  const month = date.getUTCMonth();
  const year = date.getUTCFullYear();

  switch (granularity) {
    case "day":
    case "week":
      return `${day}-${MONTHS_SHORT[month]}`;
    case "month":
      return `${MONTHS_SHORT[month]} '${yearSuffix(year)}`;
    case "quarter":
      return `Q${Math.floor(month / 3) + 1} '${yearSuffix(year)}`;
    case "year":
      return String(year);
  }
}

export function formatPeriodTooltipLabel(
  value: string | number | Date,
  granularity: PeriodGranularity,
): string {
  const date = parsePeriod(value);
  if (!date) return String(value);

  const day = date.getUTCDate();
  const month = date.getUTCMonth();
  const year = date.getUTCFullYear();

  switch (granularity) {
    case "day":
      return `${day} ${MONTHS_LONG[month]} ${year}`;
    case "week":
      return `Week of ${day} ${MONTHS_LONG[month]} ${year}`;
    case "month":
      return `${MONTHS_LONG[month]} ${year}`;
    case "quarter":
      return `Q${Math.floor(month / 3) + 1} ${year}`;
    case "year":
      return String(year);
  }
}

export function periodXAxisProps(granularity: PeriodGranularity) {
  return {
    type: "category" as const,
    scale: "point" as const,
    tickFormatter: (value: string | number) => formatPeriodAxisLabel(value, granularity),
    minTickGap: 56,
    interval: "preserveStartEnd" as const,
    tickMargin: 10,
  };
}

export function comparePeriodKeys(a: string, b: string): number {
  return toIsoDate(a).localeCompare(toIsoDate(b));
}
