import { Application, Container, Graphics, Text, type TextStyleOptions } from "pixi.js";
import { randomInt } from "../core/rng";
import type { SceneMode, WorldState } from "../core/types";
import { monsterDefinition } from "../depth/combat";
import { projectCombatRoster, type CombatRosterProjection, type CombatRosterStatus } from "../depth/combat-roster";
import { counterDuelStanceLabel, counterDuelTellText, projectCounterDuelHabit } from "../depth/counter-duel";
import { dungeonTrapKindLabel, projectDungeonKeyGate, projectDungeonMoveKnowledge, projectDungeonTraps, projectDungeonWayfinding } from "../depth/dungeon";
import type { AbilityEffect, AtlasEdge, AtlasState, AtlasTerrainPoint, CombatantState, CounterDuelStance, CounterDuelState, MazeDirection } from "../depth/types";
import { abilityEffectColor, combatEffectColor, projectCombatMotion, projectLatestCombatCue, type CombatVisualCue } from "./combat-choreography";
import { projectCombatCueVerticalLayout, projectCombatRosterLayout } from "./combat-roster-layout";
import { projectCounterDuelMotion } from "./counter-duel-choreography";
import { projectHeroAppearance, projectHeroIdentityAppearance } from "./hero-appearance";
import { projectHeroRigPose } from "./hero-rig";
import { animatedLayerY, calculateSceneLayout, projectedTextResolution } from "./layout";
import { projectRoute } from "./route-projection";
import { projectTravelCorridor, projectTravelHeroX, travelBiomeVisuals, type TravelBiomeVisual, type TravelCorridor } from "./travel-corridor";

const designWidth = 320;
const designHeight = 180;
const mazeDirectionVector: Record<MazeDirection, readonly [number, number]> = {
  north: [0, -1],
  east: [1, 0],
  south: [0, 1],
  west: [-1, 0],
};

export type RendererViewMode = "live" | "map";

const palettes: Record<SceneMode, readonly [number, number, number]> = {
  town: [0x16283b, 0xdd9c57, 0x79b392],
  atlas: [0x172b36, 0x567f61, 0xe3c47b],
  travel: [0x1c3341, 0x456856, 0xdbba70],
  dungeon: [0x111820, 0x46505a, 0xd5985b],
  battle: [0x28171d, 0x933f43, 0xffc857],
  training: [0x17232f, 0x42677a, 0xe6cb8b],
  discovery: [0x21182f, 0x6b4b78, 0xc9a8ff],
  camp: [0x111a2a, 0x35506f, 0xf29e4c],
  chronicle: [0x241f2f, 0x695878, 0xe6cb8b],
};

function rect(
  x: number,
  y: number,
  width: number,
  height: number,
  color: number,
  alpha = 1,
): Graphics {
  return new Graphics().rect(x, y, width, height).fill({ color, alpha });
}

function circle(x: number, y: number, radius: number, color: number, alpha = 1): Graphics {
  return new Graphics().circle(x, y, radius).fill({ color, alpha });
}

interface BattleUnitVisual {
  layer: Container;
  x: number;
  y: number;
}

interface BattleAnimationBinding {
  cue: CombatVisualCue;
  actor: BattleUnitVisual;
  target: BattleUnitVisual;
  effectLayer: Container;
}

interface CounterDuelAnimationBinding {
  tell: Container;
  prediction: Container;
  reveal: Container;
  consequence: Container;
  hero: BattleUnitVisual;
  opponent: BattleUnitVisual;
}

interface HeroRigBinding {
  puppet: Container;
  frontArm: Container;
  rearArm: Container;
  frontLeg: Container;
  rearLeg: Container;
  mode: SceneMode;
}

export class GameRenderer {
  private readonly app = new Application();
  private readonly worldLayer = new Container();
  private readonly lightLayer = new Container();
  private elapsed = 0;
  private paused = false;
  private lightBaseY = 0;
  private resizeObserver: ResizeObserver | null = null;
  private reducedMotion = false;
  private battleBinding: BattleAnimationBinding | null = null;
  private battleCueId: string | null = null;
  private battleCueStartedAt = 0;
  private counterDuelBinding: CounterDuelAnimationBinding | null = null;
  private counterDuelCueId: string | null = null;
  private counterDuelCueStartedAt = 0;
  private atlasStaticLayer: Container | null = null;
  private atlasStaticSignature: string | null = null;
  private viewMode: RendererViewMode = "live";
  private lastState: WorldState | null = null;
  private readonly heroRigs: HeroRigBinding[] = [];
  private readonly scaleSensitiveTexts: Text[] = [];
  private readonly dungeonAlertTexts: Text[] = [];

  private constructor(private readonly host: HTMLElement) {}

  static async mount(host: HTMLElement): Promise<GameRenderer> {
    const renderer = new GameRenderer(host);
    await renderer.app.init({
      antialias: true,
      autoDensity: true,
      backgroundColor: 0x111827,
      height: Math.max(1, host.clientHeight),
      powerPreference: "low-power",
      preference: "webgl",
      resolution: Math.min(window.devicePixelRatio, 2),
      width: Math.max(1, host.clientWidth),
    });
    renderer.app.ticker.maxFPS = 30;
    renderer.app.stage.addChild(renderer.worldLayer, renderer.lightLayer);
    renderer.host.append(renderer.app.canvas);
    renderer.reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    renderer.host.dataset.reducedMotion = String(renderer.reducedMotion);
    renderer.resizeToHost();
    renderer.resizeObserver = new ResizeObserver(() => renderer.resizeToHost());
    renderer.resizeObserver.observe(host);
    window.addEventListener("resize", () => renderer.resizeToHost());
    renderer.app.ticker.add((ticker) => {
      if (renderer.paused) return;
      renderer.elapsed += ticker.deltaMS / 1000;
      renderer.updateBattleAnimation();
      renderer.updateCounterDuelAnimation();
      renderer.updateHeroRigs();
      renderer.lightLayer.alpha = renderer.reducedMotion
        ? 1
        : 0.88 + Math.sin(renderer.elapsed * 1.7) * 0.08;
      renderer.lightLayer.y = renderer.reducedMotion
        ? renderer.lightBaseY
        : animatedLayerY(renderer.lightBaseY, renderer.elapsed);
    });
    return renderer;
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
  }

  setViewMode(viewMode: RendererViewMode): void {
    if (this.viewMode === viewMode) return;
    this.viewMode = viewMode;
    if (this.lastState !== null) this.render(this.lastState);
  }

  render(state: WorldState): void {
    this.lastState = state;
    const presentedMode: SceneMode = this.viewMode === "map" ? "atlas" : state.scene.mode;
    this.battleBinding = null;
    this.counterDuelBinding = null;
    this.heroRigs.length = 0;
    this.scaleSensitiveTexts.length = 0;
    this.dungeonAlertTexts.length = 0;
    this.host.dataset.sceneMode = presentedMode;
    this.host.dataset.liveSceneMode = state.scene.mode;
    this.host.dataset.viewMode = this.viewMode;
    delete this.host.dataset.travelEdge;
    delete this.host.dataset.travelDirection;
    delete this.host.dataset.travelBiome;
    delete this.host.dataset.travelTerrain;
    delete this.host.dataset.travelSlope;
    delete this.host.dataset.travelCrossing;
    delete this.host.dataset.travelProgress;
    delete this.host.dataset.dungeonTrap;
    delete this.host.dataset.dungeonTrapCell;
    delete this.host.dataset.dungeonTrapResult;
    delete this.host.dataset.dungeonArmedTraps;
    delete this.host.dataset.dungeonSpentTraps;
    delete this.host.dataset.dungeonDisarmedTraps;
    delete this.host.dataset.dungeonTriggeredTraps;
    delete this.host.dataset.dungeonTrapKind;
    delete this.host.dataset.dungeonAlertLabel;
    delete this.host.dataset.dungeonAlertBannerResolution;
    delete this.host.dataset.dungeonAlertDetailResolution;
    delete this.host.dataset.dungeonAlertTextResolution;
    delete this.host.dataset.dungeonTraversalMode;
    delete this.host.dataset.dungeonBreadcrumbLength;
    delete this.host.dataset.dungeonFrontierCell;
    delete this.host.dataset.dungeonNextDirections;
    delete this.host.dataset.dungeonHeroCell;
    delete this.host.dataset.dungeonKeyStatus;
    delete this.host.dataset.dungeonGateStatus;
    delete this.host.dataset.dungeonVisibleObjective;
    delete this.host.dataset.dungeonVisibleObjectiveDirection;
    delete this.host.dataset.encounterEngine;
    delete this.host.dataset.counterDuelId;
    delete this.host.dataset.counterDuelRound;
    delete this.host.dataset.counterDuelTell;
    delete this.host.dataset.counterDuelPrediction;
    delete this.host.dataset.counterDuelHeroStance;
    delete this.host.dataset.counterDuelOpponentStance;
    delete this.host.dataset.counterDuelResult;
    delete this.host.dataset.counterDuelOutcome;
    delete this.host.dataset.counterDuelScore;
    delete this.host.dataset.counterDuelPhase;
    delete this.host.dataset.counterDuelHabit;
    delete this.host.dataset.counterDuelHabitProgress;
    delete this.host.dataset.combatId;
    delete this.host.dataset.combatTurn;
    delete this.host.dataset.combatEvent;
    delete this.host.dataset.combatActor;
    delete this.host.dataset.combatTarget;
    delete this.host.dataset.combatAction;
    delete this.host.dataset.combatInterrupted;
    delete this.host.dataset.combatAbility;
    delete this.host.dataset.combatManaDelta;
    delete this.host.dataset.combatHealthDelta;
    delete this.host.dataset.combatStatuses;
    delete this.host.dataset.combatStatusDurations;
    delete this.host.dataset.combatDefeated;
    delete this.host.dataset.combatOutcome;
    delete this.host.dataset.combatPhase;
    delete this.host.dataset.combatRoster;
    delete this.host.dataset.combatRosterStatuses;
    delete this.host.dataset.combatUpcoming;
    delete this.host.dataset.combatActiveUnit;
    delete this.host.dataset.combatFocusTarget;
    delete this.host.dataset.combatFocusKind;
    this.clear(this.worldLayer);
    this.clear(this.lightLayer);
    const palette = palettes[presentedMode];
    this.worldLayer.addChild(rect(0, 0, designWidth, designHeight, palette[0]));
    this.drawHorizon(palette);

    switch (presentedMode) {
      case "town":
        this.drawTown(state, palette);
        break;
      case "atlas":
        this.drawAtlas(state, palette);
        break;
      case "travel":
        this.drawTravel(state, palette);
        break;
      case "dungeon":
        this.drawDungeon(state, palette);
        break;
      case "battle":
        this.drawBattle(state, palette);
        break;
      case "training":
        this.drawTraining(state, palette);
        break;
      case "discovery":
        this.drawDiscovery(state, palette);
        break;
      case "camp":
        this.drawCamp(state, palette);
        break;
      case "chronicle":
        this.drawChronicle(state, palette);
        break;
    }

    this.layout();
  }

  private clear(layer: Container): void {
    for (const child of layer.removeChildren()) {
      if (child !== this.atlasStaticLayer) child.destroy({ children: true });
    }
  }

  private layout(): void {
    const layout = calculateSceneLayout(this.app.screen.width, this.app.screen.height, designWidth, designHeight);
    this.host.dataset.sceneLayout = [layout.scale, layout.x, layout.y]
      .map((value) => value.toFixed(4))
      .join(",");
    this.worldLayer.scale.set(layout.scale);
    this.worldLayer.position.set(layout.x, layout.y);
    this.lightLayer.scale.set(layout.scale);
    this.lightBaseY = layout.y;
    this.lightLayer.position.set(layout.x, animatedLayerY(this.lightBaseY, this.elapsed));
    const textResolution = projectedTextResolution(this.app.renderer.resolution, layout.scale);
    for (const text of this.scaleSensitiveTexts) {
      if (text.resolution !== textResolution) text.resolution = textResolution;
    }
    if (this.dungeonAlertTexts.length > 0) {
      const bannerResolution = this.dungeonAlertTexts[0]?.resolution;
      const detailResolution = this.dungeonAlertTexts[1]?.resolution;
      if (bannerResolution !== undefined) {
        this.host.dataset.dungeonAlertBannerResolution = bannerResolution.toFixed(4);
        this.host.dataset.dungeonAlertTextResolution = bannerResolution.toFixed(4);
      }
      if (detailResolution !== undefined) {
        this.host.dataset.dungeonAlertDetailResolution = detailResolution.toFixed(4);
      }
    }
  }

  private resizeToHost(): void {
    const width = Math.max(1, this.host.clientWidth);
    const height = Math.max(1, this.host.clientHeight);
    const rendererResolution = Math.min(window.devicePixelRatio, 2);
    const resolutionChanged = this.app.renderer.resolution !== rendererResolution;
    if (resolutionChanged) {
      this.app.renderer.resolution = rendererResolution;
    }
    if (this.app.screen.width !== width || this.app.screen.height !== height || resolutionChanged) {
      this.app.renderer.resize(width, height);
    }
    this.host.dataset.rendererResolution = this.app.renderer.resolution.toFixed(4);
    this.layout();
  }

  private drawHorizon(palette: readonly [number, number, number]): void {
    this.worldLayer.addChild(rect(0, 110, designWidth, 70, palette[1], 0.32));
    this.worldLayer.addChild(
      new Graphics()
        .moveTo(0, 116)
        .bezierCurveTo(70, 83, 123, 121, 181, 91)
        .bezierCurveTo(224, 70, 270, 112, 320, 82)
        .lineTo(320, 180)
        .lineTo(0, 180)
        .closePath()
        .fill({ color: palette[1], alpha: 0.46 }),
    );
  }

  private updateHeroRigs(): void {
    for (const rig of this.heroRigs) {
      const pose = projectHeroRigPose(rig.mode, this.elapsed, this.reducedMotion);
      rig.puppet.y = pose.bodyY;
      rig.puppet.rotation = pose.bodyRotation;
      rig.frontArm.rotation = pose.frontArmRotation;
      rig.rearArm.rotation = pose.rearArmRotation;
      rig.frontLeg.rotation = pose.frontLegRotation;
      rig.rearLeg.rotation = pose.rearLegRotation;
    }
  }

