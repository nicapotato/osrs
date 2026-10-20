import { familyKey } from "./packTree";
import { difficultyBucket, difficultyRank, isCompletableNode, seriesColor } from "./questFilters";
import type { HeatmapColumnMode, HeatmapMetric, HeatmapSort, QuestGraph, QuestGraphNode } from "./types";

export type HeatmapHit = {
  quest: QuestGraphNode;
  skillId: string;
  skillLabel: string;
  level: number;
  boostable: boolean;
  ironmanOnly: boolean;
};

export type HeatmapCell = {
  skillId: string;
  columnId: string;
  questCount: number;
  maxLevel: number;
  sumLevel: number;
  hits: HeatmapHit[];
};

export type HeatmapColumn = {
  id: string;
  label: string;
  mode: HeatmapColumnMode;
  color: string;
  questCount: number;
  skillQuestCount: number;
  levelSum: number;
  maxLevel: number;
  maxDifficultyRank: number;
};

export type HeatmapRow = {
  skillId: string;
  skillLabel: string;
  skillKey: string;
  questCount: number;
  levelSum: number;
  maxLevel: number;
};

export type SkillHeatmap = {
  rows: HeatmapRow[];
  columns: HeatmapColumn[];
  cells: Map<string, HeatmapCell>;
  totals: { questCount: number; skillQuestCount: number; levelSum: number; maxLevel: number };
};

const EMPTY_CELL: Omit<HeatmapCell, "skillId" | "columnId"> = {
  questCount: 0,
  maxLevel: 0,
  sumLevel: 0,
  hits: [],
};

function cellKey(skillId: string, columnId: string): string {
  return `${skillId}::${columnId}`;
}

export function heatmapColumnId(node: QuestGraphNode, mode: HeatmapColumnMode): string {
  if (!isCompletableNode(node)) {
    throw new Error(`quest heatmap: expected completable node ${node.id}`);
  }
  if (mode === "series") return `series:${familyKey(node)}`;
  if (mode === "difficulty") return `difficulty:${difficultyBucket(node.difficulty)}`;
  throw new Error(`quest heatmap: unknown column mode ${mode}`);
}

export function heatmapColumnLabel(columnId: string, mode: HeatmapColumnMode): string {
  const prefix = mode === "series" ? "series:" : "difficulty:";
  if (!columnId.startsWith(prefix)) {
    throw new Error(`quest heatmap: column ${columnId} does not match mode ${mode}`);
  }
  return columnId.slice(prefix.length);
}

export function heatmapCellValue(cell: HeatmapCell | null, metric: HeatmapMetric): number {
  if (!cell) return 0;
  if (metric === "quests") return cell.questCount;
  if (metric === "maxLevel") return cell.maxLevel;
  if (metric === "sumLevel") return cell.sumLevel;
  throw new Error(`quest heatmap: unknown metric ${metric}`);
}

export function heatmapMetricLabel(metric: HeatmapMetric): string {
  if (metric === "quests") return "quests";
  if (metric === "maxLevel") return "max level";
  if (metric === "sumLevel") return "level sum";
  throw new Error(`quest heatmap: unknown metric ${metric}`);
}

export function formatHeatmapValue(value: number, metric: HeatmapMetric): string {
  if (value <= 0) return "";
  if (metric === "maxLevel") return String(value);
  return String(value);
}

function columnColor(label: string, mode: HeatmapColumnMode): string {
  if (mode === "difficulty") {
    if (label === "Unrated") return "#8a7048";
    const fillByName: Record<string, string> = {
      Novice: "#b7d59a",
      Intermediate: "#ead56a",
      Experienced: "#e0a24a",
      Master: "#d46a5a",
      Grandmaster: "#9b6bb8",
      Special: "#d4c4a8",
    };
    const fill = fillByName[label];
    if (!fill) throw new Error(`quest heatmap: no color for difficulty ${label}`);
    return fill;
  }
  if (label === "Standalone" || label === "Miniquests" || label === "Diaries" || label === "Other") {
    return "#8a7048";
  }
  return seriesColor(label);
}

function compareName(left: string, right: string): number {
  return left.localeCompare(right);
}

