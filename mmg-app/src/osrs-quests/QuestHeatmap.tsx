import { useEffect, useMemo, useState } from "react";
import { interpolateRgb } from "d3";

import { skillIconUrl } from "../osrs-mmg/skillIconUrl";
import { seriesIconUrl } from "./questFilters";
import {
  buildSkillHeatmap,
  formatHeatmapValue,
  heatmapCellAt,
  heatmapCellValue,
  heatmapMetricLabel,
  hitsForSelection,
  sortHeatmap,
  type HeatmapHit,
  type SkillHeatmap,
} from "./skillHeatmap";
import type { HeatmapColumnMode, HeatmapMetric, HeatmapSort, QuestGraph, QuestGraphNode, QuestPlayerStatus } from "./types";

const CELL_FILL = interpolateRgb("#f4ead0", "#3f5a28");
const EMPTY_FILL = "rgba(244, 234, 208, 0.28)";

type Selection =
  | { kind: "cell"; skillId: string; columnId: string }
  | { kind: "row"; skillId: string }
  | { kind: "column"; columnId: string };

type QuestLine = {
  quest: QuestGraphNode;
  levels: { skillLabel: string; level: number; boostable: boolean; ironmanOnly: boolean }[];
};

type Props = {
  graph: QuestGraph;
  visibleQuestIds: Set<string>;
  statusById: Record<string, QuestPlayerStatus>;
  columnMode: HeatmapColumnMode;
  metric: HeatmapMetric;
  columnSort: HeatmapSort;
  rowSort: HeatmapSort;
  onNodeMenu: (nodeId: string, point: { clientX: number; clientY: number }) => void;
  onNodeFocus: (nodeId: string) => void;
};

function statusClass(status: QuestPlayerStatus): string {
  if (status === "done") return "osrs-quest__dot--done";
  if (status === "ready") return "osrs-quest__dot--ready";
  if (status === "locked") return "osrs-quest__dot--locked";
  return "";
}

function cellColor(value: number, max: number): { fill: string; ink: string } {
  if (value <= 0 || max <= 0) return { fill: EMPTY_FILL, ink: "#5c4a32" };
  const t = value / max;
  const fill = CELL_FILL(t);
  return { fill, ink: t > 0.55 ? "#f4ead0" : "#1a1208" };
}

function questLinesFromHits(hits: HeatmapHit[]): QuestLine[] {
  const byId = new Map<string, QuestLine>();
  for (const hit of hits) {
    const existing = byId.get(hit.quest.id);
    if (!existing) {
      byId.set(hit.quest.id, {
        quest: hit.quest,
        levels: [
          {
            skillLabel: hit.skillLabel,
            level: hit.level,
            boostable: hit.boostable,
            ironmanOnly: hit.ironmanOnly,
          },
        ],
      });
      continue;
    }
    existing.levels.push({
      skillLabel: hit.skillLabel,
      level: hit.level,
      boostable: hit.boostable,
      ironmanOnly: hit.ironmanOnly,
    });
  }
  return [...byId.values()].sort((left, right) => {
    const leftMax = Math.max(...left.levels.map((item) => item.level));
    const rightMax = Math.max(...right.levels.map((item) => item.level));
    if (rightMax !== leftMax) return rightMax - leftMax;
    return left.quest.label.localeCompare(right.quest.label);
  });
}

function selectionEquals(left: Selection | null, right: Selection): boolean {
  if (!left || left.kind !== right.kind) return false;
  if (left.kind === "cell" && right.kind === "cell") {
    return left.skillId === right.skillId && left.columnId === right.columnId;
  }
  if (left.kind === "row" && right.kind === "row") return left.skillId === right.skillId;
  if (left.kind === "column" && right.kind === "column") return left.columnId === right.columnId;
  return false;
}

function selectionTitle(matrix: SkillHeatmap, selection: Selection): string {
  if (selection.kind === "row") {
    const row = matrix.rows.find((item) => item.skillId === selection.skillId);
    if (!row) throw new Error(`quest heatmap: missing row ${selection.skillId}`);
    return `${row.skillLabel} · all storylines`;
  }
  if (selection.kind === "column") {
    const column = matrix.columns.find((item) => item.id === selection.columnId);
    if (!column) throw new Error(`quest heatmap: missing column ${selection.columnId}`);
    return `${column.label} · all skills`;
  }
  const row = matrix.rows.find((item) => item.skillId === selection.skillId);
  const column = matrix.columns.find((item) => item.id === selection.columnId);
  if (!row) throw new Error(`quest heatmap: missing row ${selection.skillId}`);
  if (!column) throw new Error(`quest heatmap: missing column ${selection.columnId}`);
  return `${row.skillLabel} × ${column.label}`;
}