  private drawHero(
    state: WorldState,
    x: number,
    y: number,
    _palette: readonly [number, number, number],
    scale = 1,
  ): Container {
    const gear = projectHeroAppearance(state.depth.hero);
    const identity = projectHeroIdentityAppearance(state.depth.hero);
    const heroLayer = new Container();
    heroLayer.position.set(x, y);
    heroLayer.scale.set(scale);
    heroLayer.addChild(new Graphics().ellipse(0, 14, 9, 2.2).fill({ color: 0x080d18, alpha: 0.42 }));

    const puppet = new Container();
    heroLayer.addChild(puppet);

    if (gear.charm?.silhouette === "halo") {
      puppet.addChild(new Graphics().ellipse(-0.5, -27, 8, 2.8).stroke({ color: gear.charm.color, width: 1.2, alpha: 0.88 }));
    } else if (gear.charm?.silhouette === "orb") {
      puppet.addChild(circle(-10, -5, 5, gear.charm.color, 0.16), circle(-10, -5, 2.2, gear.charm.color, 0.92));
    } else if (gear.charm?.silhouette === "sigil") {
      puppet.addChild(new Graphics().poly([-12, -8, -9, -5, -12, -2, -15, -5]).fill({ color: gear.charm.color, alpha: 0.9 }));
    }

    puppet.addChild(new Graphics()
      .poly([-6.5, -12, 3.5, -13, 7.5, 5, 1, 10, -8.5, 6])
      .fill({ color: identity.cloak, alpha: 0.96 })
      .stroke({ color: 0x17212e, width: 0.8, alpha: 0.9 }));

    const createLeg = (front: boolean): Container => {
      const leg = new Container();
      leg.position.set(front ? 3 : -3, 3.5);
      const legColor = front ? 0x263544 : 0x18232f;
      leg.addChild(new Graphics().poly([-2, -1, 2, -1, 2.5, 8, 0.6, 11.5, -3, 11]).fill(legColor));
      const footColor = gear.feet?.color ?? identity.belt;
      const footAccent = gear.feet?.accent ?? 0x241d1b;
      if (gear.feet?.silhouette === "greaves") {
        leg.addChild(new Graphics().poly([-2.4, 3, 2.8, 3, 2.5, 10.6, -2.8, 10.6]).fill(footColor));
        leg.addChild(rect(-2.5, 6, 5.2, 1, footAccent));
      } else {
        leg.addChild(new Graphics().poly([-3, 9, 2.5, 9, 4.2, 12.2, -3.4, 12.2]).fill(footColor));
        if (gear.feet?.silhouette === "sandals") leg.addChild(rect(-3.2, 10.5, 7.2, 1, footAccent));
      }
      return leg;
    };
    const rearLeg = createLeg(false);
    const frontLeg = createLeg(true);
    puppet.addChild(rearLeg, frontLeg);

    const rearArm = new Container();
    rearArm.position.set(-5.5, -10.5);
    rearArm.addChild(new Graphics().moveTo(0, 0).lineTo(-3.5, 5).lineTo(-1.5, 11).stroke({ color: identity.cloak, width: 3.2 }));
    rearArm.addChild(circle(-1.4, 11.2, 1.8, identity.skin));
    if (gear.offhand?.silhouette === "shield") {
      rearArm.addChild(new Graphics().poly([-8, 5, -1, 6, 0, 14, -4.5, 17, -9, 13]).fill(gear.offhand.color).stroke({ color: gear.offhand.accent, width: 0.9 }));
      rearArm.addChild(circle(-4.5, 10.5, 1.8, gear.offhand.accent));
    } else if (gear.offhand?.silhouette === "book") {
      rearArm.addChild(rect(-8, 7, 7, 9, gear.offhand.color), rect(-5, 8, 1, 7, gear.offhand.accent));
    } else if (gear.offhand?.silhouette === "lantern") {
      rearArm.addChild(rect(-7, 9, 6, 7, gear.offhand.accent), circle(-4, 12.5, 5, gear.offhand.color, 0.2));
      rearArm.addChild(new Graphics().moveTo(-6, 9).quadraticCurveTo(-4, 5, -2, 9).stroke({ color: gear.offhand.color, width: 0.8 }));
    }
    puppet.addChild(rearArm);

    const torsoColor = gear.body?.color ?? identity.tunic;
    const torsoAccent = gear.body?.accent ?? identity.cloak;
    puppet.addChild(new Graphics().poly([-7.5, -13, 6.5, -13, 5, 4.5, 0, 7, -6.5, 4.5]).fill(0x17212e));
    const torso = new Graphics().poly([-6.4, -12.2, 5.4, -12.2, 4.2, 3.7, -0.2, 5.6, -5.5, 3.7]).fill(torsoColor);
    if (gear.body?.silhouette === "mail") {
      for (let row = 0; row < 4; row += 1) torso.moveTo(-5 + row % 2, -8 + row * 3.2).lineTo(4, -8 + row * 3.2);
      torso.stroke({ color: torsoAccent, width: 0.7, alpha: 0.9 });
    }
    puppet.addChild(torso);
    if (gear.body?.silhouette === "plate") {
      puppet.addChild(new Graphics().poly([-5.3, -10, 4.5, -10, 3.4, 1.8, -0.2, 3.5, -4.7, 1.8]).stroke({ color: torsoAccent, width: 1.2 }));
      puppet.addChild(circle(-6.2, -10.5, 2.1, torsoAccent), circle(5.2, -10.5, 2.1, torsoAccent));
    } else if (gear.body?.silhouette === "coat") {
      puppet.addChild(rect(-0.9, -11.7, 1.4, 15.8, torsoAccent));
    }
    puppet.addChild(rect(-5.6, 0.2, 10.3, 1.8, identity.belt), circle(-0.4, 1.1, 1.2, 0xc89a4b));
    puppet.addChild(rect(-2.2, -16, 4.2, 4, identity.skin));

    puppet.addChild(new Graphics().ellipse(-1.8, -20.2, 5.8, 6.5).fill(identity.hair));
    puppet.addChild(new Graphics().ellipse(0.2, -19.3, 5.2, 5.7).fill(identity.skin));
    puppet.addChild(new Graphics().poly([4.4, -20.6, 7.2, -18.8, 4.4, -17.9]).fill(identity.skin));
    puppet.addChild(circle(3.1, -20.8, 0.65, 0x17212e));
    puppet.addChild(new Graphics().moveTo(3.2, -16.5).quadraticCurveTo(0.8, -14.5, -2, -15.8).stroke({ color: identity.hair, width: 1.2 }));
    puppet.addChild(new Graphics().moveTo(-5.3, -22).quadraticCurveTo(-0.5, -28, 4.5, -23.2).lineTo(2.5, -22).quadraticCurveTo(-0.5, -25, -4.8, -20.2).fill(identity.hair));

    if (gear.head?.silhouette === "cap") {
      puppet.addChild(new Graphics().moveTo(-5.8, -22).quadraticCurveTo(-1, -29, 5, -23).lineTo(7, -22).lineTo(-5.8, -21.5).closePath().fill(gear.head.color));
    } else if (gear.head?.silhouette === "crown") {
      puppet.addChild(new Graphics().poly([-5, -23, -4.5, -29, -1.5, -26, 1, -30, 3.3, -26, 5.7, -29, 5.2, -23]).fill(gear.head.color));
    } else if (gear.head?.silhouette === "helm") {
      puppet.addChild(new Graphics().moveTo(-5.7, -21).quadraticCurveTo(-1, -30, 5.5, -23).lineTo(5.2, -17).lineTo(2.4, -17).lineTo(2.5, -21).lineTo(-5.7, -21).closePath().fill(gear.head.color));
      puppet.addChild(rect(-2.5, -21.5, 7.5, 1, gear.head.accent));
    }

    const frontArm = new Container();
    frontArm.position.set(5, -10.5);
    frontArm.addChild(new Graphics().moveTo(0, 0).lineTo(4, 5).lineTo(2.2, 11).stroke({ color: identity.tunic, width: 3.3 }));
    frontArm.addChild(circle(2.2, 11.2, 1.8, identity.skin));
    if (gear.weapon?.silhouette === "sword") {
      frontArm.addChild(new Graphics().moveTo(2.3, 11).lineTo(4.5, -10).stroke({ color: gear.weapon.color, width: 1.7 }));
      frontArm.addChild(new Graphics().moveTo(-0.5, 7.5).lineTo(5.3, 8.2).stroke({ color: gear.weapon.accent, width: 1.7 }));
    } else if (gear.weapon?.silhouette === "spear") {
      frontArm.addChild(new Graphics().moveTo(2.2, 15).lineTo(5.2, -15).stroke({ color: gear.weapon.accent, width: 1.3 }));
      frontArm.addChild(new Graphics().poly([5.2, -18.5, 8, -12.8, 3.2, -13.4]).fill(gear.weapon.color));
    } else if (gear.weapon?.silhouette === "wand") {
      frontArm.addChild(new Graphics().moveTo(2.2, 11).lineTo(6.5, -7).stroke({ color: gear.weapon.accent, width: 1.8 }));
      frontArm.addChild(circle(6.8, -9.5, 5.5, gear.weapon.color, 0.16), circle(6.8, -9.5, 2.4, gear.weapon.color));
    }
    puppet.addChild(frontArm);

    const mode: SceneMode = this.viewMode === "map" ? "atlas" : state.scene.mode;
    this.heroRigs.push({ puppet, frontArm, rearArm, frontLeg, rearLeg, mode });
    this.updateHeroRigs();
    this.lightLayer.addChild(heroLayer);
    return heroLayer;
  }

  private drawTown(state: WorldState, palette: readonly [number, number, number]): void {
    const town = state.depth.towns[state.depth.atlas.currentLocationId];
    this.worldLayer.addChild(rect(0, 132, designWidth, 48, 0x345446));
    if (town === undefined) {
      this.drawHero(state, 160, 146, palette);
      return;
    }
    const buildingColors = [0xc98055, 0x9f6650, 0xc49b63, 0x7f765b, 0xb46f58] as const;
    const visibleBuildings = town.buildings.slice(0, 18);
    for (let index = 0; index < visibleBuildings.length; index += 1) {
      const building = visibleBuildings[index];
      if (building === undefined) continue;
      const districtIndex = Math.max(
        0,
        town.districts.findIndex((district) => district.id === building.districtId),
      );
      const column = index % 9;
      const row = Math.floor(index / 9);
      const width = 22 + randomInt(15, state.seed, "town-visual", building.id, 0, "width");
      const height = 22 + randomInt(25, state.seed, "town-visual", building.id, 0, "height");
      const x = 8 + column * 35 + (row % 2) * 8;
      const y = 132 - height - row * 30;
      const color = buildingColors[districtIndex % buildingColors.length] ?? 0xc98055;
      this.worldLayer.addChild(rect(x, y, width, height, color));
      this.worldLayer.addChild(
        new Graphics()
          .poly([x - 4, y, x + width / 2, y - 18, x + width + 4, y])
          .fill(0x613f4b),
      );
      this.worldLayer.addChild(rect(x + 6, y + 9, 6, 7, palette[2], 0.78));
      for (let residentIndex = 0; residentIndex < Math.min(3, building.residentIds.length); residentIndex += 1) {
        this.worldLayer.addChild(
          circle(x + 6 + residentIndex * 6, 137 + row * 8, 2, 0xe7c9a0),
        );
      }
    }
    this.worldLayer.addChild(
      new Graphics()
        .moveTo(128, 180)
        .bezierCurveTo(137, 159, 156, 143, 176, 132)
        .lineTo(202, 132)
        .bezierCurveTo(177, 149, 167, 165, 164, 180)
        .closePath()
        .fill(0xb6956a),
    );
    this.drawHero(state, 172, 146, palette);
  }

  private atlasPoint(point: Pick<AtlasTerrainPoint, "x" | "y">): readonly [number, number] {
    return [50 + point.x * 0.22, 35 + point.y * 0.12];
  }

  private buildAtlasStaticLayer(atlas: AtlasState): Container {
    const layer = new Container();
    layer.addChild(rect(44, 29, 232, 132, 0xb99d69));
    layer.addChild(rect(48, 33, 224, 124, 0xaeb7a1));
    const biomeColors: Record<AtlasTerrainPoint["biome"], number> = {
      ocean: 0xaeb7a1,
      coast: 0xd7c58f,
      grassland: 0xc6b77f,
      forest: 0x93a16f,
      rainforest: 0x788d65,
      desert: 0xd4bb7c,
      tundra: 0xbab79b,
      mountain: 0xa79679,
      snow: 0xd8d0b7,
      marsh: 0x8f9d78,
    };
    const terrainInk = new Graphics();
    for (const triangle of atlas.terrain.triangles) {
      const first = atlas.terrain.points[triangle.a];
      const second = atlas.terrain.points[triangle.b];
      const third = atlas.terrain.points[triangle.c];
      if (first === undefined || second === undefined || third === undefined) continue;
      const [x1, y1] = this.atlasPoint(first);
      const [x2, y2] = this.atlasPoint(second);
      const [x3, y3] = this.atlasPoint(third);
      const landPoints = [first, second, third].filter((point) => point.biome !== "ocean");
      const color = landPoints.length === 0
        ? biomeColors.ocean
        : biomeColors[landPoints.sort((left, right) => right.elevation - left.elevation)[0]?.biome ?? "grassland"];
      terrainInk.poly([x1, y1, x2, y2, x3, y3]).fill({ color, alpha: 0.86 });
    }
    layer.addChild(terrainInk);

    const reliefInk = new Graphics();
    for (let index = 0; index < atlas.terrain.points.length; index += 1) {
      const point = atlas.terrain.points[index];
      if (point === undefined || index % 4 !== 0) continue;
      const [x, y] = this.atlasPoint(point);
      if (point.biome === "mountain" || point.biome === "snow") {
        const height = point.biome === "snow" ? 4.2 : 3.2;
        reliefInk.moveTo(x - 3, y + 2).lineTo(x, y - height).lineTo(x + 3, y + 2).stroke({ color: 0x5d5146, width: 0.7, alpha: 0.72 });
        if (point.biome === "snow") reliefInk.moveTo(x - 1.2, y - 1.2).lineTo(x, y - height).lineTo(x + 1.2, y - 1.2).stroke({ color: 0xf1e8cf, width: 0.65, alpha: 0.9 });
      } else if (point.biome === "forest" || point.biome === "rainforest") {
        reliefInk.moveTo(x, y - 2.3).lineTo(x - 1.8, y + 1).lineTo(x + 1.8, y + 1).closePath().fill({ color: 0x405a43, alpha: 0.56 });
        reliefInk.moveTo(x, y + 0.5).lineTo(x, y + 2.2).stroke({ color: 0x405a43, width: 0.55, alpha: 0.62 });
      } else if (point.biome === "marsh") {
        reliefInk.moveTo(x - 2, y).quadraticCurveTo(x, y - 1, x + 2, y).stroke({ color: 0x526654, width: 0.55, alpha: 0.64 });
      }
    }
    layer.addChild(reliefInk);

    const waterInk = new Graphics();
    for (const segment of atlas.terrain.coastline) {
      const [x1, y1] = this.atlasPoint({ x: segment.x1, y: segment.y1 });
      const [x2, y2] = this.atlasPoint({ x: segment.x2, y: segment.y2 });
      waterInk.moveTo(x1, y1).lineTo(x2, y2).stroke({ color: 0x4e665f, width: 1.15, alpha: 0.94 });
    }
    for (const river of atlas.terrain.rivers) {
      const first = atlas.terrain.points[river.pointIndices[0] ?? -1];
      if (first === undefined) continue;
      const [startX, startY] = this.atlasPoint(first);
      waterInk.moveTo(startX, startY);
      for (const pointIndex of river.pointIndices.slice(1)) {
        const point = atlas.terrain.points[pointIndex];
        if (point === undefined) continue;
        const [x, y] = this.atlasPoint(point);
        waterInk.lineTo(x, y);
      }
      waterInk.stroke({ color: 0x4f7380, width: Math.min(1.7, 0.55 + river.flux / 42), alpha: 0.92 });
    }
    waterInk.rect(48, 33, 224, 124).stroke({ color: 0x5f503d, width: 1.1, alpha: 0.92 });
    waterInk.rect(46, 31, 228, 128).stroke({ color: 0xd5c292, width: 0.7, alpha: 0.55 });
    layer.addChild(waterInk);
    return layer;
  }

