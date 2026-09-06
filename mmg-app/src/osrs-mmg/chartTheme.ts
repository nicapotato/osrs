export const OSRS_CHART_THEME = {
  grid: "#d0d7de",
  axis: "#57606a",
  legendText: "#1f2328",
  percentileBand: "rgba(207, 34, 46, 0.28)",
  medianLine: "#0d1117",
  volumeLine: "#bf8700",
  tooltip: {
    background: "#ffffff",
    border: "#d0d7de",
    text: "#1f2328",
  },
  colors: [
    "#0969da",
    "#8250df",
    "#1a7f37",
    "#cf222e",
    "#bf8700",
    "#57606a",
    "#0550ae",
    "#a40e26",
    "#116329",
    "#6639ba",
    "#9a6700",
    "#24292f",
    "#218bff",
    "#db61a2",
    "#3fb950",
    "#f85149",
    "#d29922",
    "#39d353",
    "#bc4c00",
    "#1b7c83",
    "#6e7781",
    "#8b5cf6",
  ],
} as const;

export const axisTick = { fill: OSRS_CHART_THEME.axis, fontSize: 11 };

export const tooltipProps = {
  shared: false,
  contentStyle: {
    background: OSRS_CHART_THEME.tooltip.background,
    border: `1px solid ${OSRS_CHART_THEME.tooltip.border}`,
    borderRadius: "0.35rem",
    color: OSRS_CHART_THEME.tooltip.text,
  },
  labelStyle: { color: OSRS_CHART_THEME.tooltip.text },
};

export const chartMargin = { top: 8, right: 12, left: 4, bottom: 8 } as const;

export const legendProps = {
  verticalAlign: "bottom" as const,
  align: "center" as const,
  layout: "horizontal" as const,
  wrapperStyle: {
    color: OSRS_CHART_THEME.legendText,
    width: "100%",
    left: 0,
    paddingTop: "10px",
  },
};
