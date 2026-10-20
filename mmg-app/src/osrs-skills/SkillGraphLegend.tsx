export function SkillGraphLegend({ variant }: { variant: "timeline" | "network" }) {
  return (
    <aside className="osrs-quest__legend" aria-label="Skill graph legend">
      <p className="osrs-quest__legend-title">Legend</p>
      <div className="osrs-quest__legend-groups">
        <div className="osrs-quest__legend-group">
          <span className="osrs-quest__legend-heading">Nodes</span>
          <ul>
            <li>
              <span className="osrs-quest__legend-swatch osrs-quest__legend-swatch--skill" />
              Skill
            </li>
            <li>
              <span className="osrs-quest__legend-swatch osrs-quest__legend-swatch--quest" />
              Method / unlock
            </li>
            <li>Left color bar is the method's primary skill</li>
          </ul>
        </div>
        <div className="osrs-quest__legend-group">
          <span className="osrs-quest__legend-heading">Lines</span>
          <ul>
            <li>
              <span className="osrs-quest__legend-line osrs-quest__legend-line--skill" aria-hidden />
              Dashed: skill unlock / extra requirement
            </li>
            <li>
              <span className="osrs-quest__legend-line" aria-hidden />
              Solid: item feeds another skill
            </li>
          </ul>
        </div>
        <div className="osrs-quest__legend-group">
          <span className="osrs-quest__legend-heading">{variant === "network" ? "Map" : "Timeline"}</span>
          <ul>
            {variant === "network" ? (
              <>
                <li>2+ / 3+ keeps methods that touch multiple skills</li>
                <li>Hulls group methods by primary skill</li>
                <li>Click isolates a neighborhood</li>
              </>
            ) : (
              <>
                <li>Levels run top to bottom like the in-game skill guide</li>
                <li>Click a method to see what it feeds</li>
              </>
            )}
            <li>
              <span className="osrs-quest__legend-ring osrs-quest__legend-ring--ready" />
              Ready
            </li>
            <li>
              <span className="osrs-quest__legend-ring osrs-quest__legend-ring--locked" />
              Locked (WOM level too low)
            </li>
          </ul>
        </div>
      </div>
    </aside>
  );
}