  private atlasRoad(edge: AtlasEdge, atlas: AtlasState, ink: Graphics, selected: boolean): void {
    const first = atlas.terrain.points[edge.pathPointIndices[0] ?? -1];
    if (first === undefined) return;
    const [startX, startY] = this.atlasPoint(first);
    ink.moveTo(startX, startY);
    for (const pointIndex of edge.pathPointIndices.slice(1)) {
      const point = atlas.terrain.points[pointIndex];
      if (point === undefined) continue;
      const [x, y] = this.atlasPoint(point);
      ink.lineTo(x, y);
    }
    ink.stroke({
      color: selected ? 0x803d42 : edge.terrain === "pass" ? 0x625b52 : 0x786750,
      width: selected ? 2.2 : edge.terrain === "road" ? 1.15 : 0.75,
      alpha: selected ? 1 : 0.72,
    });
    for (const crossingPointIndex of edge.crossingPointIndices) {
      const crossing = atlas.terrain.points[crossingPointIndex];
      if (crossing === undefined) continue;
      const [x, y] = this.atlasPoint(crossing);
      ink.moveTo(x - 1.6, y - 1).lineTo(x + 1.6, y + 1).stroke({ color: 0xe5d3a5, width: 1.4, alpha: 0.95 });
    }
  }

  private drawAtlas(state: WorldState, palette: readonly [number, number, number]): void {
    const atlas = state.depth.atlas;
    if (this.atlasStaticLayer === null || this.atlasStaticSignature !== atlas.terrain.signature) {
      this.atlasStaticLayer?.destroy({ children: true });
      this.atlasStaticLayer = this.buildAtlasStaticLayer(atlas);
      this.atlasStaticSignature = atlas.terrain.signature;
    }
    this.worldLayer.addChild(this.atlasStaticLayer);
    const point = (locationId: string): readonly [number, number] => {
      const location = atlas.locations.find((candidate) => candidate.id === locationId);
      return location === undefined ? [160, 90] : this.atlasPoint(location);
    };
    const routeEdges = new Set<string>();
    if (atlas.route !== null) {
      for (let index = 0; index < atlas.route.path.length - 1; index += 1) {
        const left = atlas.route.path[index];
        const right = atlas.route.path[index + 1];
        if (left !== undefined && right !== undefined) {
          routeEdges.add(left < right ? `${left}~${right}` : `${right}~${left}`);
        }
      }
    }
    const roadInk = new Graphics();
    for (const edge of atlas.edges) {
      const selected = routeEdges.has(edge.id);
      const known = atlas.discoveredLocationIds.includes(edge.from) && atlas.discoveredLocationIds.includes(edge.to);
      if (known || selected) this.atlasRoad(edge, atlas, roadInk, selected);
    }
    this.worldLayer.addChild(roadInk);
    const labelBounds: Array<{ left: number; right: number; top: number; bottom: number }> = [];
    for (const location of atlas.locations) {
      if (!atlas.discoveredLocationIds.includes(location.id) && location.id !== atlas.route?.destinationId) continue;
      const [x, y] = point(location.id);
      const discovered = atlas.discoveredLocationIds.includes(location.id);
      if (!discovered) {
        this.worldLayer.addChild(new Graphics().poly([x, y - 3.5, x + 3.5, y, x, y + 3.5, x - 3.5, y]).fill({ color: 0x756e62, alpha: 0.72 }));
        this.worldLayer.addChild(circle(x, y, 1.1, 0xe4d5ac, 0.92));
      }
      const color =
        location.kind === "town"
          ? 0x8b4b46
          : location.kind === "dungeon"
            ? 0x433d57
            : location.kind === "landmark"
              ? 0xb58a46
              : palette[1];
      if (!discovered) {
        // Mapped waypoints reveal a route and name, but not the unvisited site's type.
      } else if (location.kind === "town") {
        this.worldLayer.addChild(rect(x - 2.5, y - 1.5, 5, 4, color, discovered ? 1 : 0.4));
        this.worldLayer.addChild(new Graphics().poly([x - 3.5, y - 1.5, x, y - 5, x + 3.5, y - 1.5]).fill({ color, alpha: discovered ? 1 : 0.4 }));
      } else if (location.kind === "dungeon") {
        this.worldLayer.addChild(new Graphics().moveTo(x - 3, y + 3).lineTo(x - 3, y).quadraticCurveTo(x, y - 5, x + 3, y).lineTo(x + 3, y + 3).closePath().fill({ color, alpha: discovered ? 1 : 0.4 }));
      } else if (location.kind === "landmark") {
        this.worldLayer.addChild(new Graphics().poly([x, y - 4, x + 1.2, y - 1.2, x + 4, y, x + 1.2, y + 1.2, x, y + 4, x - 1.2, y + 1.2, x - 4, y, x - 1.2, y - 1.2]).fill({ color, alpha: discovered ? 1 : 0.4 }));
      } else {
        this.worldLayer.addChild(circle(x, y, 2.2, color, discovered ? 1 : 0.4));
      }
      const labelText = location.name;
      const labelWidth = Math.min(48, Math.max(16, labelText.length * 3.15));
      const placements = location.id === atlas.currentLocationId
        ? [{ x: x + 6, y: y - 3, anchorX: 0 }, { x, y: y + 5, anchorX: 0.5 }]
        : [{ x, y: y + 4.5, anchorX: 0.5 }, { x, y: y - 10, anchorX: 0.5 }, { x: x + 5, y: y - 3, anchorX: 0 }];
      const placement = placements.find((candidate) => {
        const left = candidate.x - labelWidth * candidate.anchorX;
        const bounds = { left, right: left + labelWidth, top: candidate.y, bottom: candidate.y + 6.5 };
        return left >= 49 && bounds.right <= 271 && bounds.top >= 34 && bounds.bottom <= 157 &&
          !labelBounds.some((existing) => bounds.left < existing.right && bounds.right > existing.left && bounds.top < existing.bottom && bounds.bottom > existing.top);
      });
      if (placement !== undefined) {
        const label = new Text({ text: labelText, style: { fontFamily: "Georgia, serif", fontSize: discovered ? 6 : 5.5, fill: discovered ? 0x3c3329 : 0x625c51, fontStyle: discovered ? "normal" : "italic", fontWeight: "600" } });
        label.anchor.set(placement.anchorX, 0);
        label.position.set(placement.x, placement.y);
        this.worldLayer.addChild(label);
        const left = placement.x - labelWidth * placement.anchorX;
        labelBounds.push({ left, right: left + labelWidth, top: placement.y, bottom: placement.y + 6.5 });
      }
    }
    let [partyX, partyY] = point(atlas.currentLocationId);
    const projection = projectRoute(atlas);
    if (projection !== null) {
      [partyX, partyY] = this.atlasPoint({ x: projection.terrainX, y: projection.terrainY });
    }
    this.lightLayer.addChild(circle(partyX, partyY, 3.6, palette[2]));
    this.lightLayer.addChild(circle(partyX, partyY, 7.5, palette[2], 0.2));
    this.lightLayer.addChild(new Graphics().circle(partyX, partyY, 5.2).stroke({ color: 0x5d3038, width: 1, alpha: 0.95 }));
  }

  private drawTravelSilhouette(corridor: TravelCorridor, visual: TravelBiomeVisual): void {
    const density = Math.round(3 + Math.max(0, Math.min(1, corridor.moisture)) * 7);
    const horizon = new Graphics();
    switch (visual.silhouette) {
      case "waves":
        for (let index = 0; index < 8; index += 1) horizon.moveTo(index * 46 - 15, 112 + index % 2 * 5).quadraticCurveTo(index * 46 + 7, 105, index * 46 + 29, 112);
        horizon.stroke({ color: visual.accent, width: 2, alpha: 0.62 });
        break;
      case "cliffs":
        horizon.poly([0, 123, 0, 87, 35, 91, 48, 108, 88, 113, 102, 123]).fill(visual.groundDark);
        horizon.poly([224, 123, 244, 106, 267, 101, 279, 82, 320, 89, 320, 123]).fill(visual.groundDark);
        break;
      case "grass":
        for (let index = 0; index < density * 3; index += 1) {
          const x = 8 + (index * 37) % 310;
          const height = 3 + (index % 4);
          horizon.moveTo(x, 124).lineTo(x - 1, 124 - height);
        }
        horizon.stroke({ color: visual.accent, width: 1, alpha: 0.8 });
        break;
      case "trees":
      case "jungle":
        for (let index = 0; index < density; index += 1) {
          const x = 8 + (index * 53) % 304;
          const height = visual.silhouette === "jungle" ? 19 + index % 10 : 13 + index % 8;
          horizon.rect(x, 116 - height, 3, height + 8).fill(visual.groundDark);
          horizon.circle(x + 1.5, 114 - height, visual.silhouette === "jungle" ? 9 : 7).fill(visual.horizon);
          if (visual.silhouette === "jungle") horizon.circle(x + 8, 118 - height, 6).fill(visual.horizon);
        }
        break;
      case "dunes":
        horizon.moveTo(0, 123).bezierCurveTo(48, 78, 99, 119, 151, 103).bezierCurveTo(210, 84, 256, 119, 320, 91).lineTo(320, 126).lineTo(0, 126).closePath().fill(visual.horizon);
        break;
      case "scrub":
        for (let index = 0; index < density; index += 1) {
          const x = 13 + (index * 61) % 296;
          horizon.moveTo(x, 124).lineTo(x + 3, 116).moveTo(x, 120).lineTo(x - 4, 117).moveTo(x + 1, 121).lineTo(x + 6, 118);
        }
        horizon.stroke({ color: visual.accent, width: 1.5, alpha: 0.72 });
        break;
      case "peaks":
      case "snow":
        horizon.poly([0, 124, 31, 91, 52, 110, 86, 72, 123, 113, 158, 79, 191, 110, 232, 66, 275, 109, 302, 83, 320, 103, 320, 124]).fill(visual.horizon);
        if (visual.silhouette === "snow") {
          horizon.poly([68, 91, 86, 72, 101, 89, 91, 86, 85, 94, 79, 85]).fill(visual.accent);
          horizon.poly([215, 82, 232, 66, 249, 84, 238, 79, 231, 87, 225, 78]).fill(visual.accent);
        }
        break;
      case "reeds":
        for (let index = 0; index < density * 2; index += 1) {
          const x = 5 + (index * 43) % 314;
          horizon.moveTo(x, 127).lineTo(x + index % 3 - 1, 107 + index % 9);
          horizon.circle(x + index % 3 - 1, 106 + index % 9, 1.4);
        }
        horizon.stroke({ color: visual.accent, width: 1.2, alpha: 0.78 });
        break;
    }
    this.worldLayer.addChild(horizon);
  }

