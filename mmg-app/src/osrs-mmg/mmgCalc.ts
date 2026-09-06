import type { IoLine, IoLineAtKph, MmgCalcResult, MmgGuide, RankedBreakdownLine } from "./types";

function scaleLine(line: IoLine, kph: number): IoLineAtKph {
  return {
    ...line,
    qtyPerHour: line.qtyPerCompletion * kph,
    gpPerHour: line.gpPerCompletion * kph,
  };
}

export function calcAtKph(guide: MmgGuide, kph: number): MmgCalcResult {
  const inputTotal = guide.inputTotalPk * kph + guide.inputTotalPh;
  const outputTotal = guide.outputTotalPk * kph + guide.outputTotalPh;
  return {
    kph,
    inputs: guide.inputs.map((line) => scaleLine(line, kph)),
    outputs: guide.outputs.map((line) => scaleLine(line, kph)),
    inputTotal,
    outputTotal,
    profit: outputTotal - inputTotal,
    margin: marginRatio(outputTotal, inputTotal),
  };
}

export function marginRatio(outputHourly: number, inputHourly: number): number | null {
  if (!Number.isFinite(outputHourly) || !Number.isFinite(inputHourly) || inputHourly <= 0) {
    return null;
  }
  const value = outputHourly / inputHourly;
  return Number.isFinite(value) ? value : null;
}

export function formatMargin(value: number | null): string {
  if (value == null) return "—";
  return `${value.toLocaleString("en-GB", { maximumFractionDigits: 2, minimumFractionDigits: 2 })}×`;
}

export function marginTone(value: number | null): "good" | "near" | "bad" | "empty" {
  if (value == null) return "empty";
  if (value > 1.05) return "good";
  if (value < 0.95) return "bad";
  return "near";
}

export function formatGp(value: number): string {
  const rounded = Math.round(value);
  return `${rounded.toLocaleString("en-GB")} gp`;
}

export function formatGpCompact(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${Math.round(value / 1_000)}k`;
  return String(Math.round(value));
}

export function formatQty(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 100) return Math.round(value).toLocaleString("en-GB");
  if (abs >= 1) return value.toFixed(2);
  if (abs >= 0.01) return value.toFixed(4);
  return value.toPrecision(3);
}

export function unitCostGp(line: Pick<IoLine, "qtyPerCompletion" | "gpPerCompletion">): number | null {
  if (!Number.isFinite(line.qtyPerCompletion) || line.qtyPerCompletion === 0) return null;
  const value = line.gpPerCompletion / line.qtyPerCompletion;
  return Number.isFinite(value) ? value : null;
}

export function formatUnitCost(line: Pick<IoLine, "qtyPerCompletion" | "gpPerCompletion">): string {
  const value = unitCostGp(line);
  return value == null ? "—" : formatGp(value);
}

export function formatShare(part: number, total: number): string {
  if (!Number.isFinite(part) || !Number.isFinite(total) || total === 0) return "—";
  const pct = (part / total) * 100;
  if (!Number.isFinite(pct)) return "—";
  return `${pct.toLocaleString("en-GB", { maximumFractionDigits: 1, minimumFractionDigits: 1 })}%`;
}

function toRankedLine(line: IoLineAtKph, ioType: RankedBreakdownLine["ioType"]): RankedBreakdownLine {
  return {
    ...line,
    ioType,
    lineKey: `${ioType}:${line.wikiSlug}`,
  };
}

export function listBreakdownLines(
  guide: MmgGuide,
  kph: number,
  ioType: RankedBreakdownLine["ioType"],
): RankedBreakdownLine[] {
  const calc = calcAtKph(guide, kph);
  const lines = ioType === "input" ? calc.inputs : calc.outputs;
  return [...lines]
    .map((line) => toRankedLine(line, ioType))
    .sort((a, b) => {
      const aCost = unitCostGp(a);
      const bCost = unitCostGp(b);
      if (aCost == null && bCost == null) return 0;
      if (aCost == null) return 1;
      if (bCost == null) return -1;
      return bCost - aCost;
    });
}
