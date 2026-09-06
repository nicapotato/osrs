import type { TrendDateRange } from "./duckdbQueries";
import { toIsoDate } from "./periodFormat";
import type { BreakdownIoType, MethodItemMetricRow, PeriodGranularity } from "./types";

const GE_API_BASE = "https://prices.runescape.wiki/api/v1/osrs";
const GE_USER_AGENT = "nicapotato-webdev-experiments (OSRS MMG calculator; static site)";

export type MethodIoLine = {
  wikiSlug: string;
  ioType: BreakdownIoType;
  itemName: string;
  qtyPerCompletion: number;
  itemId: number;
};

type GeTimeseriesPoint = {
  timestamp: number;
  avgHighPrice: number | null;
  avgLowPrice: number | null;
  highPriceVolume?: number | null;
  lowPriceVolume?: number | null;
};

function midPrice(point: GeTimeseriesPoint): number | null {
  const high = point.avgHighPrice;
  const low = point.avgLowPrice;
  if (high != null && low != null) return (high + low) / 2;
  if (high != null) return high;
  if (low != null) return low;
  return null;
}

function volumeTotal(point: GeTimeseriesPoint): number {
  return Number(point.highPriceVolume ?? 0) + Number(point.lowPriceVolume ?? 0);
}

function pointInDateRange(timestamp: number, range?: TrendDateRange): boolean {
  if (!range) return true;
  const day = toIsoDate(new Date(timestamp * 1000));
  return day >= range.from && day <= range.to;
}

function truncatePeriod(date: Date, period: PeriodGranularity): string {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = date.getUTCDate();

  switch (period) {
    case "day":
      return toIsoDate(date);
    case "week": {
      const weekday = date.getUTCDay();
      const mondayOffset = weekday === 0 ? -6 : 1 - weekday;
      const monday = new Date(Date.UTC(year, month, day + mondayOffset));
      return toIsoDate(monday);
    }
    case "month":
      return toIsoDate(new Date(Date.UTC(year, month, 1)));
    case "quarter":
      return toIsoDate(new Date(Date.UTC(year, Math.floor(month / 3) * 3, 1)));
    case "year":
      return toIsoDate(new Date(Date.UTC(year, 0, 1)));
  }
}

async function fetchGeTimeseries(itemId: number): Promise<GeTimeseriesPoint[]> {
  const url = `${GE_API_BASE}/timeseries?timestep=24h&id=${itemId}`;
  const res = await fetch(url, {
    headers: { "User-Agent": GE_USER_AGENT },
  });
  if (!res.ok) {
    throw new Error(`GE timeseries failed for item ${itemId} (${res.status})`);
  }
  const payload = (await res.json()) as { data?: GeTimeseriesPoint[] };
  return payload.data ?? [];
}

function aggregateTimeseries(
  points: GeTimeseriesPoint[],
  period: PeriodGranularity,
): Map<string, { price: number | null; volume: number | null }> {
  const byPeriod = new Map<string, { prices: number[]; volume: number }>();

  for (const point of points) {
    const date = new Date(point.timestamp * 1000);
    const key = truncatePeriod(date, period);
    const bucket = byPeriod.get(key) ?? { prices: [], volume: 0 };
    const price = midPrice(point);
    if (price != null) bucket.prices.push(price);
    bucket.volume += volumeTotal(point);
    byPeriod.set(key, bucket);
  }

  const out = new Map<string, { price: number | null; volume: number | null }>();
  for (const [key, bucket] of byPeriod) {
    out.set(key, {
      price: bucket.prices.length ? bucket.prices[bucket.prices.length - 1] : null,
      volume: bucket.volume > 0 ? bucket.volume : null,
    });
  }
  return out;
}

/** Live GE history for a method's items (static-site fallback when DuckDB has no price_metrics). */
export async function fetchMethodItemMetricsFromGeApi(
  ioLines: MethodIoLine[],
  period: PeriodGranularity,
  dateRange?: TrendDateRange,
): Promise<MethodItemMetricRow[]> {
  const linesWithIds = ioLines.filter((line) => line.itemId > 0);
  if (!linesWithIds.length) return [];

  const seriesByLine = await Promise.all(
    linesWithIds.map(async (line) => ({
      line,
      series: await fetchGeTimeseries(line.itemId),
    })),
  );

  const rows: MethodItemMetricRow[] = [];
  for (const { line, series } of seriesByLine) {
    const inRange = series.filter((point) => pointInDateRange(point.timestamp, dateRange));
    const aggregated = aggregateTimeseries(inRange, period);
    for (const [periodKey, metrics] of aggregated) {
      rows.push({
        period: periodKey,
        wikiSlug: line.wikiSlug,
        ioType: line.ioType,
        itemName: line.itemName,
        qtyPerCompletion: line.qtyPerCompletion,
        price: metrics.price,
        volume: metrics.volume,
      });
    }
  }

  rows.sort((a, b) => a.period.localeCompare(b.period));
  return rows;
}