  private drawTravel(state: WorldState, palette: readonly [number, number, number]): void {
    const latestLeg = state.forwardMotion.recentLegs.at(-1) ?? null;
    const arrival = latestLeg?.arrivedTick === state.tick ? latestLeg : null;
    const corridor = projectTravelCorridor(state.depth.atlas, arrival);
    if (corridor === null) {
      this.worldLayer.addChild(rect(0, 118, designWidth, 62, 0x304c3f));
      this.drawHero(state, 160, 142, palette);
      return;
    }

    this.host.dataset.travelEdge = corridor.projection.edgeId;
    this.host.dataset.travelDirection = corridor.direction;
    this.host.dataset.travelBiome = corridor.biome;
    this.host.dataset.travelTerrain = corridor.edgeTerrain;
    this.host.dataset.travelSlope = corridor.slope;
    this.host.dataset.travelCrossing = corridor.crossing?.phase ?? "none";
    this.host.dataset.travelProgress = corridor.projection.legRatio.toFixed(4);

    const visual = travelBiomeVisuals[corridor.biome];
    const lookaheadVisual = travelBiomeVisuals[corridor.lookaheadBiome];
    this.worldLayer.addChild(rect(0, 0, designWidth, 105, visual.sky));
    this.worldLayer.addChild(rect(0, 83, designWidth, 43, visual.horizon));
    if (corridor.lookaheadBiome !== corridor.biome) {
      this.worldLayer.addChild(new Graphics().poly([244, 83, 320, 83, 320, 130, 276, 125]).fill({ color: lookaheadVisual.horizon, alpha: 0.72 }));
    }
    this.worldLayer.addChild(rect(0, 121, designWidth, 59, visual.ground));
    this.drawTravelSilhouette(corridor, visual);

    const roadWidth = { road: 25, trail: 12, pass: 19, river: 22 }[corridor.edgeTerrain];
    const roadColor = { road: 0x9c7a55, trail: 0x756049, pass: 0x6c6961, river: 0x735f4e }[corridor.edgeTerrain];
    const roadDark = { road: 0x6d533d, trail: 0x514336, pass: 0x4c4c49, river: 0x4d443c }[corridor.edgeTerrain];
    const vanishingX = 160 + corridor.curve * 34;
    const pathRise = Math.max(-8, Math.min(8, corridor.signedSlope * 2_800));
    const pathStartY = 150 + pathRise / 2;
    const pathEndY = 150 - pathRise / 2;
    this.worldLayer.addChild(new Graphics().poly([
      vanishingX - 2, 96,
      vanishingX + 2, 96,
      54 + roadWidth, pathStartY + 4,
      54 - roadWidth, pathStartY + 4,
    ]).fill(roadColor));
    this.worldLayer.addChild(new Graphics().poly([
      24, pathStartY - roadWidth * 0.28,
      296, pathEndY - roadWidth * 0.28,
      296, pathEndY + roadWidth * 0.28,
      24, pathStartY + roadWidth * 0.28,
    ]).fill(roadColor));

    if (corridor.edgeTerrain === "road") {
      const ruts = new Graphics()
        .moveTo(27, pathStartY - 3).lineTo(294, pathEndY - 3)
        .moveTo(27, pathStartY + 3).lineTo(294, pathEndY + 3)
        .stroke({ color: roadDark, width: 1.2, alpha: 0.72 });
      this.worldLayer.addChild(ruts);
    } else if (corridor.edgeTerrain === "trail") {
      const trail = new Graphics();
      for (let index = 0; index < 12; index += 1) {
        const left = 31 + index * 22;
        const right = left + 11;
        const leftY = pathStartY + (pathEndY - pathStartY) * ((left - 24) / 272);
        const rightY = pathStartY + (pathEndY - pathStartY) * ((right - 24) / 272);
        trail.moveTo(left, leftY).lineTo(right, rightY);
      }
      trail.stroke({ color: roadDark, width: 1.5, alpha: 0.75 });
      this.worldLayer.addChild(trail);
    } else if (corridor.edgeTerrain === "pass") {
      for (let index = 0; index < 10; index += 1) {
        const x = 31 + index * 29;
        const y = pathStartY + (pathEndY - pathStartY) * ((x - 24) / 272) + (index % 2 === 0 ? -9 : 8);
        this.worldLayer.addChild(new Graphics().poly([x - 4, y + 3, x - 2, y - 2, x + 3, y - 4, x + 5, y + 3]).fill(roadDark));
      }
    } else {
      for (let index = 0; index < 7; index += 1) {
        const x = 42 + index * 39;
        const y = pathStartY + (pathEndY - pathStartY) * ((x - 24) / 272) + (index % 2 === 0 ? 2 : -2);
        this.worldLayer.addChild(new Graphics().ellipse(x, y, 7, 1.8).fill({ color: 0x526b6a, alpha: 0.52 }));
      }
    }

    const legRatio = corridor.projection.legRatio;
    const heroX = projectTravelHeroX(legRatio);
    const heroSurfaceY = pathStartY + (pathEndY - pathStartY) * ((heroX - 24) / 272);
    if (corridor.crossing !== null) {
      const visibleExtent = Math.max(1, ...corridor.nearby.map((sample) => Math.abs(sample.offset)));
      const crossingX = Math.max(31, Math.min(289, heroX + (corridor.crossing.offset / visibleExtent) * 92));
      const crossingSurfaceY = pathStartY + (pathEndY - pathStartY) * ((crossingX - 24) / 272);
      const waterWidth = 8 + Math.max(0, Math.min(10, Math.log2(Math.max(1, corridor.crossing.flux + 1)) * 1.5));
      this.worldLayer.addChild(new Graphics().poly([
        crossingX - waterWidth, crossingSurfaceY - 12,
        crossingX + waterWidth, crossingSurfaceY - 12,
        crossingX + waterWidth + 5, crossingSurfaceY + 12,
        crossingX - waterWidth - 5, crossingSurfaceY + 12,
      ]).fill({ color: 0x4e8292, alpha: 0.86 }));
      this.worldLayer.addChild(new Graphics().moveTo(crossingX - waterWidth, crossingSurfaceY - 4).lineTo(crossingX + waterWidth, crossingSurfaceY - 4).stroke({ color: 0x9dc1c1, width: 1, alpha: 0.7 }));
    }

    for (let step = 0; step < 3; step += 1) {
      const trailX = Math.max(28, heroX - 13 - step * 12);
      const trailY = pathStartY + (pathEndY - pathStartY) * ((trailX - 24) / 272);
      this.worldLayer.addChild(circle(trailX, trailY - 1, 1.2, visual.accent, 0.2 + step * 0.08));
    }
    this.drawHero(state, heroX, heroSurfaceY - 15, palette);

    const route = state.depth.atlas.route;
    const routeRatio = corridor.projection.routeRatio;
    this.worldLayer.addChild(rect(56, 169, 208, 3, visual.groundDark, 0.78));
    this.worldLayer.addChild(rect(56, 169, 208 * routeRatio, 3, palette[2], 0.9));
    for (let index = 0; index < (route?.path.length ?? 2); index += 1) {
      const x = 56 + (208 * index) / Math.max(1, (route?.path.length ?? 2) - 1);
      this.worldLayer.addChild(circle(x, 170.5, 3, index <= (route?.legIndex ?? 1) ? palette[2] : 0x5a655f));
    }
    const sceneLabel = new Text({
      text: `${corridor.biome.toUpperCase()} · ${corridor.edgeTerrain.toUpperCase()} · ${corridor.slope.toUpperCase()}`,
      style: { fontFamily: "ui-monospace, monospace", fontSize: 6, fill: 0xf4ead5, fontWeight: "700", letterSpacing: 0.7 },
    });
    sceneLabel.position.set(9, 9);
    this.worldLayer.addChild(rect(6, 6, sceneLabel.width + 8, 12, 0x17212e, 0.68));
    this.worldLayer.addChild(sceneLabel);
  }

