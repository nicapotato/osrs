export function QuestGraphLegend({
  variant = "neighborhood",
}: {
  variant?: "neighborhood" | "network" | "pack" | "heatmap";
}) {
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
          {variant === "heatmap" ? (
            <ul>
              <li>Columns are storylines (plus Diaries / Standalone / Miniquests) or difficulty bands</li>
              <li>Sort columns by name, quest count, summed skill levels, or hardest quest in the group</li>
              <li>Sort skill rows by name, how many quests need them, or summed required levels</li>
            </ul>
          ) : (
          <ul>
            <li>
              <span className="osrs-quest__legend-stripe" aria-hidden />
              {variant === "pack"
                ? "Circle size is the family; color is the storyline"
                : variant === "network"
                  ? "Storyline icon + shaded hull"
                  : "Colored left bar is the storyline / series"}
            </li>
            {variant === "pack" ? <li>Zoomed-in quest fill is difficulty</li> : <li>Subtitle shows the chain name and chapter</li>}
            {variant === "pack" || variant === "network" ? (
              <>
                <li>
                  <span className="osrs-quest__legend-swatch osrs-quest__legend-swatch--novice" />
                  Novice
                </li>
                <li>
                  <span className="osrs-quest__legend-swatch osrs-quest__legend-swatch--intermediate" />
                  Intermediate
                </li>
                <li>
                  <span className="osrs-quest__legend-swatch osrs-quest__legend-swatch--experienced" />
                  Experienced
                </li>
                <li>
                  <span className="osrs-quest__legend-swatch osrs-quest__legend-swatch--master" />
                  Master
                </li>
                <li>
                  <span className="osrs-quest__legend-swatch osrs-quest__legend-swatch--grandmaster" />
                  Grandmaster
                </li>
                <li>
                  <span className="osrs-quest__legend-swatch osrs-quest__legend-swatch--special" />
                  Special
                </li>
              </>
            ) : null}
          </ul>
          )}
        </div>
        <div className="osrs-quest__legend-group">
          <span className="osrs-quest__legend-heading">{variant === "heatmap" ? "Cells" : "Lines"}</span>
          {variant === "pack" ? (
            <ul>
              <li>Click a family to zoom in; click the background to zoom out</li>
              <li>Zoomed-in circles are individual quests, miniquests, diaries, or skills</li>
            </ul>
          ) : variant === "heatmap" ? (
            <ul>
              <li>Cell value is quest count, the highest required level, or the sum of required levels</li>
              <li>Darker green is a heavier tax on that skill × column</li>
              <li>Σ is the row or column total on the same metric</li>
            </ul>
          ) : (
            <ul>
              <li>
                <span className="osrs-quest__legend-line" aria-hidden />
                Solid: required quest
              </li>
              <li>
                <span className="osrs-quest__legend-line osrs-quest__legend-line--skill" aria-hidden />
                Dashed: skill or other level
              </li>
              <li>
                <span className="osrs-quest__legend-line osrs-quest__legend-line--arrow" aria-hidden />
                Arrow points at the quest that needs the requirement
              </li>
              {variant === "network" ? (
                <>
                  <li>Skills share a green hull so level nodes sit together</li>
                  <li>The number on a dashed line is the required skill level</li>
                </>
              ) : null}
            </ul>
          )}
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
              {variant === "pack"
                ? "Click: zoom into a family"
                : variant === "network"
                  ? "Click: isolate neighborhood"
                  : variant === "heatmap"
                    ? "Click a cell: list those quests"
                    : "Click: focus node and connections"}
            </li>
            <li>Right-click: wiki and complete</li>
            <li>Double-click: open neighborhood</li>
          </ul>
        </div>
      </div>
    </aside>
  );
}
