import { useEffect, useMemo, useRef } from "react";
import { arc, descending } from "d3";
import { chord, ribbon } from "d3-chord";

import { attachQuestGraphZoom } from "./graphInteraction";
import { networkSubgraph } from "./layoutNetwork";
import { buildSeriesChord, chordHasValues } from "./seriesFlow";
import type { QuestGraph } from "./types";

const VIEW = 920;
const INNER = 280;
const OUTER = 304;

type Props = {
  graph: QuestGraph;
  visibleQuestIds: Set<string>;
  isolatedId: string | null;
  onSeriesClick: (series: string) => void;
};

export function QuestChordSvg({ graph, visibleQuestIds, isolatedId, onSeriesClick }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const subgraph = useMemo(
    () => networkSubgraph(graph, visibleQuestIds, isolatedId),
    [graph, isolatedId, visibleQuestIds],
  );
  const data = useMemo(() => buildSeriesChord(subgraph), [subgraph]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    return attachQuestGraphZoom(svg, [0.4, 2.5], true);
  }, [data.names.join("|")]);

  if (data.names.length < 2 || !chordHasValues(data.matrix)) {
    return (
      <p className="osrs-quest__empty">
        Chord needs at least two storyline groups with quest-to-quest requirements. Relax filters or pick Force
        network.
      </p>
    );
  }

  const layout = chord().padAngle(0.04).sortSubgroups(descending)(data.matrix);
  const ribbonPath = ribbon().radius(INNER) as unknown as (item: (typeof layout)[number]) => string | null;
  const arcPath = arc().innerRadius(INNER).outerRadius(OUTER) as unknown as (
    group: (typeof layout.groups)[number],
  ) => string | null;

  return (
    <svg
      ref={svgRef}
      className="osrs-quest__svg osrs-quest__svg--static"
      viewBox={`0 0 ${VIEW} ${VIEW}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="Quest storyline chord diagram"
    >
      <g className="osrs-quest__zoom">
        <g transform={`translate(${VIEW / 2},${VIEW / 2})`}>
        <g>
          {layout.map((item, index) => {
            const d = ribbonPath(item);
            if (!d) throw new Error("quest chord: ribbon path failed");
            const sourceName = data.names[item.source.index];
            const targetName = data.names[item.target.index];
            return (
              <path
                key={`ribbon-${index}`}
                d={d}
                fill={data.colors[item.source.index]}
                fillOpacity={0.72}
                className="osrs-quest__chord-ribbon"
                onClick={() => onSeriesClick(sourceName)}
              >
                <title>
                  {sourceName} → {targetName}: {item.source.value} requirement
                  {item.source.value === 1 ? "" : "s"}
                </title>
              </path>
            );
          })}
        </g>
        <g>
          {layout.groups.map((group) => {
            const d = arcPath(group);
            if (!d) throw new Error("quest chord: arc path failed");
            const name = data.names[group.index];
            const angle = (group.startAngle + group.endAngle) / 2;
            const flipped = angle > Math.PI;
            const labelRadius = OUTER + 18;
            return (
              <g key={name}>
                <path
                  d={d}
                  fill={data.colors[group.index]}
                  className="osrs-quest__chord-arc"
                  onClick={() => onSeriesClick(name)}
                >
                  <title>
                    {name}: {group.value} requirement{group.value === 1 ? "" : "s"}
                  </title>
                </path>
                <text
                  className="osrs-quest__chord-label"
                  transform={`rotate(${(angle * 180) / Math.PI - 90}) translate(${labelRadius}) ${
                    flipped ? "rotate(180)" : ""
                  }`}
                  textAnchor={flipped ? "end" : "start"}
                  dy="0.35em"
                >
                  {name}
                </text>
              </g>
            );
          })}
        </g>
        </g>
      </g>
    </svg>
  );
}