  private drawDungeon(state: WorldState, palette: readonly [number, number, number]): void {
    this.worldLayer.addChild(rect(34, 19, 252, 142, 0x0b1117));
    const dungeon = state.depth.dungeon;
    if (dungeon === null) {
      this.lightLayer.addChild(circle(160, 92, 42, palette[2], 0.08));
      this.drawHero(state, 160, 103, palette);
      return;
    }
    const areaX = 44;
    const areaY = 24;
    const cellSize = Math.min(232 / dungeon.width, 132 / dungeon.height);
    const offsetX = areaX + (232 - dungeon.width * cellSize) / 2;
    const offsetY = areaY + (132 - dungeon.height * cellSize) / 2;
    const discovered = new Set(dungeon.discoveredCellIds);
    const visited = new Set(dungeon.visitedCellIds);
    const cellsById = new Map(dungeon.cells.map((cell) => [cell.id, cell]));
    const traps = projectDungeonTraps(dungeon);
    const trapsByCell = new Map(traps.map((trap) => [trap.cellId, trap]));
    const currentKnownTrap = traps.find((trap) => trap.current);
    const triggeredTrap = currentKnownTrap?.status === "triggered" && state.scene.sensoryIntensity >= 3 ? currentKnownTrap : undefined;
    const detectedTrap = currentKnownTrap?.status === "armed" && state.scene.sensoryIntensity >= 2 ? currentKnownTrap : undefined;
    const disarmedTrap = currentKnownTrap?.status === "disarmed" && state.scene.sensoryIntensity >= 2 ? currentKnownTrap : undefined;
    const hazardBeat = triggeredTrap ?? detectedTrap ?? disarmedTrap;
    const wayfinding = projectDungeonWayfinding(dungeon);
    const keyGate = projectDungeonKeyGate(dungeon);
    const sightedKeyMove = projectDungeonMoveKnowledge(dungeon).find((move) => move.sightedWayfinderKey);
    this.host.dataset.dungeonArmedTraps = String(traps.filter((trap) => trap.status === "armed").length);
    this.host.dataset.dungeonDisarmedTraps = String(traps.filter((trap) => trap.status === "disarmed").length);
    this.host.dataset.dungeonTriggeredTraps = String(traps.filter((trap) => trap.status === "triggered").length);
    this.host.dataset.dungeonSpentTraps = String(traps.filter((trap) => trap.status !== "armed").length);
    this.host.dataset.dungeonTraversalMode = wayfinding.mode;
    this.host.dataset.dungeonBreadcrumbLength = String(Math.max(0, wayfinding.routeCellIds.length - 1));
    this.host.dataset.dungeonNextDirections = wayfinding.nextPassageDirections.join(",");
    if (keyGate?.key !== null && keyGate?.key !== undefined) this.host.dataset.dungeonKeyStatus = keyGate.key.status;
    if (keyGate?.gate !== null && keyGate?.gate !== undefined) this.host.dataset.dungeonGateStatus = keyGate.gate.status;
    if (sightedKeyMove !== undefined) {
      this.host.dataset.dungeonVisibleObjective = "wayfinder-key";
      this.host.dataset.dungeonVisibleObjectiveDirection = sightedKeyMove.direction;
    }
    if (wayfinding.frontierCellId !== null) this.host.dataset.dungeonFrontierCell = wayfinding.frontierCellId;
    this.host.dataset.dungeonTrap = triggeredTrap === undefined
      ? currentKnownTrap !== undefined
        ? currentKnownTrap.status
        : traps.some((trap) => trap.status === "armed")
          ? "armed"
          : "none"
      : "triggered";
    if (hazardBeat !== undefined) {
      this.host.dataset.dungeonTrapCell = hazardBeat.cellId;
      this.host.dataset.dungeonTrapKind = hazardBeat.kind;
      this.host.dataset.dungeonTrapResult = state.scene.consequence;
    }
    const discoveredCells = dungeon.cells.filter((cell) => discovered.has(cell.id));
    for (const cell of discoveredCells) {
      const x = offsetX + cell.x * cellSize;
      const y = offsetY + cell.y * cellSize;
      this.worldLayer.addChild(
        rect(x + 1, y + 1, cellSize - 2, cellSize - 2, visited.has(cell.id) ? 0x37444a : 0x202a31),
      );
    }

    const routeCells = wayfinding.routeCellIds.flatMap((cellId) => {
      const cell = cellsById.get(cellId);
      return cell === undefined ? [] : [{ x: offsetX + (cell.x + 0.5) * cellSize, y: offsetY + (cell.y + 0.5) * cellSize }];
    });
    if (routeCells.length > 1) {
      const routeLine = new Graphics();
      const first = routeCells[0];
      if (first !== undefined) routeLine.moveTo(first.x, first.y);
      for (const point of routeCells.slice(1)) routeLine.lineTo(point.x, point.y);
      const routeColor = wayfinding.mode === "return-to-gate" ? 0xf0b84b : 0x78b7a4;
      routeLine.stroke({ color: routeColor, width: Math.max(0.9, cellSize * 0.1), alpha: hazardBeat === undefined ? 0.74 : 0.22 });
      this.worldLayer.addChild(routeLine);
      const beacons = new Graphics();
      for (let index = 0; index < routeCells.length - 1; index += 1) {
        const from = routeCells[index];
        const to = routeCells[index + 1];
        if (from === undefined || to === undefined) continue;
        for (const ratio of [0.28, 0.52, 0.76]) {
          beacons.circle(from.x + (to.x - from.x) * ratio, from.y + (to.y - from.y) * ratio, Math.max(0.65, cellSize * 0.055));
        }
      }
      beacons.fill({ color: wayfinding.mode === "return-to-gate" ? 0xffd166 : 0xd8e2b7, alpha: hazardBeat === undefined ? 0.88 : 0.3 });
      this.worldLayer.addChild(beacons);
    }

    if (sightedKeyMove !== undefined) {
      const currentCell = cellsById.get(dungeon.currentCellId);
      const keyCell = cellsById.get(sightedKeyMove.destinationCellId);
      if (currentCell !== undefined && keyCell !== undefined) {
        const fromX = offsetX + (currentCell.x + 0.5) * cellSize;
        const fromY = offsetY + (currentCell.y + 0.5) * cellSize;
        const toX = offsetX + (keyCell.x + 0.5) * cellSize;
        const toY = offsetY + (keyCell.y + 0.5) * cellSize;
        const vectorX = toX - fromX;
        const vectorY = toY - fromY;
        const startX = fromX + vectorX * 0.22;
        const startY = fromY + vectorY * 0.22;
        const endX = fromX + vectorX * 0.76;
        const endY = fromY + vectorY * 0.76;
        const length = Math.max(1, Math.hypot(vectorX, vectorY));
        const unitX = vectorX / length;
        const unitY = vectorY / length;
        const wing = Math.max(1.4, cellSize * 0.18);
        const passageCue = new Graphics()
          .moveTo(startX, startY)
          .lineTo(endX, endY)
          .moveTo(endX, endY)
          .lineTo(endX - unitX * wing - unitY * wing * 0.62, endY - unitY * wing + unitX * wing * 0.62)
          .moveTo(endX, endY)
          .lineTo(endX - unitX * wing + unitY * wing * 0.62, endY - unitY * wing - unitX * wing * 0.62)
          .stroke({ color: 0xffd166, width: Math.max(1.2, cellSize * 0.12), alpha: 0.98 });
        this.lightLayer.addChild(circle(endX, endY, Math.max(2.2, cellSize * 0.24), 0xf0b84b, 0.16));
        this.worldLayer.addChild(passageCue);
      }
    }

    if (discovered.has(dungeon.exitCellId)) {
      const exit = cellsById.get(dungeon.exitCellId);
      if (exit !== undefined) {
        const x = offsetX + (exit.x + 0.24) * cellSize;
        const y = offsetY + (exit.y + 0.24) * cellSize;
        const size = cellSize * 0.52;
        const stair = new Graphics().rect(x, y, size, size).stroke({
          color: 0x8fc9e6,
          width: Math.max(1, cellSize * 0.09),
          alpha: 0.96,
        });
        stair.rect(x + size * 0.18, y + size * 0.18, size * 0.64, size * 0.64).stroke({
          color: 0x426d84,
          width: Math.max(0.7, cellSize * 0.055),
          alpha: 0.9,
        });
        this.worldLayer.addChild(stair);
      }
    }

    const maze = new Graphics();
    for (const cell of discoveredCells) {
      const x = offsetX + cell.x * cellSize;
      const y = offsetY + cell.y * cellSize;
      const trap = trapsByCell.get(cell.id);
      if (trap !== undefined) {
        const centerX = x + cellSize / 2;
        const centerY = y + cellSize / 2;
        const radius = Math.max(1.5, cellSize * 0.17);
        if (triggeredTrap?.cellId === cell.id) {
          const burst = new Graphics();
          for (let ray = 0; ray < 8; ray += 1) {
            const angle = ray * Math.PI / 4;
            burst.moveTo(centerX + Math.cos(angle) * radius * 0.7, centerY + Math.sin(angle) * radius * 0.7);
            burst.lineTo(centerX + Math.cos(angle) * radius * 2.3, centerY + Math.sin(angle) * radius * 2.3);
          }
          burst.stroke({ color: 0xffc857, width: Math.max(1, cellSize * 0.11), alpha: 0.96 });
          this.worldLayer.addChild(burst);
          this.worldLayer.addChild(circle(centerX, centerY, radius * 1.2, 0xb93f46, 0.95));
          this.worldLayer.addChild(new Graphics().poly([
            centerX, centerY - radius,
            centerX + radius, centerY,
            centerX, centerY + radius,
            centerX - radius, centerY,
          ]).stroke({ color: 0xffe19a, width: Math.max(1, cellSize * 0.08) }));
        } else if (trap.status === "armed") {
          const glyph = new Graphics();
          if (trap.kind === "tripwire") {
            glyph.poly([
              centerX, centerY - radius,
              centerX + radius, centerY,
              centerX, centerY + radius,
              centerX - radius, centerY,
            ]).fill({ color: 0xa64b4b, alpha: 0.96 });
            glyph.moveTo(centerX - radius * 0.75, centerY - radius * 0.35).lineTo(centerX + radius * 0.75, centerY + radius * 0.35);
            glyph.moveTo(centerX - radius * 0.75, centerY + radius * 0.35).lineTo(centerX + radius * 0.75, centerY - radius * 0.35);
          } else {
            glyph.circle(centerX, centerY, radius).fill({ color: 0x714c82, alpha: 0.96 });
            glyph.poly([
              centerX, centerY - radius * 0.72,
              centerX + radius * 0.62, centerY + radius * 0.36,
              centerX - radius * 0.62, centerY + radius * 0.36,
            ]);
            glyph.moveTo(centerX, centerY - radius * 0.72).lineTo(centerX, centerY + radius * 0.65);
          }
          glyph.stroke({ color: 0xffd39a, width: Math.max(0.8, cellSize * 0.07) });
          this.worldLayer.addChild(glyph);
        } else if (trap.status === "disarmed") {
          const safe = new Graphics().rect(centerX - radius, centerY - radius, radius * 2, radius * 2).stroke({ color: 0x83b99a, width: Math.max(0.8, cellSize * 0.075), alpha: 0.86 });
          safe.moveTo(centerX - radius * 0.7, centerY).lineTo(centerX - radius * 0.18, centerY + radius * 0.52).lineTo(centerX + radius * 0.78, centerY - radius * 0.58);
          safe.stroke({ color: 0xcce8c9, width: Math.max(0.9, cellSize * 0.08), alpha: 0.9 });
          this.worldLayer.addChild(safe);
        } else {
          const sprung = new Graphics().circle(centerX, centerY, radius).stroke({ color: 0x765b5d, width: Math.max(0.8, cellSize * 0.07), alpha: 0.62 });
          sprung.moveTo(centerX - radius, centerY + radius * 0.65).lineTo(centerX - radius * 0.1, centerY - radius * 0.08);
          sprung.moveTo(centerX + radius * 0.15, centerY + radius * 0.12).lineTo(centerX + radius, centerY - radius * 0.65);
          sprung.stroke({ color: 0x9c7772, width: Math.max(0.8, cellSize * 0.08), alpha: 0.65 });
          this.worldLayer.addChild(sprung);
        }
      } else if (cell.feature !== "empty" && cell.feature !== "trap") {
        const featureColor =
          cell.feature === "treasure"
            ? 0xd7b35c
            : cell.feature === "shrine"
                ? 0x6ba3b8
                : 0x765083;
        this.worldLayer.addChild(circle(x + cellSize / 2, y + cellSize / 2, Math.max(1.2, cellSize * 0.12), featureColor));
      }
      if (!cell.exits.includes("north")) maze.moveTo(x, y).lineTo(x + cellSize, y);
      if (!cell.exits.includes("west")) maze.moveTo(x, y).lineTo(x, y + cellSize);
      if (!cell.exits.includes("east")) maze.moveTo(x + cellSize, y).lineTo(x + cellSize, y + cellSize);
      if (!cell.exits.includes("south")) maze.moveTo(x, y + cellSize).lineTo(x + cellSize, y + cellSize);
    }
    maze.stroke({ color: palette[1], width: Math.max(1, cellSize * 0.12) });
    this.worldLayer.addChild(maze);

    if (keyGate?.key !== null && keyGate?.key !== undefined) {
      const keyCell = cellsById.get(keyGate.key.cellId);
      if (keyCell !== undefined && keyGate.key.status === "sighted") {
        const centerX = offsetX + (keyCell.x + 0.5) * cellSize;
        const centerY = offsetY + (keyCell.y + 0.5) * cellSize;
        const radius = Math.max(1.3, cellSize * 0.12);
        const key = new Graphics().circle(centerX - radius * 0.65, centerY, radius).stroke({ color: 0xffd166, width: Math.max(0.9, cellSize * 0.08) });
        key.moveTo(centerX + radius * 0.3, centerY).lineTo(centerX + radius * 2.3, centerY);
        key.lineTo(centerX + radius * 2.3, centerY + radius * 0.8);
        key.moveTo(centerX + radius * 1.45, centerY).lineTo(centerX + radius * 1.45, centerY + radius * 0.65);
        key.stroke({ color: 0xffd166, width: Math.max(0.9, cellSize * 0.08) });
        this.worldLayer.addChild(circle(centerX, centerY, radius * 2.7, 0xf0b84b, 0.12));
        this.worldLayer.addChild(key);
      }
    }

    if (keyGate?.gate !== null && keyGate?.gate !== undefined) {
      const gateCell = cellsById.get(keyGate.gate.unlockCellId);
      if (gateCell !== undefined) {
        const vector = mazeDirectionVector[keyGate.gate.direction];
        const perpendicularX = -vector[1];
        const perpendicularY = vector[0];
        const centerX = offsetX + (gateCell.x + 0.5) * cellSize + vector[0] * cellSize * 0.5;
        const centerY = offsetY + (gateCell.y + 0.5) * cellSize + vector[1] * cellSize * 0.5;
        const half = cellSize * 0.39;
        const gate = new Graphics();
        if (keyGate.gate.status === "locked") {
          gate.moveTo(centerX - perpendicularX * half, centerY - perpendicularY * half)
            .lineTo(centerX + perpendicularX * half, centerY + perpendicularY * half);
          for (const offset of [-0.22, 0, 0.22]) {
            const barX = centerX + perpendicularX * cellSize * offset;
            const barY = centerY + perpendicularY * cellSize * offset;
            gate.moveTo(barX - vector[0] * cellSize * 0.17, barY - vector[1] * cellSize * 0.17)
              .lineTo(barX + vector[0] * cellSize * 0.17, barY + vector[1] * cellSize * 0.17);
          }
          gate.stroke({ color: 0xd39b48, width: Math.max(1.1, cellSize * 0.11), alpha: 0.98 });
        } else {
          for (const side of [-1, 1]) {
            const outerX = centerX + perpendicularX * half * side;
            const outerY = centerY + perpendicularY * half * side;
            const innerX = centerX + perpendicularX * half * 0.52 * side;
            const innerY = centerY + perpendicularY * half * 0.52 * side;
            gate.moveTo(outerX, outerY).lineTo(innerX, innerY);
          }
          gate.stroke({ color: 0x8fd1aa, width: Math.max(1, cellSize * 0.09), alpha: 0.92 });
          this.lightLayer.addChild(circle(centerX, centerY, Math.max(2.4, cellSize * 0.28), 0x8fd1aa, 0.14));
        }
        this.worldLayer.addChild(gate);
      }
    }

    if (wayfinding.frontierCellId !== null) {
      const frontier = cellsById.get(wayfinding.frontierCellId);
      if (frontier !== undefined) {
        const x = offsetX + frontier.x * cellSize;
        const y = offsetY + frontier.y * cellSize;
        const inset = Math.max(1.6, cellSize * 0.12);
        const corner = Math.max(2, Math.min(6, cellSize * 0.26));
        const brackets = new Graphics();
        brackets.moveTo(x + inset, y + inset + corner).lineTo(x + inset, y + inset).lineTo(x + inset + corner, y + inset);
        brackets.moveTo(x + cellSize - inset - corner, y + inset).lineTo(x + cellSize - inset, y + inset).lineTo(x + cellSize - inset, y + inset + corner);
        brackets.moveTo(x + inset, y + cellSize - inset - corner).lineTo(x + inset, y + cellSize - inset).lineTo(x + inset + corner, y + cellSize - inset);
        brackets.moveTo(x + cellSize - inset - corner, y + cellSize - inset).lineTo(x + cellSize - inset, y + cellSize - inset).lineTo(x + cellSize - inset, y + cellSize - inset - corner);
        brackets.stroke({ color: 0x9fd5bd, width: Math.max(0.9, cellSize * 0.075), alpha: hazardBeat === undefined ? 0.9 : 0.34 });
        this.worldLayer.addChild(brackets);
      }
    }

    const passageAnchorId = wayfinding.mode === "explore" ? wayfinding.frontierCellId : dungeon.currentCellId;
    const passageAnchor = passageAnchorId === null ? undefined : cellsById.get(passageAnchorId);
    const passageDirections = wayfinding.nextPassageDirections;
    if (passageAnchor !== undefined && passageDirections.length > 0) {
      const arrows = new Graphics();
      const centerX = offsetX + (passageAnchor.x + 0.5) * cellSize;
      const centerY = offsetY + (passageAnchor.y + 0.5) * cellSize;
      for (const direction of passageDirections) {
        const vector = mazeDirectionVector[direction];
        const perpendicularX = -vector[1];
        const perpendicularY = vector[0];
        const tipX = centerX + vector[0] * cellSize * 0.43;
        const tipY = centerY + vector[1] * cellSize * 0.43;
        const tailX = centerX + vector[0] * cellSize * 0.24;
        const tailY = centerY + vector[1] * cellSize * 0.24;
        arrows.moveTo(tailX + perpendicularX * cellSize * 0.1, tailY + perpendicularY * cellSize * 0.1)
          .lineTo(tipX, tipY)
          .lineTo(tailX - perpendicularX * cellSize * 0.1, tailY - perpendicularY * cellSize * 0.1);
      }
      arrows.stroke({ color: wayfinding.mode === "explore" ? 0xffd166 : 0xa8dbc7, width: Math.max(1, cellSize * 0.09), alpha: hazardBeat === undefined ? 0.96 : 0.38 });
      this.worldLayer.addChild(arrows);
    }

    const current = cellsById.get(dungeon.currentCellId);
    if (current !== undefined) {
      const x = offsetX + (current.x + 0.5) * cellSize;
      const y = offsetY + (current.y + 0.5) * cellSize;
      this.lightLayer.addChild(circle(x, y, Math.max(2.5, cellSize * 0.24), palette[2]));
      this.lightLayer.addChild(circle(x, y, Math.max(5, cellSize * 0.5), palette[2], 0.13));
      this.drawHero(state, x, y + cellSize * 0.05, palette, Math.max(0.13, Math.min(0.58, cellSize / 48)));
      this.host.dataset.dungeonHeroCell = current.id;
      if (keyGate?.key?.status === "carried") {
        const carriedX = x + Math.max(2.2, cellSize * 0.28);
        const carriedY = y - Math.max(2.2, cellSize * 0.28);
        this.lightLayer.addChild(circle(carriedX, carriedY, Math.max(1.2, cellSize * 0.1), 0xffd166));
        this.lightLayer.addChild(new Graphics().moveTo(carriedX + cellSize * 0.08, carriedY).lineTo(carriedX + cellSize * 0.22, carriedY).stroke({ color: 0xffd166, width: Math.max(0.8, cellSize * 0.06) }));
      }
    }
    const latestDungeonMessage = state.depth.log.at(-1)?.category === "dungeon" ? state.depth.log.at(-1)?.message ?? "" : "";
    const mechanismBeat = latestDungeonMessage.includes("finds the Wayfinder Key")
      ? { title: "KEY FOUND", detail: "WAYFINDER KEY · RETURN TO THE SEALED GATE", color: 0x5b4820 }
      : latestDungeonMessage.includes("Wayfinder Gate is open")
        ? { title: "GATE OPEN", detail: "SHORTCUT UNSEALED · CROSSING NEXT", color: 0x274f3d }
        : latestDungeonMessage.includes("crosses the opened Wayfinder Gate")
          ? { title: "SHORTCUT CROSSED", detail: latestDungeonMessage.includes("far stair") ? "THE FAR STAIR IS REACHED" : "THE MAZE FOLDS BEHIND THE HERO", color: 0x315766 }
          : null;
    if (mechanismBeat !== null && hazardBeat === undefined) {
      const title = new Text({ text: mechanismBeat.title, style: { fontFamily: "Inter, sans-serif", fontSize: 7, fill: 0xffe4a1, fontWeight: "800", letterSpacing: 1.1 } });
      const detail = new Text({ text: mechanismBeat.detail, style: { fontFamily: "ui-monospace, monospace", fontSize: 4.5, fill: 0xf5ead5, fontWeight: "700", letterSpacing: 0.35 } });
      title.position.set(106, 5);
      detail.position.set(106, 15);
      this.worldLayer.addChild(rect(101, 2, 181, 23, 0x111820, 0.94));
      this.worldLayer.addChild(rect(101, 2, 4, 23, mechanismBeat.color));
      this.worldLayer.addChild(title, detail);
    }
    if (hazardBeat !== undefined) {
      const hazardCell = cellsById.get(hazardBeat.cellId);
      if (hazardCell !== undefined) {
        const focusX = offsetX + (hazardCell.x + 0.5) * cellSize;
        const focusY = offsetY + (hazardCell.y + 0.5) * cellSize;
        const focusRadius = Math.max(3.2, cellSize * 0.34);
        const focus = new Graphics();
        if (detectedTrap !== undefined) {
          focus.circle(focusX, focusY, focusRadius).stroke({ color: 0xffd166, width: Math.max(1, cellSize * 0.08), alpha: 0.9 });
          for (let ray = 0; ray < 4; ray += 1) {
            const angle = ray * Math.PI / 2;
            focus.moveTo(focusX + Math.cos(angle) * focusRadius * 1.15, focusY + Math.sin(angle) * focusRadius * 1.15);
            focus.lineTo(focusX + Math.cos(angle) * focusRadius * 1.65, focusY + Math.sin(angle) * focusRadius * 1.65);
          }
          focus.stroke({ color: 0xffe4a1, width: Math.max(0.8, cellSize * 0.065), alpha: 0.88 });
        } else if (disarmedTrap !== undefined) {
          focus.rect(focusX - focusRadius, focusY - focusRadius, focusRadius * 2, focusRadius * 2).stroke({ color: 0x9ed3aa, width: Math.max(1, cellSize * 0.08), alpha: 0.86 });
        }
        this.lightLayer.addChild(focus);
      }
      const currentY = current === undefined
        ? designHeight / 2
        : offsetY + (current.y + 0.5) * cellSize;
      const panelX = 124;
      const panelY = currentY < designHeight / 2 ? 130 : 24;
      const panelWidth = 120;
      const alertLabel = triggeredTrap !== undefined ? "TRAP SPRUNG" : detectedTrap !== undefined ? "TRAP DETECTED" : "TRAP DISARMED";
      const alertTextResolution = projectedTextResolution(
        this.app.renderer.resolution,
        calculateSceneLayout(this.app.screen.width, this.app.screen.height, designWidth, designHeight).scale,
      );
      const banner = new Text({
        text: alertLabel,
        style: { fontFamily: "Inter, sans-serif", fontSize: 7, fill: triggeredTrap !== undefined ? 0xffd37f : detectedTrap !== undefined ? 0xffe49b : 0xcce8c9, fontWeight: "800", letterSpacing: 1.1 },
        resolution: alertTextResolution,
        roundPixels: true,
      });
      const result = new Text({
        text: `${dungeonTrapKindLabel(hazardBeat.kind)} · ${state.scene.consequence}`,
        style: { fontFamily: "Georgia, serif", fontSize: 5.3, fill: 0xffedc2, wordWrap: true, wordWrapWidth: panelWidth - 12, lineHeight: 6.6 },
        resolution: alertTextResolution,
        roundPixels: true,
      });
      this.scaleSensitiveTexts.push(banner, result);
      this.dungeonAlertTexts.push(banner, result);
      this.host.dataset.dungeonAlertLabel = alertLabel;
      banner.position.set(panelX + 6, panelY + 4);
      result.position.set(panelX + 6, panelY + 15);
      this.worldLayer.addChild(rect(panelX, panelY, panelWidth, Math.max(29, result.height + 20), 0x171014));
      this.worldLayer.addChild(rect(panelX, panelY, panelWidth, 12, triggeredTrap !== undefined ? 0x521f28 : detectedTrap !== undefined ? 0x5b4820 : 0x274f3d));
      this.worldLayer.addChild(banner);
      this.worldLayer.addChild(result);
    }
  }