export function sortHeatmap(
  matrix: SkillHeatmap,
  columnSort: HeatmapSort,
  rowSort: HeatmapSort,
): SkillHeatmap {
  const columns = matrix.columns.slice().sort((left, right) => {
    if (columnSort === "name") return compareName(left.label, right.label);
    if (columnSort === "quests") {
      const byQuests = right.skillQuestCount - left.skillQuestCount;
      return byQuests !== 0 ? byQuests : compareName(left.label, right.label);
    }
    if (columnSort === "levelSum") {
      const bySum = right.levelSum - left.levelSum;
      return bySum !== 0 ? bySum : compareName(left.label, right.label);
    }
    if (columnSort === "difficulty") {
      const byRank = left.maxDifficultyRank - right.maxDifficultyRank;
      return byRank !== 0 ? byRank : compareName(left.label, right.label);
    }
    throw new Error(`quest heatmap: unknown column sort ${columnSort}`);
  });

  const rows = matrix.rows.slice().sort((left, right) => {
    if (rowSort === "name") return compareName(left.skillLabel, right.skillLabel);
    if (rowSort === "quests") {
      const byQuests = right.questCount - left.questCount;
      return byQuests !== 0 ? byQuests : compareName(left.skillLabel, right.skillLabel);
    }
    if (rowSort === "levelSum" || rowSort === "difficulty") {
      const bySum = right.levelSum - left.levelSum;
      return bySum !== 0 ? bySum : compareName(left.skillLabel, right.skillLabel);
    }
    throw new Error(`quest heatmap: unknown row sort ${rowSort}`);
  });

  return { ...matrix, rows, columns };
}