function metricCaption(matrix: SkillHeatmap, selection: Selection, metric: HeatmapMetric): string {
  if (selection.kind === "row") {
    const row = matrix.rows.find((item) => item.skillId === selection.skillId);
    if (!row) throw new Error(`quest heatmap: missing row ${selection.skillId}`);
    if (metric === "quests") return `${row.questCount} quest${row.questCount === 1 ? "" : "s"}`;
    if (metric === "maxLevel") return `max ${row.maxLevel}`;
    return `sum ${row.levelSum}`;
  }
  if (selection.kind === "column") {
    const column = matrix.columns.find((item) => item.id === selection.columnId);
    if (!column) throw new Error(`quest heatmap: missing column ${selection.columnId}`);
    if (metric === "quests") return `${column.skillQuestCount} quest${column.skillQuestCount === 1 ? "" : "s"}`;
    if (metric === "maxLevel") return `max ${column.maxLevel}`;
    return `sum ${column.levelSum}`;
  }
  const cell = heatmapCellAt(matrix, selection.skillId, selection.columnId);
  const value = heatmapCellValue(cell, metric);
  if (!cell || value <= 0) return `no ${heatmapMetricLabel(metric)}`;
  if (metric === "quests") return `${value} quest${value === 1 ? "" : "s"}`;
  if (metric === "maxLevel") return `max ${value}`;
  return `sum ${value}`;
}

function columnHeaderIcon(columnLabel: string, mode: HeatmapColumnMode): string | null {
  if (mode !== "series") return null;
  return seriesIconUrl(columnLabel);
}

