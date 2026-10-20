import { useEffect, useMemo, useRef } from "react";
import { arc, descending } from "d3";
import { chord, ribbon } from "d3-chord";

import { attachQuestGraphZoom } from "../osrs-quests/graphInteraction";
import { skillNetworkSubgraph } from "./layoutNetwork";
import { buildSkillChord, chordHasValues } from "./skillFlow";
import type { SkillFilters } from "./skillFilters";
import type { SkillGraph } from "./types";

const VIEW = 920;
const INNER = 280;
const OUTER = 304;

type Props = {
  graph: SkillGraph;
  filters: SkillFilters;
  isolatedId: string | null;
  onSkillClick: (skill: string) => void;
};

export function SkillChordSvg({ graph, filters, isolatedId, onSkillClick }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const subgraph = useMemo(() => skillNetworkSubgraph(graph, filters, isolatedId), [filters, graph, isolatedId]);
  const data = useMemo(() => buildSkillChord(subgraph), [subgraph]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    return attachQuestGraphZoom(svg, [0.4, 2.5], true);
  }, [data.names.join("|")]);

  if (data.names.length < 2 || !chordHasValues(data.matrix)) {
    return (
      <p className="osrs-quest__empty">
        Chord needs methods that connect two skills. Lower the cross-skill filter.
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
      aria-label="Skill cross-pollination chord"
    >
      <g className="osrs-quest__zoom">
        <g transform={`translate(${VIEW / 2},${VIEW / 2})`}>
          {layout.map((item, index) => {
            const d = ribbonPath(item);
            if (!d) throw new Error("skill chord: ribbon path failed");
            const sourceName = data.names[item.source.index];
            const targetName = data.names[item.target.index];
            return (
              <path
                key={`ribbon-${index}`}
                d={d}
                fill={data.colors[item.source.index]}
                fillOpacity={0.72}
                className="osrs-quest__chord-ribbon"
                onClick={() => onSkillClick(sourceName)}
              >
                <title>
                  {sourceName} → {targetName}: {item.source.value}
                </title>
              </path>
            );
          })}
          {layout.groups.map((group) => {
            const d = arcPath(group);
            if (!d) throw new Error("skill chord: arc path failed");
            const name = data.names[group.index];
            const angle = (group.startAngle + group.endAngle) / 2;
            const flipped = angle > Math.PI;
            return (
              <g key={name}>
                <path d={d} fill={data.colors[group.index]} className="osrs-quest__chord-arc" onClick={() => onSkillClick(name)}>
                  <title>
                    {name}: {group.value}
                  </title>
                </path>
                <text
                  className="osrs-quest__chord-label"
                  transform={`rotate(${(angle * 180) / Math.PI - 90}) translate(${OUTER + 18}) ${flipped ? "rotate(180)" : ""}`}
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
    </svg>
  );
}