  private drawBattle(state: WorldState, palette: readonly [number, number, number]): void {
    const commandType = state.chronicle.at(-1)?.commandType;
    const isCounterDuelBeat = commandType === "start-counter-duel" || commandType === "counter-duel-action";
    const counterDuel = state.depth.counterDuel ?? (isCounterDuelBeat ? state.depth.completedCounterDuels.at(-1) : undefined);
    if (counterDuel !== undefined) {
      this.drawCounterDuel(state, counterDuel, palette);
      return;
    }
    this.worldLayer.addChild(rect(0, 128, designWidth, 52, 0x3b3034));
    const combat = state.depth.combat ?? state.depth.completedCombats.at(-1);
    if (combat === undefined) {
      this.drawHero(state, 91, 139, palette);
      return;
    }
    this.host.dataset.combatId = combat.id;
    this.host.dataset.combatTurn = String(combat.turn);
    this.host.dataset.combatPhase = "settled";
    this.host.dataset.encounterEngine = "rpg-combat";
    const rosterProjection = projectCombatRoster(combat);
    const summary = rosterProjection?.latestTurn ?? null;
    const battleHeaderY = 18;
    let rosterTop = battleHeaderY;
    if (summary !== null) {
      this.host.dataset.combatEvent = summary.id;
      this.host.dataset.combatActor = summary.actorId;
      this.host.dataset.combatTarget = summary.targetId ?? "none";
      this.host.dataset.combatAction = summary.action;
      this.host.dataset.combatInterrupted = String(summary.intentInterrupted);
      if (summary.abilityId !== null) this.host.dataset.combatAbility = summary.abilityId;
      if (summary.mana !== null) {
        this.host.dataset.combatManaDelta = `${summary.mana.manaBefore}:${summary.mana.amount}:${summary.mana.manaAfter}`;
      }
      if (summary.damage !== null) {
        this.host.dataset.combatHealthDelta = `${summary.damage.healthBefore}:${summary.damage.amount}:${summary.damage.healthAfter}`;
      }
      if (summary.statusEvents.length > 0) {
        this.host.dataset.combatStatuses = summary.statusEvents.map((event) => `${event.kind}:${event.status}`).join(",");
        this.host.dataset.combatStatusDurations = summary.statusEvents.map((event) =>
          `${event.status}:${event.kind === "status-applied" ? event.durationBefore ?? 0 : event.durationBefore}->${event.durationAfter}`
        ).join(",");
      }
      if (summary.defeatedIds.length > 0) this.host.dataset.combatDefeated = summary.defeatedIds.join(",");
      if (summary.outcome !== null) this.host.dataset.combatOutcome = summary.outcome;
      const turnLabel = this.createScaleSensitiveText(`TURN ${summary.turn}`, {
        fontFamily: "Inter, sans-serif", fontSize: 4.6, fill: 0xffc857, fontWeight: "900", letterSpacing: 0.7,
      });
      turnLabel.position.set(11, battleHeaderY + 3);
      const strip = this.createScaleSensitiveText(summary.text, {
        fontFamily: "ui-monospace, monospace", fontSize: 5.05, fill: 0xfff1d1, fontWeight: "700", wordWrap: true, wordWrapWidth: 258, lineHeight: 6.3,
      });
      strip.position.set(50, battleHeaderY + 2);
      const stripHeight = Math.max(18, strip.height + 8);
      rosterTop = battleHeaderY + stripHeight + 3;
      this.worldLayer.addChild(rect(6, battleHeaderY, 308, stripHeight, 0x171014, 0.92));
      this.worldLayer.addChild(rect(6, battleHeaderY, 39, stripHeight, 0x4b252b, 0.96));
      this.worldLayer.addChild(turnLabel, strip);
    }
    const activeId = rosterProjection?.activeUnitId ?? undefined;
    const rosterOverlayBottom = rosterProjection === null
      ? battleHeaderY
      : projectCombatRosterLayout(rosterProjection.units.length, rosterTop).bottom;
    const heroes = combat.combatants.filter((unit) => unit.side === "heroes");
    const enemies = combat.combatants.filter((unit) => unit.side === "enemies");
    const unitVisuals = new Map<string, BattleUnitVisual>();
    for (let index = 0; index < heroes.length; index += 1) {
      const unit = heroes[index];
      if (unit === undefined) continue;
      const x = 74 + index * 34;
      const y = 139 - index * 14;
      const layer = this.drawHero(state, x, y, palette);
      layer.alpha = unit.health > 0 ? 1 : 0.36;
      unitVisuals.set(unit.id, { layer, x, y });
      this.drawHealthBar(x - 12, y + 17, 24, unit.health, unit.maxHealth, unit.id === activeId);
      this.drawStatusMarkers(unit, x, projectCombatCueVerticalLayout(y, rosterOverlayBottom).statusCenterY);
    }
    for (let index = 0; index < enemies.length; index += 1) {
      const unit = enemies[index];
      if (unit === undefined) continue;
      const column = index % 3;
      const row = Math.floor(index / 3);
      const x = 210 + column * 34;
      const y = 117 + row * 39;
      const layer = this.drawMonster(unit, x, y, palette);
      layer.alpha = unit.health > 0 ? 1 : 0.36;
      unitVisuals.set(unit.id, { layer, x, y });
      this.drawHealthBar(x - 13, y + 13, 26, unit.health, unit.maxHealth, unit.id === activeId);
      this.drawStatusMarkers(unit, x, projectCombatCueVerticalLayout(y, rosterOverlayBottom).statusCenterY);
    }

    if (rosterProjection !== null) {
      this.host.dataset.combatRoster = JSON.stringify(rosterProjection.units.map((unit) => ({
        id: unit.id,
        side: unit.side,
        alive: unit.alive,
        health: unit.health,
        maxHealth: unit.maxHealth,
        mana: unit.mana,
        maxMana: unit.maxMana,
      })));
      this.host.dataset.combatRosterStatuses = JSON.stringify(rosterProjection.units.map((unit) => ({
        id: unit.id,
        statuses: unit.statuses,
      })));
      this.host.dataset.combatUpcoming = JSON.stringify(rosterProjection.upcomingTurns.map((turn) => turn.unitId));
      this.host.dataset.combatActiveUnit = rosterProjection.activeUnitId ?? "none";
      this.host.dataset.combatFocusTarget = rosterProjection.focusTargetId ?? "none";
      this.host.dataset.combatFocusKind = rosterProjection.focusKind;
      this.drawCombatRoster(rosterProjection, rosterTop, unitVisuals);
    }

    const cue = projectLatestCombatCue(combat);
    const actor = cue === null ? undefined : unitVisuals.get(cue.actorId);
    const target = cue === null ? undefined : unitVisuals.get(cue.targetId);
    if (cue !== null && actor !== undefined && target !== undefined) {
      if (this.battleCueId !== cue.id) {
        this.battleCueId = cue.id;
        this.battleCueStartedAt = this.elapsed;
      }
      const effectLayer = this.drawCombatEffect(cue, target.x, target.y - 12);
      this.battleBinding = { cue, actor, target, effectLayer };
      this.updateBattleAnimation();
    }
  }

  private createScaleSensitiveText(text: string, style: TextStyleOptions): Text {
    const sceneScale = calculateSceneLayout(
      this.app.screen.width,
      this.app.screen.height,
      designWidth,
      designHeight,
    ).scale;
    const label = new Text({
      text,
      style,
      resolution: projectedTextResolution(this.app.renderer.resolution, sceneScale),
      roundPixels: true,
    });
    this.scaleSensitiveTexts.push(label);
    return label;
  }

  private drawCombatRosterStatus(status: CombatRosterStatus, x: number, y: number): void {
    const color = status.kind === "guarding"
      ? 0x7ab6d9
      : status.kind === "poisoned"
        ? 0x8fcf64
        : status.kind === "weakened"
          ? 0xb88ad4
          : 0xff8d4d;
    const icon = new Graphics();
    if (status.kind === "guarding") icon.rect(x - 2.2, y - 2.2, 4.4, 4.4).stroke({ color, width: 1 });
    else if (status.kind === "poisoned") icon.circle(x, y, 2.2).fill(color);
    else if (status.kind === "weakened") icon.poly([x, y - 2.8, x + 2.8, y, x, y + 2.8, x - 2.8, y]).stroke({ color, width: 1 });
    else icon.poly([x, y - 3, x + 2.7, y + 2.4, x - 2.7, y + 2.4]).fill(color);
    this.worldLayer.addChild(icon);
    const duration = this.createScaleSensitiveText(`${status.kind[0]?.toUpperCase() ?? "?"}${status.duration}`, {
      fontFamily: "ui-monospace, monospace",
      fontSize: 3.2,
      fill: 0xfff1d1,
      fontWeight: "800",
    });
    duration.position.set(x + 3.4, y - 2.2);
    this.worldLayer.addChild(duration);
  }

