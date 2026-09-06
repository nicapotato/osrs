import { skillIconUrl } from "./skillIconUrl";
import type { SkillRequirement } from "./types";

type Props = {
  skills: SkillRequirement[];
  compact?: boolean;
};

export function OsrsMmgSkillIcons({ skills, compact = false }: Props) {
  if (skills.length === 0) {
    return compact ? <span className="osrs-mmg__muted">—</span> : null;
  }

  return (
    <div className={compact ? "osrs-mmg__skills-inline" : "osrs-mmg__skills-list"}>
      {skills.map((skill) => (
        <span
          key={skill.skillKey}
          className={compact ? "osrs-mmg__skill-icon" : "osrs-mmg__skill-chip"}
          title={`${skill.skillKey} ${skill.requirementText}`}
        >
          <img src={skillIconUrl(skill.skillKey)} alt={skill.skillKey} width={20} height={20} />
          {!compact ? (
            <span>
              {skill.skillKey} {skill.requirementText?.trim() || "—"}
            </span>
          ) : (
            <span className="osrs-mmg__skill-level">{skill.requirementText?.trim() || "—"}</span>
          )}
        </span>
      ))}
    </div>
  );
}