export function buildSkillHeatmap(
  graph: QuestGraph,
  visibleQuestIds: Set<string>,
  mode: HeatmapColumnMode,
): SkillHeatmap {
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  const visible = graph.nodes.filter((node) => isCompletableNode(node) && visibleQuestIds.has(node.id));
  if (visible.length === 0) {
    throw new Error("quest heatmap: no visible quests");
  }

  const columns = new Map<string, HeatmapColumn>();
  const questsByColumn = new Map<string, Set<string>>();
  for (const node of visible) {
    const id = heatmapColumnId(node, mode);
    const label = heatmapColumnLabel(id, mode);
    const existing = columns.get(id);
    if (!existing) {
      columns.set(id, {
        id,
        label,
        mode,
        color: columnColor(label, mode),
        questCount: 0,
        skillQuestCount: 0,
        levelSum: 0,
        maxLevel: 0,
        maxDifficultyRank: difficultyRank(node.difficulty),
      });
    }
    const column = columns.get(id);
    if (!column) throw new Error(`quest heatmap: missing column ${id}`);
    column.questCount += 1;
    column.maxDifficultyRank = Math.max(column.maxDifficultyRank, difficultyRank(node.difficulty));
    const bucket = questsByColumn.get(id) ?? new Set<string>();
    bucket.add(node.id);
    questsByColumn.set(id, bucket);
  }

  const skills = graph.nodes.filter((node) => node.category === "skill");
  if (skills.length === 0) throw new Error("quest heatmap: graph has no skill nodes");

  const grouped = new Map<string, { from: QuestGraphNode; to: QuestGraphNode; edges: typeof graph.edges }>();
  for (const edge of graph.edges) {
    if (edge.relationship_type !== "requires_skill") continue;
    const from = nodesById.get(edge.from_node_id);
    const to = nodesById.get(edge.to_node_id);
    if (!from) throw new Error(`quest heatmap: missing source ${edge.from_node_id}`);
    if (!to) throw new Error(`quest heatmap: missing target ${edge.to_node_id}`);
    if (from.category !== "skill") continue;
    if (!isCompletableNode(to) || !visibleQuestIds.has(to.id)) continue;
    if (typeof edge.level !== "number") {
      throw new Error(`quest heatmap: skill edge ${edge.id} missing level`);
    }
    if (!from.skill_key) throw new Error(`quest heatmap: skill ${from.id} missing skill_key`);
    const key = `${from.id}->${to.id}`;
    const bucket = grouped.get(key);
    if (bucket) {
      bucket.edges.push(edge);
      continue;
    }
    grouped.set(key, { from, to, edges: [edge] });
  }

  const rowsById = new Map<string, HeatmapRow>();
  const cells = new Map<string, HeatmapCell>();
  const questsWithSkill = new Set<string>();
  const countedQuestSkill = new Set<string>();

  for (const { from, to, edges } of grouped.values()) {
    const mains = edges.filter((edge) => edge.ironman_only !== true);
    const chosen = mains.length > 0 ? mains : edges;
    const columnId = heatmapColumnId(to, mode);
    const column = columns.get(columnId);
    if (!column) throw new Error(`quest heatmap: no column for ${to.id}`);
    if (!from.skill_key) throw new Error(`quest heatmap: skill ${from.id} missing skill_key`);

    let row = rowsById.get(from.id);
    if (!row) {
      row = {
        skillId: from.id,
        skillLabel: from.label,
        skillKey: from.skill_key,
        questCount: 0,
        levelSum: 0,
        maxLevel: 0,
      };
      rowsById.set(from.id, row);
    }

    const mapKey = cellKey(from.id, columnId);
    const cell = cells.get(mapKey) ?? {
      skillId: from.id,
      columnId,
      ...EMPTY_CELL,
      hits: [],
    };

    let addedLevels = 0;
    let addedMax = 0;
    for (const edge of chosen) {
      if (typeof edge.level !== "number") {
        throw new Error(`quest heatmap: skill edge ${edge.id} missing level`);
      }
      cell.hits.push({
        quest: to,
        skillId: from.id,
        skillLabel: from.label,
        level: edge.level,
        boostable: edge.boostable === true,
        ironmanOnly: edge.ironman_only === true,
      });
      addedLevels += edge.level;
      addedMax = Math.max(addedMax, edge.level);
    }

    const questSkillKey = `${from.id}->${to.id}`;
    if (!countedQuestSkill.has(questSkillKey)) {
      countedQuestSkill.add(questSkillKey);
      cell.questCount += 1;
      row.questCount += 1;
    }
    cell.maxLevel = Math.max(cell.maxLevel, addedMax);
    cell.sumLevel += addedLevels;
    cells.set(mapKey, cell);

    row.levelSum += addedLevels;
    row.maxLevel = Math.max(row.maxLevel, addedMax);

    column.levelSum += addedLevels;
    column.maxLevel = Math.max(column.maxLevel, addedMax);
    questsWithSkill.add(to.id);
  }

  for (const column of columns.values()) {
    const members = questsByColumn.get(column.id);
    if (!members) throw new Error(`quest heatmap: column ${column.id} has no members`);
    let skillQuestCount = 0;
    for (const questId of members) {
      if (questsWithSkill.has(questId)) skillQuestCount += 1;
    }
    column.skillQuestCount = skillQuestCount;
  }

  const rows = [...rowsById.values()];
  if (rows.length === 0) {
    return {
      rows: [],
      columns: [...columns.values()],
      cells,
      totals: { questCount: visible.length, skillQuestCount: 0, levelSum: 0, maxLevel: 0 },
    };
  }

  return {
    rows,
    columns: [...columns.values()],
    cells,
    totals: {
      questCount: visible.length,
      skillQuestCount: questsWithSkill.size,
      levelSum: [...columns.values()].reduce((sum, column) => sum + column.levelSum, 0),
      maxLevel: [...columns.values()].reduce((max, column) => Math.max(max, column.maxLevel), 0),
    },
  };
}

export function heatmapCellAt(matrix: SkillHeatmap, skillId: string, columnId: string): HeatmapCell | null {
  return matrix.cells.get(cellKey(skillId, columnId)) ?? null;
}

export function hitsForSelection(
  matrix: SkillHeatmap,
  selection: { kind: "cell"; skillId: string; columnId: string } | { kind: "row"; skillId: string } | { kind: "column"; columnId: string },
): HeatmapHit[] {
  if (selection.kind === "cell") {
    return heatmapCellAt(matrix, selection.skillId, selection.columnId)?.hits ?? [];
  }
  if (selection.kind === "row") {
    const hits: HeatmapHit[] = [];
    for (const column of matrix.columns) {
      const cell = heatmapCellAt(matrix, selection.skillId, column.id);
      if (cell) hits.push(...cell.hits);
    }
    return hits;
  }
  const hits: HeatmapHit[] = [];
  for (const row of matrix.rows) {
    const cell = heatmapCellAt(matrix, row.skillId, selection.columnId);
    if (cell) hits.push(...cell.hits);
  }
  return hits;
}