  private drawCombatRoster(
    projection: CombatRosterProjection,
    top: number,
    unitVisuals: ReadonlyMap<string, BattleUnitVisual>,
  ): void {
    const layout = projectCombatRosterLayout(projection.units.length, top);
    for (let index = 0; index < layout.plates.length; index += 1) {
      const bounds = layout.plates[index];
      const unit = projection.units[index];
      if (bounds === undefined || unit === undefined) continue;
      const sideColor = unit.side === "heroes" ? 0x315c73 : 0x6e3437;
      const borderColor = unit.isFocused ? 0xffe7a3 : unit.isActive ? 0xffc857 : unit.alive ? 0x87909a : 0x777b80;
      const plate = new Graphics()
        .rect(bounds.x, bounds.y, bounds.width, bounds.height)
        .fill({ color: unit.alive ? 0x14171d : 0x202126, alpha: 0.94 })
        .stroke({ color: borderColor, width: unit.isFocused || unit.isActive ? 1.2 : 0.55, alpha: 0.9 });
      plate.rect(bounds.x, bounds.y, 3, bounds.height).fill({ color: sideColor, alpha: 0.95 });
      if (!unit.alive) {
        plate.moveTo(bounds.x + 3, bounds.y + 1).lineTo(bounds.x + bounds.width - 1, bounds.y + bounds.height - 1)
          .moveTo(bounds.x + bounds.width - 1, bounds.y + 1).lineTo(bounds.x + 3, bounds.y + bounds.height - 1)
          .stroke({ color: 0xe0848a, width: 0.65, alpha: 0.55 });
      }
      this.worldLayer.addChild(plate);

      const compactName = unit.name.length > 12 ? `${unit.name.slice(0, 11)}…` : unit.name;
      const name = this.createScaleSensitiveText(compactName, {
        fontFamily: "Georgia, serif",
        fontSize: 3.8,
        fill: unit.alive ? 0xfff1d1 : 0xa7abb1,
        fontWeight: "800",
      });
      name.position.set(bounds.x + 5, bounds.y + 1.1);
      const resources = this.createScaleSensitiveText(`HP ${unit.health}/${unit.maxHealth}  MP ${unit.mana}/${unit.maxMana}`, {
        fontFamily: "ui-monospace, monospace",
        fontSize: 3.05,
        fill: 0xcbd5df,
        fontWeight: "700",
      });
      resources.anchor.set(1, 0);
      resources.position.set(bounds.x + bounds.width - 2, bounds.y + 1.6);
      this.worldLayer.addChild(name, resources);

      for (let statusIndex = 0; statusIndex < Math.min(4, unit.statuses.length); statusIndex += 1) {
        const status = unit.statuses[statusIndex];
        if (status !== undefined) this.drawCombatRosterStatus(status, bounds.x + 7 + statusIndex * 17, bounds.y + 10.3);
      }
      const badgeText = !unit.alive
        ? "DEAD"
        : unit.isFocused
          ? projection.focusKind === "self-effect" ? "SELF FX" : "TARGET"
          : unit.isActive
            ? "NEXT"
            : unit.actedLast
              ? "ACTED"
              : "";
      if (badgeText !== "") {
        const badge = this.createScaleSensitiveText(badgeText, {
          fontFamily: "Inter, sans-serif",
          fontSize: 3.1,
          fill: unit.isFocused ? 0xffe7a3 : unit.isActive ? 0xffc857 : unit.alive ? 0xb9c2ca : 0xff9ca3,
          fontWeight: "900",
          letterSpacing: 0.25,
        });
        badge.anchor.set(1, 0);
        badge.position.set(bounds.x + bounds.width - 2, bounds.y + 9);
        this.worldLayer.addChild(badge);
      }
    }

    this.worldLayer.addChild(rect(layout.upcoming.x, layout.upcoming.y, layout.upcoming.width, layout.upcoming.height, 0x171014, 0.94));
    const nextLabel = this.createScaleSensitiveText(projection.upcomingTurns.length === 0 ? projection.outcome.toUpperCase() : "NEXT", {
      fontFamily: "Inter, sans-serif",
      fontSize: 3.5,
      fill: projection.upcomingTurns.length === 0 ? 0xcbd5df : 0xffc857,
      fontWeight: "900",
      letterSpacing: 0.45,
    });
    nextLabel.position.set(layout.upcoming.x + 4, layout.upcoming.y + 2.3);
    this.worldLayer.addChild(nextLabel);
    for (let index = 0; index < projection.upcomingTurns.length; index += 1) {
      const turn = projection.upcomingTurns[index];
      if (turn === undefined) continue;
      const slotX = layout.upcoming.x + 43 + index * 86;
      this.worldLayer.addChild(circle(slotX, layout.upcoming.y + 4.5, 3.1, index === 0 ? 0xffc857 : 0x755157));
      const slot = this.createScaleSensitiveText(String(turn.slot), {
        fontFamily: "ui-monospace, monospace",
        fontSize: 3.2,
        fill: index === 0 ? 0x24181c : 0xfff1d1,
        fontWeight: "900",
      });
      slot.anchor.set(0.5);
      slot.position.set(slotX, layout.upcoming.y + 4.3);
      const compactName = turn.unitName.length > 15 ? `${turn.unitName.slice(0, 14)}…` : turn.unitName;
      const turnName = this.createScaleSensitiveText(compactName, {
        fontFamily: "Inter, sans-serif",
        fontSize: 3.4,
        fill: 0xffedc2,
        fontWeight: "800",
      });
      turnName.position.set(slotX + 5, layout.upcoming.y + 2.2);
      this.worldLayer.addChild(slot, turnName);
    }

    if (projection.focusTargetId !== null) {
      const target = unitVisuals.get(projection.focusTargetId);
      if (target !== undefined) {
        const left = target.x - 22;
        const right = target.x + 22;
        const cueLayout = projectCombatCueVerticalLayout(target.y, layout.bottom);
        const topY = cueLayout.reticleTop;
        const bottom = cueLayout.reticleBottom;
        const reticle = new Graphics()
          .moveTo(left + 7, topY).lineTo(left, topY).lineTo(left, topY + 7)
          .moveTo(right - 7, topY).lineTo(right, topY).lineTo(right, topY + 7)
          .moveTo(left, bottom - 7).lineTo(left, bottom).lineTo(left + 7, bottom)
          .moveTo(right - 7, bottom).lineTo(right, bottom).lineTo(right, bottom - 7)
          .stroke({ color: 0xffe7a3, width: 1.2, alpha: 0.92 });
        const reticleLabel = this.createScaleSensitiveText(projection.focusKind === "self-effect" ? "SELF EFFECT" : "TARGET", {
          fontFamily: "Inter, sans-serif",
          fontSize: 3.4,
          fill: 0xffe7a3,
          fontWeight: "900",
          letterSpacing: 0.35,
        });
        reticleLabel.anchor.set(0.5, 0);
        reticleLabel.position.set(target.x, topY + 2);
        this.lightLayer.addChild(reticle, reticleLabel);
      }
    }

    for (const unit of projection.units) {
      const visual = unitVisuals.get(unit.id);
      if (visual === undefined) continue;
      if (!unit.alive) {
        const defeated = new Graphics()
          .moveTo(visual.x - 13, visual.y - 31).lineTo(visual.x + 13, visual.y + 8)
          .moveTo(visual.x + 13, visual.y - 31).lineTo(visual.x - 13, visual.y + 8)
          .stroke({ color: 0xff9ca3, width: 1.5, alpha: 0.82 });
        const defeatedLabel = this.createScaleSensitiveText("DEFEATED", { fontFamily: "Inter, sans-serif", fontSize: 3.4, fill: 0xffb2b8, fontWeight: "900" });
        defeatedLabel.anchor.set(0.5, 0);
        defeatedLabel.position.set(visual.x, visual.y + 9);
        this.lightLayer.addChild(defeated, defeatedLabel);
      }
    }
  }

  private drawCounterDuelGlyph(stance: CounterDuelStance, x: number, y: number, color: number): Container {
    const glyph = new Container();
    glyph.position.set(x, y);
    glyph.addChild(circle(0, 0, 11, color, 0.12));
    if (stance === "rush") {
      glyph.addChild(new Graphics().poly([-9, -7, 9, 0, -9, 7, -4, 0]).fill(color));
    } else if (stance === "ward") {
      glyph.addChild(new Graphics().poly([0, -9, 8, -5, 7, 5, 0, 10, -7, 5, -8, -5]).stroke({ color, width: 2 }));
      glyph.addChild(new Graphics().moveTo(0, -7).lineTo(0, 7).stroke({ color, width: 1 }));
    } else {
      glyph.addChild(new Graphics().moveTo(-8, -7).bezierCurveTo(9, -10, 8, 2, -2, 2).bezierCurveTo(-9, 2, -7, 10, 7, 8).stroke({ color, width: 2 }));
      glyph.addChild(circle(7, 8, 2, color));
    }
    return glyph;
  }

  private drawCounterDuel(
    state: WorldState,
    duel: CounterDuelState,
    palette: readonly [number, number, number],
  ): void {
    this.host.dataset.encounterEngine = "counter-triangle";
    this.host.dataset.counterDuelId = duel.id;
    this.host.dataset.counterDuelRound = String(duel.round);
    this.host.dataset.counterDuelOutcome = duel.outcome;
    this.host.dataset.counterDuelScore = `${duel.heroScore}-${duel.opponentScore}`;
    this.worldLayer.addChild(rect(0, 0, designWidth, designHeight, 0x17141f));
    this.worldLayer.addChild(rect(0, 124, designWidth, 56, 0x302631));
    this.worldLayer.addChild(new Graphics().ellipse(160, 143, 112, 30).stroke({ color: 0x8d718c, width: 1.5, alpha: 0.7 }));

    const title = new Text({ text: "PATTERN DUEL", style: { fontFamily: "Inter, sans-serif", fontSize: 8, fill: 0xffd37f, fontWeight: "800", letterSpacing: 1.5 } });
    title.position.set(9, 7);
    const rule = new Text({ text: "RUSH › FEINT › WARD › RUSH", style: { fontFamily: "Inter, sans-serif", fontSize: 5.2, fill: 0xe5d7bd, fontWeight: "700", letterSpacing: 0.5 } });
    rule.position.set(9, 20);
    const score = new Text({ text: `${state.hero.name.toUpperCase()}  ${duel.heroScore}  ·  ${duel.opponentScore}  ${duel.opponentName.toUpperCase()}`, style: { fontFamily: "Inter, sans-serif", fontSize: 6.2, fill: 0xf5ead5, fontWeight: "800" } });
    score.anchor.set(0.5, 0);
    score.position.set(160, 8);
    const stakes = new Text({ text: `FIRST TO 2 · AFTER 5, LEADER WINS / EQUAL DRAWS · WIN +8 XP/+5 GOLD · LOSS −${duel.stakes.defeatDamage} HP`, style: { fontFamily: "Inter, sans-serif", fontSize: 3.85, fill: 0xb8ad9e, fontWeight: "700" } });
    stakes.anchor.set(0.5, 0);
    stakes.position.set(160, 29);
    this.worldLayer.addChild(title, rule, score, stakes);

    const heroLayer = this.drawHero(state, 72, 148, palette);
    const opponentUnit: CombatantState = {
      id: duel.opponentId,
      name: duel.opponentName,
      side: "enemies",
      health: 1,
      maxHealth: 1,
      mana: 0,
      maxMana: 0,
      power: 1,
      armor: 0,
      initiative: 1,
      statuses: [],
      speciesId: duel.opponentSpeciesId,
      abilities: [],
    };
    const opponentLayer = this.drawMonster(opponentUnit, 248, 148, palette);
    const heroVisual = { layer: heroLayer, x: 72, y: 148 };
    const opponentVisual = { layer: opponentLayer, x: 248, y: 148 };
    const latest = duel.history.at(-1);
    const shownTell = latest?.tell ?? duel.tell;
    const habit = projectCounterDuelHabit(duel, state.depth.hero.monsterLore);
    this.host.dataset.counterDuelTell = shownTell.suggestedStance;
    this.host.dataset.counterDuelHabit = habit.status === "established" ? habit.preferredStance : "unconfirmed";
    this.host.dataset.counterDuelHabitProgress = `${habit.encounters}/${habit.requiredEncounters}`;

    const tell = new Container();
    const tellText = new Text({ text: `TELL · ${counterDuelTellText(shownTell)}`, style: { fontFamily: "Georgia, serif", fontSize: 6.4, fill: 0xffe4a6, fontWeight: "700" } });
    tellText.anchor.set(0.5, 0);
    tellText.position.set(160, 44);
    tell.addChild(tellText);
    this.worldLayer.addChild(tell);

    const habitGlyph = habit.status === "established"
      ? this.drawCounterDuelGlyph(habit.preferredStance, 69, 56, 0x8fd0c2)
      : new Container();
    if (habit.status === "established") {
      habitGlyph.scale.set(0.48);
    } else {
      habitGlyph.position.set(69, 56);
      habitGlyph.addChild(new Graphics().poly([0, -5, 5, 0, 0, 5, -5, 0]).stroke({ color: 0x71828a, width: 1.2 }));
      const unknown = new Text({ text: "?", style: { fontFamily: "Inter, sans-serif", fontSize: 5, fill: 0xa5b4bc, fontWeight: "900" } });
      unknown.anchor.set(0.5); unknown.position.set(0, -0.5);
      habitGlyph.addChild(unknown);
    }
    const habitLine = new Text({
      text: habit.status === "established"
        ? `FIELD NOTE · OFTEN FAVORS ${counterDuelStanceLabel(habit.preferredStance).toUpperCase()}`
        : `HABIT UNCONFIRMED · ${habit.encounters}/${habit.requiredEncounters}`,
      style: { fontFamily: "Inter, sans-serif", fontSize: 4.8, fill: habit.status === "established" ? 0x9ed8ca : 0x94a3ab, fontWeight: "800", letterSpacing: 0.45 },
    });
    habitLine.anchor.set(0.5, 0); habitLine.position.set(164, 53);
    this.worldLayer.addChild(habitGlyph, habitLine);

    const prediction = new Container();
    const reveal = new Container();
    const consequence = new Container();
    if (latest !== undefined) {
      this.host.dataset.counterDuelPrediction = latest.prediction;
      this.host.dataset.counterDuelHeroStance = latest.heroStance;
      this.host.dataset.counterDuelOpponentStance = latest.opponentStance;
      this.host.dataset.counterDuelResult = latest.result;
      const predictionText = new Text({ text: `READ ${counterDuelStanceLabel(latest.prediction).toUpperCase()}  →  ${counterDuelStanceLabel(latest.heroStance).toUpperCase()}`, style: { fontFamily: "Inter, sans-serif", fontSize: 6, fill: 0x9fc9ff, fontWeight: "800" } });
      predictionText.anchor.set(0.5, 0);
      predictionText.position.set(88, 64);
      prediction.addChild(predictionText);
      const heroGlyph = this.drawCounterDuelGlyph(latest.heroStance, 83, 89, 0x9fc9ff);
      const opponentGlyph = this.drawCounterDuelGlyph(latest.opponentStance, 237, 89, 0xffaa8b);
      reveal.addChild(heroGlyph, opponentGlyph);
      const heroReveal = new Text({ text: counterDuelStanceLabel(latest.heroStance).toUpperCase(), style: { fontFamily: "Inter, sans-serif", fontSize: 5.5, fill: 0x9fc9ff, fontWeight: "800" } });
      const opponentReveal = new Text({ text: counterDuelStanceLabel(latest.opponentStance).toUpperCase(), style: { fontFamily: "Inter, sans-serif", fontSize: 5.5, fill: 0xffaa8b, fontWeight: "800" } });
      heroReveal.anchor.set(0.5, 0); heroReveal.position.set(83, 103);
      opponentReveal.anchor.set(0.5, 0); opponentReveal.position.set(237, 103);
      reveal.addChild(heroReveal, opponentReveal);
      const resultText = latest.result === "hero"
        ? `${counterDuelStanceLabel(latest.heroStance).toUpperCase()} COUNTERS ${counterDuelStanceLabel(latest.opponentStance).toUpperCase()} · HERO +1`
        : latest.result === "opponent"
          ? `${counterDuelStanceLabel(latest.opponentStance).toUpperCase()} COUNTERS ${counterDuelStanceLabel(latest.heroStance).toUpperCase()} · RIVAL +1`
          : `${counterDuelStanceLabel(latest.heroStance).toUpperCase()} MEETS ${counterDuelStanceLabel(latest.opponentStance).toUpperCase()} · TIE`;
      const result = new Text({ text: resultText, style: { fontFamily: "Inter, sans-serif", fontSize: 6.2, fill: 0xffd37f, fontWeight: "900", letterSpacing: 0.3 } });
      result.anchor.set(0.5, 0); result.position.set(160, 113);
      consequence.addChild(result);
      this.worldLayer.addChild(prediction, reveal, consequence);
      const cueId = `${duel.id}:round:${latest.round}`;
      if (this.counterDuelCueId !== cueId) {
        this.counterDuelCueId = cueId;
        this.counterDuelCueStartedAt = this.elapsed;
      }
      this.counterDuelBinding = { tell, prediction, reveal, consequence, hero: heroVisual, opponent: opponentVisual };
      this.updateCounterDuelAnimation();
    } else {
      this.host.dataset.counterDuelPhase = "tell";
      const waiting = new Text({ text: "THREE LEGAL READS · ONE COMMITTED ANSWER", style: { fontFamily: "Inter, sans-serif", fontSize: 6, fill: 0xb8ad9e, fontWeight: "700" } });
      waiting.anchor.set(0.5, 0); waiting.position.set(160, 76);
      this.worldLayer.addChild(waiting);
    }
  }

