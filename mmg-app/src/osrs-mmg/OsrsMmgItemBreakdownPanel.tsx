import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { axisTick, chartMargin, OSRS_CHART_THEME, tooltipProps } from "./chartTheme";
import {
  fetchMethodIoLines,
  fetchMethodItemMetricDateBounds,
  fetchMethodItemMetrics,
  hasPriceMetricsData,
  type TrendDateRange,
} from "./duckdbQueries";
import { fetchMethodItemMetricsFromGeApi } from "./gePricesApi";
import { buildItemBreakdownChartData, OTHER_SERIES_KEY, type BreakdownSeries } from "./itemBreakdown";
import { calcAtKph, formatGp, formatGpCompact, formatShare, formatUnitCost, listBreakdownLines } from "./mmgCalc";
import { OsrsMmgChartLegend, useChartLegendVisibility, type ChartLegendItem } from "./OsrsMmgChartLegend";
import { comparePeriodKeys, formatPeriodTooltipLabel, periodXAxisProps } from "./periodFormat";
import type { BreakdownIoType, MmgGuide, PeriodGranularity } from "./types";

type Props = {
  methodId: string;
  guide: MmgGuide;
  kph: number;
};

const PERIODS: PeriodGranularity[] = ["day", "week", "month", "quarter", "year"];
const IO_TABS: { id: BreakdownIoType; label: string }[] = [
  { id: "output", label: "Output" },
  { id: "input", label: "Input" },
];

function seriesColor(index: number, seriesKey: string): string {
  if (seriesKey === OTHER_SERIES_KEY) {
    return "#57606a";
  }
  return OSRS_CHART_THEME.colors[index % OSRS_CHART_THEME.colors.length];
}

