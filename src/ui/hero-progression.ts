import { heroExperienceFloor, heroLevelForExperience, heroNextLevelRequirement, maximumHeroLevel } from "../depth/rpg";

export interface HeroExperienceProjection {
  state: "progressing" | "maximum";
  text: string;
  progressMaximum: number;
  progressValue: number;
  accessibleLabel: string;
}

export function projectHeroExperience(
  hero: Readonly<{ level: number; experience: number }>,
): HeroExperienceProjection {
  if (hero.level !== heroLevelForExperience(hero.experience)) {
    throw new TypeError("Hero progression projection requires canonical level and experience");
  }
  const nextRequirement = heroNextLevelRequirement(hero.level);
  if (nextRequirement === null) {
    return {
      state: "maximum",
      text: `MAX LEVEL · ${hero.experience} total XP`,
      progressMaximum: 1,
      progressValue: 1,
      accessibleLabel: `Maximum hero level ${maximumHeroLevel}; ${hero.experience} total experience`,
    };
  }
  const floor = heroExperienceFloor(hero.level);
  const progressMaximum = Math.max(1, nextRequirement - floor);
  const progressValue = Math.max(0, Math.min(progressMaximum, hero.experience - floor));
  return {
    state: "progressing",
    text: `${hero.experience} / ${nextRequirement}`,
    progressMaximum,
    progressValue,
    accessibleLabel: `Hero level ${hero.level}; ${hero.experience} total experience; ${nextRequirement - hero.experience} experience to level ${hero.level + 1}`,
  };
}
