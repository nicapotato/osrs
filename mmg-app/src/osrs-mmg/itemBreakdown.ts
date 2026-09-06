import type {
  BreakdownIoType,
  ItemBreakdownChartPoint,
  MethodItemMetricRow,
  RankedBreakdownLine,
} from "./types";

export type BreakdownSeries = {
  key: string;
  label: string;
  priceKey: string;
  volumeKey: string;
  lines: RankedBreakdownLine[];
};

export const OTHER_SERIES_KEY = "other";
export const OTHER_SERIES_LABEL = "Other";
export const CHART_TOP_N = 10;

function metricKey(wikiSlug: string, ioType: BreakdownIoType): string {
  return `${ioType}:${wikiSlug}`;
}

export function buildBreakdownSeries(
  lines: RankedBreakdownLine[],
  topN = CHART_TOP_N,
): BreakdownSeries[] {
  const top = lines.slice(0, topN).map((line) => ({
    key: line.lineKey,
    label: line.itemName,
    priceKey: `${line.lineKey}__price`,
    volumeKey: `${line.lineKey}__volume`,
    lines: [line],
  }));

  const other = lines.slice(topN);
  if (other.length === 0) {
    return top;
  }

  return [
    ...top,
    {
      key: OTHER_SERIES_KEY,
      label: `${OTHER_SERIES_LABEL} (${other.length})`,
      priceKey: `${OTHER_SERIES_KEY}__price`,
      volumeKey: `${OTHER_SERIES_KEY}__volume`,
      lines: other,
    },
  ];
}

function aggregateOtherMetrics(
  periodRows: MethodItemMetricRow[],
  lines: RankedBreakdownLine[],
  kph: number,
): { price: number | null; volume: number | null } {
  const lineKeys = new Set(lines.map((line) => line.lineKey));
  const matched = periodRows.filter((row) => lineKeys.has(metricKey(row.wikiSlug, row.ioType)));

  let volumeSum = 0;
  let hasVolume = false;
  let weightedPriceNumerator = 0;
  let weightedPriceDenominator = 0;

  for (const row of matched) {
    if (row.volume != null) {
      volumeSum += row.volume;
      hasVolume = true;
    }
    if (row.price != null) {
      const qtyPerHour = row.qtyPerCompletion * kph;
      if (qtyPerHour > 0) {
        weightedPriceNumerator += qtyPerHour * row.price;
        weightedPriceDenominator += qtyPerHour;
      }
    }
  }

  return {
    price: weightedPriceDenominator > 0 ? weightedPriceNumerator / weightedPriceDenominator : null,
    volume: hasVolume ? volumeSum : null,
  };
}

export function buildItemBreakdownChartData(
  rows: MethodItemMetricRow[],
  lines: RankedBreakdownLine[],
  kph: number,
  topN = CHART_TOP_N,
): { chartData: ItemBreakdownChartPoint[]; series: BreakdownSeries[] } {
  const series = buildBreakdownSeries(lines, topN);
  const byPeriod = new Map<string, MethodItemMetricRow[]>();

  for (const row of rows) {
    const bucket = byPeriod.get(row.period) ?? [];
    bucket.push(row);
    byPeriod.set(row.period, bucket);
  }

  const chartData: ItemBreakdownChartPoint[] = [...byPeriod.keys()]
    .sort()
    .map((period) => {
      const periodRows = byPeriod.get(period) ?? [];
      const point: ItemBreakdownChartPoint = { period };

      for (const entry of series) {
        if (entry.key === OTHER_SERIES_KEY) {
          const other = aggregateOtherMetrics(periodRows, entry.lines, kph);
          point[entry.priceKey] = other.price;
          point[entry.volumeKey] = other.volume;
          continue;
        }

        const line = entry.lines[0];
        const row = periodRows.find(
          (candidate) =>
            candidate.wikiSlug === line.wikiSlug && candidate.ioType === line.ioType,
        );
        point[entry.priceKey] = row?.price ?? null;
        point[entry.volumeKey] = row?.volume ?? null;
      }

      return point;
    });

  return { chartData, series };
}