  private drawMonster(
    unit: CombatantState,
    x: number,
    y: number,
    palette: readonly [number, number, number],
  ): Container {
    const layer = new Container();
    layer.position.set(x, y);
    layer.alpha = unit.health > 0 ? 1 : 0.38;
    const definition = unit.speciesId === null ? undefined : monsterDefinition(unit.speciesId);
    const bodyColor = unit.health <= 0 ? 0x343a37 : definition?.color ?? 0x4b7754;
    layer.addChild(circle(0, -18, 10, bodyColor));
    layer.addChild(rect(-9, -9, 18, 19, bodyColor));
    layer.addChild(circle(-4, -20, 1.5, palette[2]));
    layer.addChild(circle(4, -20, 1.5, palette[2]));

    if (unit.speciesId === "lantern-wolf") {
      layer.addChild(new Graphics().poly([-9, -24, -5, -35, -1, -25]).fill(bodyColor));
      layer.addChild(new Graphics().poly([1, -25, 5, -35, 9, -24]).fill(bodyColor));
      layer.addChild(circle(0, -15, 5, palette[2], 0.18));
    } else if (unit.speciesId === "mossback-brute") {
      layer.addChild(circle(-10, -7, 6, bodyColor));
      layer.addChild(circle(10, -7, 6, bodyColor));
      layer.addChild(rect(-7, -31, 14, 4, 0x78905c));
    } else if (unit.speciesId === "river-wyrmling") {
      layer.addChild(new Graphics().poly([-7, -12, -18, -22, -13, -3]).fill({ color: 0x6ca1aa, alpha: 0.8 }));
      layer.addChild(new Graphics().poly([7, -12, 18, -22, 13, -3]).fill({ color: 0x6ca1aa, alpha: 0.8 }));
      layer.addChild(new Graphics().moveTo(8, 5).bezierCurveTo(18, 7, 20, 0, 24, -2).stroke({ color: bodyColor, width: 3 }));
    } else if (unit.speciesId === "inkcap-mimic") {
      layer.addChild(rect(-11, -9, 22, 6, 0x5b3c4f));
      for (let tooth = 0; tooth < 4; tooth += 1) {
        layer.addChild(new Graphics().poly([-8 + tooth * 5, -3, -6 + tooth * 5, 2, -4 + tooth * 5, -3]).fill(0xe9dfbd));
      }
    } else if (unit.speciesId === "copperhorn") {
      layer.addChild(new Graphics().poly([-8, -23, -18, -31, -11, -18]).fill(0xc08c52));
      layer.addChild(new Graphics().poly([8, -23, 18, -31, 11, -18]).fill(0xc08c52));
      layer.addChild(rect(-2, -12, 4, 10, 0xc08c52));
    }

    this.worldLayer.addChild(layer);
    return layer;
  }

  private drawStatusMarkers(unit: CombatantState, x: number, y: number): void {
    const colors = {
      guarding: 0x7ab6d9,
      poisoned: 0x8fcf64,
      weakened: 0xb88ad4,
      burning: 0xff8d4d,
    } as const;
    for (let statusIndex = 0; statusIndex < unit.statuses.length; statusIndex += 1) {
      const status = unit.statuses[statusIndex];
      if (status === undefined) continue;
      const markerX = x - 7 + statusIndex * 8;
      this.lightLayer.addChild(circle(markerX, y, 2.6, colors[status.kind]));
      for (let pip = 0; pip < Math.min(3, status.duration); pip += 1) {
        this.lightLayer.addChild(rect(markerX - 2 + pip * 2, y + 4, 1.2, 1.5, colors[status.kind]));
      }
    }
  }

  private drawCombatEffect(cue: CombatVisualCue, x: number, y: number): Container {
    const layer = new Container();
    layer.position.set(x, y);
    layer.alpha = 0;
    const color = combatEffectColor(cue);
    if (cue.action === "guard") {
      layer.addChild(new Graphics().poly([0, -15, 11, -10, 8, 7, 0, 14, -8, 7, -11, -10]).stroke({ color, width: 2 }));
    } else if (cue.effect === "arcane") {
      layer.addChild(new Graphics().circle(0, 0, 7).stroke({ color, width: 2 }));
      layer.addChild(new Graphics().circle(0, 0, 13).stroke({ color, width: 1, alpha: 0.65 }));
    } else if (cue.effect === "burning") {
      layer.addChild(new Graphics().poly([-7, 10, 0, -15, 4, -3, 9, -10, 8, 10]).fill({ color, alpha: 0.9 }));
    } else if (cue.effect === "poison") {
      layer.addChild(circle(0, 2, 6, color, 0.85));
      layer.addChild(circle(-7, -7, 3, color, 0.72));
      layer.addChild(circle(7, -10, 2, color, 0.62));
    } else if (cue.effect === "weaken") {
      layer.addChild(new Graphics().moveTo(-11, -8).lineTo(0, 3).lineTo(11, -8).stroke({ color, width: 2 }));
      layer.addChild(new Graphics().moveTo(-8, 1).lineTo(0, 9).lineTo(8, 1).stroke({ color, width: 2 }));
    } else if (cue.effect === "piercing") {
      layer.addChild(new Graphics().moveTo(-20, 8).lineTo(20, -10).stroke({ color, width: 3 }));
      layer.addChild(new Graphics().poly([20, -10, 13, -12, 16, -5]).fill(color));
    } else {
      layer.addChild(new Graphics().moveTo(-13, 11).lineTo(13, -11).stroke({ color, width: 3 }));
      layer.addChild(new Graphics().moveTo(-6, -13).lineTo(8, 12).stroke({ color, width: 1.5, alpha: 0.7 }));
    }
    const particleCount = Math.min(8, Math.max(3, Math.ceil(cue.amount / 6)));
    for (let particle = 0; particle < particleCount; particle += 1) {
      const angle = (Math.PI * 2 * particle) / particleCount;
      layer.addChild(circle(Math.cos(angle) * 17, Math.sin(angle) * 13, 1.3, color, 0.72));
    }
    this.lightLayer.addChild(layer);
    return layer;
  }

  private updateBattleAnimation(): void {
    const binding = this.battleBinding;
    if (binding === null) return;
    const motion = projectCombatMotion(
      binding.cue,
      this.elapsed - this.battleCueStartedAt,
      this.reducedMotion,
    );
    binding.actor.layer.position.set(
      binding.actor.x + motion.actorOffsetX,
      binding.actor.y + motion.actorOffsetY,
    );
    binding.target.layer.position.x = binding.target.x + motion.targetOffsetX;
    binding.effectLayer.alpha = motion.effectAlpha;
    binding.effectLayer.scale.set(motion.effectScale);
    this.host.dataset.combatPhase = motion.phase;
    if (motion.phase === "settled") this.battleBinding = null;
  }

  private updateCounterDuelAnimation(): void {
    const binding = this.counterDuelBinding;
    if (binding === null) return;
    const motion = projectCounterDuelMotion(this.elapsed - this.counterDuelCueStartedAt, this.reducedMotion);
    binding.tell.alpha = motion.tellAlpha;
    binding.prediction.alpha = motion.predictionAlpha;
    binding.reveal.alpha = motion.revealAlpha;
    binding.consequence.alpha = motion.consequenceAlpha;
    binding.hero.layer.position.x = binding.hero.x + motion.heroOffsetX;
    binding.opponent.layer.position.x = binding.opponent.x + motion.opponentOffsetX;
    this.host.dataset.counterDuelPhase = motion.phase;
    if (motion.phase === "settled" || motion.phase === "static") this.counterDuelBinding = null;
  }

  private drawAbilityGlyph(effect: AbilityEffect, x: number, y: number, scale = 1): Container {
    const layer = new Container();
    layer.position.set(x, y);
    layer.scale.set(scale);
    const color = abilityEffectColor(effect);
    layer.addChild(circle(0, 0, 10, color, 0.12));
    if (effect === "arcane") {
      layer.addChild(new Graphics().circle(0, 0, 6).stroke({ color, width: 1.5 }));
      layer.addChild(new Graphics().poly([0, -8, 3, -2, 8, 0, 3, 2, 0, 8, -3, 2, -8, 0, -3, -2]).stroke({ color, width: 1 }));
    } else if (effect === "burning") {
      layer.addChild(new Graphics().poly([-6, 7, -2, -8, 1, -2, 5, -10, 6, 7]).fill(color));
    } else if (effect === "poison") {
      layer.addChild(circle(0, 2, 5, color, 0.85));
      layer.addChild(circle(-5, -5, 2, color, 0.7));
      layer.addChild(circle(5, -7, 1.5, color, 0.65));
    } else if (effect === "weaken") {
      layer.addChild(new Graphics().moveTo(-7, -5).lineTo(0, 2).lineTo(7, -5).stroke({ color, width: 2 }));
      layer.addChild(new Graphics().moveTo(-5, 2).lineTo(0, 7).lineTo(5, 2).stroke({ color, width: 2 }));
    } else {
      layer.addChild(new Graphics().moveTo(-8, 6).lineTo(8, -7).stroke({ color, width: 2 }));
      layer.addChild(new Graphics().poly([8, -7, 3, -8, 6, -3]).fill(color));
    }
    this.lightLayer.addChild(layer);
    return layer;
  }

  private drawTraining(state: WorldState, palette: readonly [number, number, number]): void {
    this.worldLayer.addChild(rect(0, 129, designWidth, 51, 0x263c40));
    this.worldLayer.addChild(new Graphics().ellipse(160, 142, 76, 25).stroke({ color: palette[1], width: 2, alpha: 0.7 }));
    this.worldLayer.addChild(new Graphics().ellipse(160, 142, 52, 17).stroke({ color: palette[2], width: 1, alpha: 0.45 }));
    const abilities = state.depth.hero.abilities.slice(0, 8);
    const focus = [...abilities].sort(
      (left, right) => left.experience - right.experience || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0),
    )[0];
    for (let index = 0; index < abilities.length; index += 1) {
      const ability = abilities[index];
      if (ability === undefined) continue;
      const angle = -Math.PI + (Math.PI * 2 * index) / Math.max(1, abilities.length);
      const x = 160 + Math.cos(angle) * 66;
      const y = 91 + Math.sin(angle) * 25;
      const glyph = this.drawAbilityGlyph(ability.effect, x, y, ability.id === focus?.id ? 1.25 : 0.75);
      glyph.alpha = ability.id === focus?.id ? 1 : 0.58;
    }
    this.worldLayer.addChild(rect(222, 103, 6, 41, 0x80634e));
    this.worldLayer.addChild(circle(225, 99, 12, 0x9c7958));
    this.worldLayer.addChild(new Graphics().moveTo(213, 112).lineTo(237, 112).stroke({ color: 0x80634e, width: 5 }));
    this.drawHero(state, 139, 145, palette);
    if (focus !== undefined) {
      const color = abilityEffectColor(focus.effect);
      this.lightLayer.addChild(new Graphics().moveTo(153, 127).quadraticCurveTo(180, 99, 213, 112).stroke({ color, width: 2, alpha: 0.72 }));
    }
  }

  private drawDiscovery(state: WorldState, palette: readonly [number, number, number]): void {
    this.worldLayer.addChild(rect(0, 129, designWidth, 51, 0x322b3d));
    const discovery = state.depth.discoveries.at(-1);
    const ability = state.depth.hero.abilities.find((entry) => entry.id === discovery?.abilityId);
    const source = state.depth.completedCombats
      .at(-1)
      ?.combatants.find((entry) => entry.speciesId === discovery?.monsterId);
    const sourceVisual: CombatantState | undefined = source ?? (discovery === undefined ? undefined : {
      id: `discovery:${discovery.monsterId}`,
      name: discovery.monsterName,
      side: "enemies",
      health: 1,
      maxHealth: 1,
      mana: 0,
      maxMana: 0,
      power: 0,
      armor: 0,
      initiative: 0,
      statuses: [],
      speciesId: discovery.monsterId,
      abilities: [],
    });
    this.drawHero(state, 102, 145, palette);
    if (sourceVisual !== undefined) {
      this.drawMonster(sourceVisual, 224, 139, palette);
    } else {
      this.worldLayer.addChild(circle(224, 121, 13, 0x5d5270));
      this.worldLayer.addChild(rect(213, 130, 22, 22, 0x5d5270));
    }
    const effect = ability?.effect ?? "arcane";
    const color = abilityEffectColor(effect);
    this.drawAbilityGlyph(effect, 163, 96, 1.45);
    this.lightLayer.addChild(new Graphics().moveTo(211, 116).bezierCurveTo(198, 86, 182, 87, 171, 96).stroke({ color, width: 2, alpha: 0.74 }));
    this.lightLayer.addChild(new Graphics().moveTo(154, 101).bezierCurveTo(142, 109, 128, 119, 113, 126).stroke({ color, width: 2, alpha: 0.74 }));
    for (let mote = 0; mote < 6; mote += 1) {
      const x = 127 + mote * 14;
      const y = 109 - Math.sin((Math.PI * mote) / 5) * 21;
      this.lightLayer.addChild(circle(x, y, 1.4 + (mote % 2), color, 0.75));
    }
    this.lightLayer.addChild(circle(102, 126, 23, color, 0.08));
  }

  private drawHealthBar(
    x: number,
    y: number,
    width: number,
    health: number,
    maximum: number,
    active: boolean,
  ): void {
    this.worldLayer.addChild(rect(x, y, width, 3, 0x1b2026));
    this.worldLayer.addChild(
      rect(x, y, width * (health / Math.max(1, maximum)), 3, health > 0 ? 0xd45d62 : 0x555b61),
    );
    if (active) this.lightLayer.addChild(rect(x - 1, y - 1, width + 2, 5, 0xffd166, 0.22));
  }

  private drawCamp(state: WorldState, palette: readonly [number, number, number]): void {
    for (let index = 0; index < 42; index += 1) {
      const x = randomInt(320, state.seed, "visual", "camp", state.tick, "star-x", index);
      const y = randomInt(90, state.seed, "visual", "camp", state.tick, "star-y", index);
      this.worldLayer.addChild(circle(x, y, index % 7 === 0 ? 1.4 : 0.7, 0xe9e7cf, 0.72));
    }
    this.worldLayer.addChild(rect(0, 127, designWidth, 53, 0x1e3435));
    this.lightLayer.addChild(circle(160, 139, 38, palette[2], 0.09));
    this.lightLayer.addChild(
      new Graphics().poly([151, 146, 160, 122, 169, 146]).fill(palette[2]),
    );
    this.lightLayer.addChild(
      new Graphics().poly([156, 144, 161, 129, 165, 144]).fill(0xffe3a1),
    );
    this.drawHero(state, 118, 151, palette);
  }

  private drawChronicle(state: WorldState, palette: readonly [number, number, number]): void {
    this.worldLayer.addChild(rect(66, 22, 188, 138, 0xdec993));
    this.worldLayer.addChild(rect(72, 28, 176, 126, 0x9b865c, 0.19));
    for (let line = 0; line < 6; line += 1) {
      const width = 72 + randomInt(80, state.seed, "visual", "chronicle", state.tick, "line", line);
      this.worldLayer.addChild(rect(92, 49 + line * 14, width, 2, 0x6d5b48, 0.64));
    }
    this.worldLayer.addChild(circle(213, 127, 17, palette[1]));
    this.worldLayer.addChild(circle(213, 127, 11, palette[2], 0.65));
  }
}
