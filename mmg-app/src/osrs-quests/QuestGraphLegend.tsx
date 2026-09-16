export function QuestGraphLegend({ variant = "neighborhood" }: { variant?: "neighborhood" | "network" }) {
  return (
    <aside className="osrs-quest__legend" aria-label="Quest graph legend">
      <p className="osrs-quest__legend-title">Legend</p>
      <div className="osrs-quest__legend-groups">
        <div className="osrs-quest__legend-group">
          <span className="osrs-quest__legend-heading">Nodes</span>
          <ul>
            <li>
              <span className="osrs-quest__legend-swatch osrs-quest__legend-swatch--quest" />
              Quest
            </li>
            <li>
              <span className="osrs-quest__legend-swatch osrs-quest__legend-swatch--miniquest" />
              Miniquest
            </li>
            <li>
              <span className="osrs-quest__legend-swatch osrs-quest__legend-swatch--diary" />
              Achievement diary
            </li>
            <li>
              <span className="osrs-quest__legend-swatch osrs-quest__legend-swatch--skill" />
              Skill / level
            </li>
            <li>
              <span className="osrs-quest__legend-swatch osrs-quest__legend-swatch--other" />
              QP, kudos, other
            </li>
          </ul>
        </div>
        <div className="osrs-quest__legend-group">
          <span className="osrs-quest__legend-heading">Quest chain</span>
          <ul>
            <li>
              <span className="osrs-quest__legend-stripe" aria-hidden />
              Colored left bar is the storyline / series
            </li>
            <li>Subtitle shows the chain name and chapter</li>
            {variant === "network" ? (
              <li>Shaded boxes group a storyline on the full map</li>
            ) : null}
          </ul>
        </div>
        <div className="osrs-quest__legend-group">
          <span className="osrs-quest__legend-heading">Lines</span>
          <ul>
            <li>
              <span className="osrs-quest__legend-line" aria-hidden />
              Solid: required quest
            </li>
            <li>
              <span className="osrs-quest__legend-line osrs-quest__legend-line--skill" aria-hidden />
              Dashed: skill or other level
            </li>
            {variant === "network" ? (
              <li>Side rails are skills by level (1 at top, 99 at bottom)</li>
            ) : null}
          </ul>
        </div>
        <div className="osrs-quest__legend-group">
          <span className="osrs-quest__legend-heading">Progress</span>
          <ul>
            <li>
              <span className="osrs-quest__legend-ring osrs-quest__legend-ring--done" />
              Done
            </li>
            <li>
              <span className="osrs-quest__legend-ring osrs-quest__legend-ring--ready" />
              Ready
            </li>
            <li>
              <span className="osrs-quest__legend-ring osrs-quest__legend-ring--locked" />
              Locked
            </li>
            <li>
              <span className="osrs-quest__legend-swatch osrs-quest__legend-swatch--focus" />
              Focused node
            </li>
            <li>
              <span className="osrs-quest__legend-ring osrs-quest__legend-ring--highlight" />
              Click: focus node and connections
            </li>
            <li>Right-click: wiki and complete</li>
            <li>Double-click: open neighborhood</li>
          </ul>
        </div>
      </div>
    </aside>
  );
}