function formatVolume(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${Math.round(value / 1_000)}k`;
  return String(Math.round(value));
}

function BreakdownTooltip({
  active,
  payload,
  label,
  period,
  formatValue,
}: {
  active?: boolean;
  payload?: { dataKey?: unknown; name?: unknown; value?: unknown; color?: string }[];
  label?: unknown;
  period: PeriodGranularity;
  formatValue: (value: number) => string;
}) {
  if (!active || !payload?.length || label == null) return null;

  const rows = payload
    .map((entry) => {
      const value = typeof entry.value === "number" ? entry.value : Number(entry.value);
      return {
        key: String(entry.dataKey ?? entry.name ?? ""),
        name: String(entry.name ?? ""),
        color: entry.color,
        value,
      };
    })
    .filter((row) => row.key && Number.isFinite(row.value))
    .sort((a, b) => b.value - a.value);

  if (rows.length === 0) return null;

  return (
    <div className="osrs-mmg__chart-tooltip" style={tooltipProps.contentStyle}>
      <p className="osrs-mmg__chart-tooltip-label">
        {formatPeriodTooltipLabel(String(label), period)}
      </p>
      <ul className="osrs-mmg__chart-tooltip-list">
        {rows.map((row) => (
          <li key={row.key} className="osrs-mmg__chart-tooltip-value" style={{ color: row.color }}>
            {row.name}: {formatValue(row.value)}
          </li>
        ))}
      </ul>
    </div>
  );
}

function BreakdownLinesChart({
  title,
  data,
  period,
  series,
  valueKey,
  yTickFormatter,
  formatValue,
  hiddenKeys,
  legendItems,
  onToggle,
  onIsolate,
  onShowAll,
  height,
}: {
  title: string;
  data: ReturnType<typeof buildItemBreakdownChartData>["chartData"];
  period: PeriodGranularity;
  series: BreakdownSeries[];
  valueKey: "priceKey" | "volumeKey";
  yTickFormatter: (value: number) => string;
  formatValue: (value: number) => string;
  hiddenKeys: ReadonlySet<string>;
  legendItems: ChartLegendItem[];
  onToggle: (key: string) => void;
  onIsolate: (key: string) => void;
  onShowAll: () => void;
  height: number;
}) {
  return (
    <div className="osrs-mmg__chart">
      <h4 className="osrs-mmg__chart-title">{title}</h4>
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={data} margin={chartMargin}>
          <CartesianGrid strokeDasharray="3 3" stroke={OSRS_CHART_THEME.grid} />
          <XAxis
            dataKey="period"
            tick={axisTick}
            stroke={OSRS_CHART_THEME.axis}
            {...periodXAxisProps(period)}
          />
          <YAxis
            tick={axisTick}
            stroke={OSRS_CHART_THEME.axis}
            tickFormatter={yTickFormatter}
          />
          <Tooltip
            shared
            cursor={{ stroke: OSRS_CHART_THEME.axis, strokeDasharray: "3 3" }}
            content={({ active, payload, label }) => (
              <BreakdownTooltip
                active={active}
                payload={payload}
                label={label}
                period={period}
                formatValue={formatValue}
              />
            )}
            contentStyle={tooltipProps.contentStyle}
            labelStyle={tooltipProps.labelStyle}
          />
          {series.map((entry, index) => {
            const dataKey = entry[valueKey];
            return (
              <Line
                key={dataKey}
                type="monotone"
                dataKey={dataKey}
                name={entry.label}
                stroke={seriesColor(index, entry.key)}
                connectNulls
                dot={false}
                activeDot={{ r: 4 }}
                hide={hiddenKeys.has(dataKey)}
                legendType="none"
              />
            );
          })}
        </ComposedChart>
      </ResponsiveContainer>
      <OsrsMmgChartLegend
        items={legendItems}
        hiddenKeys={hiddenKeys}
        onToggle={onToggle}
        onIsolate={onIsolate}
        onShowAll={onShowAll}
      />
    </div>
  );
}

export function OsrsMmgItemBreakdownPanel({ methodId, guide, kph }: Props) {
  const [enabled, setEnabled] = useState(true);
  const [ioType, setIoType] = useState<BreakdownIoType>("output");
  const [period, setPeriod] = useState<PeriodGranularity>("week");
  const [showVolume, setShowVolume] = useState(true);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [dateBounds, setDateBounds] = useState<{ min: string; max: string } | null>(null);
  const [rows, setRows] = useState<Awaited<ReturnType<typeof fetchMethodItemMetrics>>>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [usingLiveGe, setUsingLiveGe] = useState(false);
  const priceLegend = useChartLegendVisibility(`${methodId}:${ioType}:price`);
  const volumeLegend = useChartLegendVisibility(`${methodId}:${ioType}:volume`, [
    `${OTHER_SERIES_KEY}__volume`,
  ]);

  const lines = useMemo(
    () => listBreakdownLines(guide, kph, ioType),
    [guide, kph, ioType],
  );

  const sideTotal = useMemo(() => {
    const calc = calcAtKph(guide, kph);
    return ioType === "input" ? calc.inputTotal : calc.outputTotal;
  }, [guide, kph, ioType]);

  const dateRange = useMemo<TrendDateRange | undefined>(() => {
    const from = dateFrom || dateBounds?.min;
    const to = dateTo || dateBounds?.max;
    if (!from || !to || from > to) return undefined;
    if (dateBounds && from === dateBounds.min && to === dateBounds.max) return undefined;
    return { from, to };
  }, [dateFrom, dateTo, dateBounds]);

  useEffect(() => {
    setDateFrom("");
    setDateTo("");
    setDateBounds(null);
  }, [methodId]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setLoadError(null);
      try {
        const bundledPrices = await hasPriceMetricsData();
        if (bundledPrices) {
          const [data, bounds] = await Promise.all([
            fetchMethodItemMetrics(methodId, period, dateRange),
            dateBounds ? Promise.resolve(dateBounds) : fetchMethodItemMetricDateBounds(methodId),
          ]);
          if (!cancelled) {
            setRows(data);
            setUsingLiveGe(false);
            if (bounds) setDateBounds(bounds);
          }
        } else {
          const ioLines = await fetchMethodIoLines(methodId);
          const data = await fetchMethodItemMetricsFromGeApi(ioLines, period, dateRange);
          if (!cancelled) {
            setRows(data);
            setUsingLiveGe(true);
            if (!dateBounds && data.length > 0) {
              const days = [...new Set(data.map((row) => row.period))].sort();
              setDateBounds({ min: days[0], max: days[days.length - 1] });
            }
          }
        }
      } catch (err) {
        if (!cancelled) {
          setRows([]);
          setLoadError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [enabled, methodId, period, dateRange]);

  const { chartData, series } = useMemo(
    () => buildItemBreakdownChartData(rows, lines, kph),
    [rows, lines, kph],
  );

  const sortedChartData = useMemo(
    () => [...chartData].sort((a, b) => comparePeriodKeys(String(a.period), String(b.period))),
    [chartData],
  );

  const priceLegendItems = useMemo<ChartLegendItem[]>(
    () =>
      series.map((entry, index) => ({
        key: entry.priceKey,
        label: entry.label,
        color: seriesColor(index, entry.key),
      })),
    [series],
  );

  const volumeLegendItems = useMemo<ChartLegendItem[]>(
    () =>
      series.map((entry, index) => ({
        key: entry.volumeKey,
        label: entry.label,
        color: seriesColor(index, entry.key),
      })),
    [series],
  );

  const priceLegendKeys = useMemo(
    () => priceLegendItems.map((item) => item.key),
    [priceLegendItems],
  );
  const volumeLegendKeys = useMemo(
    () => volumeLegendItems.map((item) => item.key),
    [volumeLegendItems],
  );

  const hasPriceData = sortedChartData.some((point) =>
    series.some((entry) => {
      const price = point[entry.priceKey];
      return typeof price === "number" && Number.isFinite(price);
    }),
  );
  const hasVolumeData = sortedChartData.some((point) =>
    series.some((entry) => {
      const volume = point[entry.volumeKey];
      return typeof volume === "number" && Number.isFinite(volume);
    }),
  );
  const hasChartData = hasPriceData || hasVolumeData;

  const tabLabel = ioType === "output" ? "output" : "input";

  return (
    <section className="osrs-mmg__panel osrs-mmg__trends osrs-mmg__item-breakdown">
      <div className="osrs-mmg__trends-header">
        <h3>Item breakdown</h3>
        <div className="osrs-mmg__breakdown-toggles">
          <label className="osrs-mmg__volume-toggle">
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
            Show item breakdown
          </label>
          <label className="osrs-mmg__volume-toggle">
            <input
              type="checkbox"
              checked={showVolume}
              onChange={(e) => setShowVolume(e.target.checked)}
            />
            GE volume
          </label>
        </div>
      </div>

      {enabled ? (
        <>
          <div className="osrs-mmg__tabs" role="tablist" aria-label="Item breakdown type">
            {IO_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={tab.id === ioType}
                className={tab.id === ioType ? "osrs-mmg__tab is-active" : "osrs-mmg__tab"}
                onClick={() => setIoType(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <p className="osrs-mmg__muted osrs-mmg__breakdown-intro">
            All {tabLabel} items, sorted by unit cost. Charts plot the top 10 plus Other.
            Hover a date to see every visible line. Click a legend item to hide it; double-click to isolate.
            {usingLiveGe ? (
              <>
                {" "}
                Charts use live GE timeseries (~1 year). Full history back to 2020 is in the Kaggle dataset.
              </>
            ) : null}
          </p>

          {lines.length === 0 ? (
            <p className="osrs-mmg__muted">No {tabLabel} items for this method.</p>
          ) : (
            <div className="osrs-mmg__breakdown-table-scroll">
              <table className="osrs-mmg__table osrs-mmg__table--compact">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Unit cost</th>
                    <th>GP/h</th>
                    <th>%</th>
                    <th>Qty/h</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line) => (
                    <tr key={line.lineKey}>
                      <td>{line.itemName}</td>
                      <td>{formatUnitCost(line)}</td>
                      <td>{formatGp(line.gpPerHour)}</td>
                      <td>{formatShare(line.gpPerHour, sideTotal)}</td>
                      <td>{line.qtyPerHour.toLocaleString("en-GB", { maximumFractionDigits: 2 })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="osrs-mmg__period-row">
            {PERIODS.map((p) => (
              <button
                key={p}
                type="button"
                className={p === period ? "is-active" : ""}
                onClick={() => setPeriod(p)}
              >
                {p}
              </button>
            ))}
            <div className="osrs-mmg__date-range">
              <label className="osrs-mmg__field">
                From
                <input
                  type="date"
                  min={dateBounds?.min}
                  max={dateTo || dateBounds?.max}
                  value={dateFrom || dateBounds?.min || ""}
                  onChange={(e) => setDateFrom(e.target.value)}
                />
              </label>
              <label className="osrs-mmg__field">
                To
                <input
                  type="date"
                  min={dateFrom || dateBounds?.min}
                  max={dateBounds?.max}
                  value={dateTo || dateBounds?.max || ""}
                  onChange={(e) => setDateTo(e.target.value)}
                />
              </label>
            </div>
          </div>

          {loading ? <p className="osrs-mmg__muted">Loading item charts…</p> : null}
          {loadError ? <p className="osrs-mmg__banner osrs-mmg__banner--error">{loadError}</p> : null}

          {!loading && hasChartData ? (
            <div className="osrs-mmg__chart-stack">
              {hasPriceData ? (
                <BreakdownLinesChart
                  title="GE price"
                  data={sortedChartData}
                  period={period}
                  series={series}
                  valueKey="priceKey"
                  yTickFormatter={(value) => formatGpCompact(value)}
                  formatValue={formatGp}
                  hiddenKeys={priceLegend.hiddenKeys}
                  legendItems={priceLegendItems}
                  onToggle={priceLegend.toggle}
                  onIsolate={(key) => priceLegend.isolate(key, priceLegendKeys)}
                  onShowAll={priceLegend.showAll}
                  height={360}
                />
              ) : (
                <p className="osrs-mmg__muted">No GE price history available for these items.</p>
              )}
              {showVolume && hasVolumeData ? (
                <BreakdownLinesChart
                  title="GE volume"
                  data={sortedChartData}
                  period={period}
                  series={series}
                  valueKey="volumeKey"
                  yTickFormatter={formatVolume}
                  formatValue={formatVolume}
                  hiddenKeys={volumeLegend.hiddenKeys}
                  legendItems={volumeLegendItems}
                  onToggle={volumeLegend.toggle}
                  onIsolate={(key) => volumeLegend.isolate(key, volumeLegendKeys)}
                  onShowAll={volumeLegend.showAll}
                  height={300}
                />
              ) : null}
              {showVolume && !hasVolumeData ? (
                <p className="osrs-mmg__muted">No GE volume history available for these items.</p>
              ) : null}
            </div>
          ) : null}

          {!loading && !loadError && !hasChartData ? (
            <p className="osrs-mmg__muted">No GE price history available for these items.</p>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
