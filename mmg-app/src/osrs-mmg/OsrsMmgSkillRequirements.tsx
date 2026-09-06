import { OsrsMmgSkillIcons } from "./OsrsMmgSkillIcons";
import type { SkillRequirement } from "./types";

type Props = {
  skills: SkillRequirement[];
};

export function OsrsMmgSkillRequirements({ skills }: Props) {
  if (skills.length === 0) return null;

  return (
    <section className="osrs-mmg__skills">
      <h3>Skill requirements</h3>
      <OsrsMmgSkillIcons skills={skills} />
    </section>
  );
}