export function QuestHeatmap({
  graph,
  visibleQuestIds,
  statusById,
  columnMode,
  metric,
  columnSort,
  rowSort,
  onNodeMenu,
  onNodeFocus,
}: Props) {
  const raw = useMemo(
    () => buildSkillHeatmap(graph, visibleQuestIds, columnMode),
    [columnMode, graph, visibleQuestIds],
  );
  const matrix = useMemo(() => sortHeatmap(raw, columnSort, rowSort), [columnSort, raw, rowSort]);
  const [selection, setSelection] = useState<Selection | null>(null);

  useEffect(() => {
    setSelection(null);
  }, [columnMode, visibleQuestIds]);

  const maxValue = useMemo(() => {
    let max = 0;
    for (const row of matrix.rows) {
      for (const column of matrix.columns) {
        max = Math.max(max, heatmapCellValue(heatmapCellAt(matrix, row.skillId, column.id), metric));
      }
    }
    return max;
  }, [matrix, metric]);

  const lines = useMemo(
    () => (selection ? questLinesFromHits(hitsForSelection(matrix, selection)) : []),
    [matrix, selection],
  );

  function toggle(next: Selection) {
    setSelection((prev) => (selectionEquals(prev, next) ? null : next));
  }

  if (matrix.rows.length === 0) {
    return (
      <p className="osrs-quest__empty">
        No skill requirements in the current filters. Relax type, members, series, or difficulty.
      </p>
    );
  }

  return (
    <div className="osrs-quest__heatmap">
      <div className="osrs-quest__heatmap-scroll">
        <table className="osrs-quest__heatmap-table">
          <thead>
            <tr>
              <th className="osrs-quest__heatmap-corner">Skill</th>
              {matrix.columns.map((column) => {
                const icon = columnHeaderIcon(column.label, column.mode);
                const selected = selection?.kind === "column" && selection.columnId === column.id;
                return (
                  <th key={column.id} className={selected ? "osrs-quest__heatmap-head--on" : undefined}>
                    <button
                      type="button"
                      className="osrs-quest__heatmap-colbtn"
                      onClick={() => toggle({ kind: "column", columnId: column.id })}
                      title={`${column.label}: ${column.skillQuestCount} quests with skill reqs, level sum ${column.levelSum}`}
                    >
                      <span className="osrs-quest__heatmap-colbtn-inner">
                        {icon ? <img src={icon} alt="" width={14} height={14} /> : null}
                        <span
                          className="osrs-quest__heatmap-colswatch"
                          style={{ background: column.color }}
                          aria-hidden
                        />
                        {column.label}
                      </span>
                    </button>
                  </th>
                );
              })}
              <th className="osrs-quest__heatmap-total">Σ</th>
            </tr>
          </thead>
          <tbody>
            {matrix.rows.map((row) => {
              const rowSelected = selection?.kind === "row" && selection.skillId === row.skillId;
              const rowValue =
                metric === "quests" ? row.questCount : metric === "maxLevel" ? row.maxLevel : row.levelSum;
              return (
                <tr key={row.skillId}>
                  <th className={rowSelected ? "osrs-quest__heatmap-row--on" : undefined} scope="row">
                    <button
                      type="button"
                      className="osrs-quest__heatmap-rowbtn"
                      onClick={() => toggle({ kind: "row", skillId: row.skillId })}
                      title={`${row.skillLabel}: ${row.questCount} quests, level sum ${row.levelSum}`}
                    >
                      <img src={skillIconUrl(row.skillKey)} alt="" width={16} height={16} />
                      {row.skillLabel}
                    </button>
                  </th>
                  {matrix.columns.map((column) => {
                    const cell = heatmapCellAt(matrix, row.skillId, column.id);
                    const value = heatmapCellValue(cell, metric);
                    const { fill, ink } = cellColor(value, maxValue);
                    const selected =
                      selection?.kind === "cell" &&
                      selection.skillId === row.skillId &&
                      selection.columnId === column.id;
                    const label = formatHeatmapValue(value, metric);
                    return (
                      <td key={column.id}>
                        <button
                          type="button"
                          className={`osrs-quest__heatmap-cell${selected ? " osrs-quest__heatmap-cell--on" : ""}`}
                          style={{ background: fill, color: ink }}
                          onClick={() =>
                            toggle({ kind: "cell", skillId: row.skillId, columnId: column.id })
                          }
                          aria-label={`${row.skillLabel} × ${column.label}: ${value || 0} ${heatmapMetricLabel(metric)}`}
                          title={`${row.skillLabel} × ${column.label}: ${value || 0} ${heatmapMetricLabel(metric)}`}
                        >
                          {label}
                        </button>
                      </td>
                    );
                  })}
                  <td className="osrs-quest__heatmap-total">{rowValue || ""}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">Σ</th>
              {matrix.columns.map((column) => {
                const value =
                  metric === "quests"
                    ? column.skillQuestCount
                    : metric === "maxLevel"
                      ? column.maxLevel
                      : column.levelSum;
                return (
                  <td key={column.id} className="osrs-quest__heatmap-total">
                    {value || ""}
                  </td>
                );
              })}
              <td className="osrs-quest__heatmap-total">
                {metric === "quests"
                  ? matrix.totals.skillQuestCount
                  : metric === "maxLevel"
                    ? matrix.totals.maxLevel
                    : matrix.totals.levelSum}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
      <aside className="osrs-quest__heatmap-panel" aria-label="Matching quests">
        {selection ? (
          <>
            <p className="osrs-quest__heatmap-panel-title">{selectionTitle(matrix, selection)}</p>
            <p className="osrs-quest__heatmap-panel-meta">{metricCaption(matrix, selection, metric)}</p>
            {lines.length === 0 ? (
              <p className="osrs-quest__empty">No quests in this cell.</p>
            ) : (
              <ul className="osrs-quest__heatmap-list">
                {lines.map((line) => {
                  const status = statusById[line.quest.id] ?? "unknown";
                  const levelText = line.levels
                    .map((item) => {
                      const tags = `${item.boostable ? "*" : ""}${item.ironmanOnly ? " IM" : ""}`;
                      return `${item.skillLabel} ${item.level}${tags}`;
                    })
                    .join(", ");
                  return (
                    <li key={line.quest.id}>
                      <button
                        type="button"
                        className="osrs-quest__list-btn"
                        onClick={() => onNodeFocus(line.quest.id)}
                        onContextMenu={(event) => {
                          event.preventDefault();
                          onNodeMenu(line.quest.id, { clientX: event.clientX, clientY: event.clientY });
                        }}
                        onDoubleClick={() => onNodeFocus(line.quest.id)}
                      >
                        <span className={`osrs-quest__dot ${statusClass(status)}`} />
                        <span>
                          <span className="osrs-quest__heatmap-quest">{line.quest.label}</span>
                          <span className="osrs-quest__heatmap-quest-meta">
                            {[line.quest.difficulty, line.quest.series, levelText].filter(Boolean).join(" · ")}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        ) : (
          <p className="osrs-quest__heatmap-panel-hint">
            Click a cell to list the quests behind that skill × {columnMode === "series" ? "storyline" : "difficulty"}.
            Click a skill or column header for the whole row or column. Click a name to open its neighborhood.
          </p>
        )}
      </aside>
    </div>
  );
}
