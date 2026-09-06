import { useEffect, useMemo, useState } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { axisTick, chartMargin, legendProps, OSRS_CHART_THEME, tooltipProps } from "./chartTheme";
import { fetchTopNComparison, fetchTrendSeries } from "./duckdbQueries";
import { formatGp } from "./mmgCalc";
import { comparePeriodKeys, formatPeriodTooltipLabel, periodXAxisProps, toIsoDate } from "./periodFormat";
import { formatWikiPlainText } from "./wikiText";
import type { MethodRankRow, PeriodGranularity, TrendPoint } from "./types";

type Props = {
  mode: "single" | "topN";
  methodId?: string;
  methodName?: string;
  topMethods?: MethodRankRow[];
  topN?: number;
};

const PERIODS: PeriodGranularity[] = ["day", "week", "month", "quarter", "year"];
const EMPTY_TOP_METHODS: MethodRankRow[] = [];

function SingleTrendTooltip({
  active,
  payload,
  label,
  period,
}: {
  active?: boolean;
  payload?: { payload?: Record<string, unknown> }[];
  label?: unknown;
  period: PeriodGranularity;
}) {
  if (!active || !payload?.length || label == null) return null;
  const point = payload[0]?.payload;
  if (!point) return null;

  const median = Number(point.median_profit);
  const p25 = Number(point.p25);
  const p75 = Number(point.p75);

  return (
    <div className="osrs-mmg__chart-tooltip" style={tooltipProps.contentStyle}>
      <p className="osrs-mmg__chart-tooltip-label">
        {formatPeriodTooltipLabel(String(label), period)}
      </p>
      <ul className="osrs-mmg__chart-tooltip-list">
        {Number.isFinite(median) ? (
          <li className="osrs-mmg__chart-tooltip-value">Median: {formatGp(median)}</li>
        ) : null}
        {Number.isFinite(p25) ? (
          <li className="osrs-mmg__chart-tooltip-value">25th: {formatGp(p25)}</li>
        ) : null}
        {Number.isFinite(p75) ? (
          <li className="osrs-mmg__chart-tooltip-value">75th: {formatGp(p75)}</li>
        ) : null}
      </ul>
    </div>
  );
}

export function OsrsMmgTrendsPanel({
  mode,
  methodId,
  methodName,
  topMethods = EMPTY_TOP_METHODS,
  topN = 10,
}: Props) {
  const [period, setPeriod] = useState<PeriodGranularity>("week");
  const [series, setSeries] = useState<TrendPoint[]>([]);
  const [comparison, setComparison] = useState<
    { method_id: string; method_name: string; period: string; profit: number }[]
  >([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        if (mode === "single" && methodId) {
          const data = await fetchTrendSeries(methodId, period);
          if (!cancelled) setSeries(data);
        } else if (mode === "topN") {
          const ids = topMethods.slice(0, topN).map((m) => m.method_id);
          const data = await fetchTopNComparison(ids, period);
          if (!cancelled) setComparison(data);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [mode, methodId, period, topN, mode === "topN" ? topMethods : null]);

  const chartSeries = useMemo(
    () =>
      series.map((row) => ({
        ...row,
        period: toIsoDate(row.period),
        bandBase: row.p25,
        bandSpan: Math.max(0, row.p75 - row.p25),
      })),
    [series],
  );

  const comparisonChartData = useMemo(() => {
    const byPeriod = new Map<string, Record<string, number | string>>();
    for (const row of comparison) {
      const key = toIsoDate(row.period);
      const entry = byPeriod.get(key) ?? { period: key };
      entry[row.method_name] = row.profit;
      byPeriod.set(key, entry);
    }
    return [...byPeriod.values()].sort((a, b) => comparePeriodKeys(String(a.period), String(b.period)));
  }, [comparison]);

  const methodNames = useMemo(
    () => [...new Set(comparison.map((r) => r.method_name))],
    [comparison],
  );

  return (
    <section className="osrs-mmg__panel osrs-mmg__trends">
      <div className="osrs-mmg__trends-header">
        <h3>
          {mode === "single" ? `Trends · ${formatWikiPlainText(methodName ?? "Method")}` : "Top methods over time"}
        </h3>
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
        </div>
      </div>

      {loading ? <p className="osrs-mmg__muted">Loading chart…</p> : null}

      {mode === "single" && chartSeries.length > 0 ? (
        <div className="osrs-mmg__chart">
          <ResponsiveContainer width="100%" height={340}>
            <ComposedChart data={chartSeries} margin={chartMargin}>
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
                tickFormatter={(v) => `${Math.round(v / 1000)}k`}
              />
              <Tooltip
                shared
                cursor={{ stroke: OSRS_CHART_THEME.axis, strokeDasharray: "3 3" }}
                content={({ active, payload, label }) => (
                  <SingleTrendTooltip
                    active={active}
                    payload={payload}
                    label={label}
                    period={period}
                  />
                )}
                contentStyle={tooltipProps.contentStyle}
                labelStyle={tooltipProps.labelStyle}
              />
              <Legend {...legendProps} />
              <Area
                type="monotone"
                dataKey="bandBase"
                stackId="percentile"
                stroke="none"
                fill="transparent"
                legendType="none"
                tooltipType="none"
                isAnimationActive={false}
              />
              <Area
                type="monotone"
                dataKey="bandSpan"
                stackId="percentile"
                stroke="none"
                fill={OSRS_CHART_THEME.percentileBand}
                name="p25–p75"
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="median_profit"
                stroke={OSRS_CHART_THEME.medianLine}
                strokeWidth={2}
                dot={false}
                name="Median GP/h"
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      ) : null}

      {mode === "topN" && comparisonChartData.length > 0 ? (
        <div className="osrs-mmg__chart">
          <ResponsiveContainer width="100%" height={340}>
            <ComposedChart data={comparisonChartData} margin={chartMargin}>
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
                tickFormatter={(v) => `${Math.round(v / 1000)}k`}
              />
              <Tooltip
                formatter={(v: number) => formatGp(v)}
                labelFormatter={(label) => formatPeriodTooltipLabel(String(label), period)}
                {...tooltipProps}
              />
              {methodNames.map((name, i) => (
                <Line
                  key={name}
                  type="monotone"
                  dataKey={name}
                  stroke={OSRS_CHART_THEME.colors[i % OSRS_CHART_THEME.colors.length]}
                  legendType="none"
                />
              ))}
            </ComposedChart>
          </ResponsiveContainer>
          <div className="osrs-mmg__chart-legend-wrap">
            <ul className="osrs-mmg__chart-legend">
              {methodNames.map((name, i) => (
                <li key={name}>
                  <span className="osrs-mmg__chart-legend-item">
                    <span
                      className="osrs-mmg__chart-legend-swatch"
                      style={{
                        background: OSRS_CHART_THEME.colors[i % OSRS_CHART_THEME.colors.length],
                      }}
                    />
                    {name}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      {!loading && mode === "single" && series.length === 0 ? (
        <p className="osrs-mmg__muted">No snapshot history yet for this method.</p>
      ) : null}
      {!loading && mode === "topN" && comparisonChartData.length === 0 ? (
        <p className="osrs-mmg__muted">Re-rank the table to pick top methods, or wait for more daily snapshots.</p>
      ) : null}
    </section>
  );
}
