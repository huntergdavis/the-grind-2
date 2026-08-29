import { Application, Container, Graphics, Text } from "pixi.js";
import { randomInt } from "../core/rng";
import type { SceneMode, WorldState } from "../core/types";
import { monsterDefinition } from "../depth/combat";
import type { AbilityEffect, AtlasEdge, AtlasState, AtlasTerrainPoint, CombatantState } from "../depth/types";
import { abilityEffectColor, combatEffectColor, projectCombatMotion, projectLatestCombatCue, type CombatVisualCue } from "./combat-choreography";
import { projectHeroAppearance } from "./hero-appearance";
import { animatedLayerY, calculateSceneLayout } from "./layout";
import { projectRoute } from "./route-projection";

const designWidth = 320;
const designHeight = 180;

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
  private atlasStaticLayer: Container | null = null;
  private atlasStaticSignature: string | null = null;

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
    renderer.app.ticker.add((ticker) => {
      if (renderer.paused) return;
      renderer.elapsed += ticker.deltaMS / 1000;
      renderer.updateBattleAnimation();
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

  render(state: WorldState): void {
    this.battleBinding = null;
    this.host.dataset.sceneMode = state.scene.mode;
    if (state.scene.mode !== "battle") {
      delete this.host.dataset.combatId;
      delete this.host.dataset.combatTurn;
      delete this.host.dataset.combatEvent;
      delete this.host.dataset.combatActor;
      delete this.host.dataset.combatTarget;
      delete this.host.dataset.combatAction;
      delete this.host.dataset.combatPhase;
    }
    this.clear(this.worldLayer);
    this.clear(this.lightLayer);
    const palette = palettes[state.scene.mode];
    this.worldLayer.addChild(rect(0, 0, designWidth, designHeight, palette[0]));
    this.drawHorizon(palette);

    switch (state.scene.mode) {
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
      if (child !== this.atlasStaticLayer) child.destroy();
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
  }

  private resizeToHost(): void {
    const width = Math.max(1, this.host.clientWidth);
    const height = Math.max(1, this.host.clientHeight);
    if (this.app.screen.width !== width || this.app.screen.height !== height) {
      this.app.renderer.resize(width, height);
    }
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

  private drawHero(
    state: WorldState,
    x: number,
    y: number,
    palette: readonly [number, number, number],
    scale = 1,
  ): Container {
    const heroStartIndex = this.lightLayer.children.length;
    const gear = projectHeroAppearance(state.depth.hero);

    if (gear.charm?.silhouette === "halo") {
      this.lightLayer.addChild(new Graphics().circle(x, y - 18, 8).stroke({ color: gear.charm.color, width: 1.5, alpha: 0.8 }));
    } else if (gear.charm?.silhouette === "orb") {
      this.lightLayer.addChild(circle(x + 9, y - 4, 2.5, gear.charm.color, 0.85));
      this.lightLayer.addChild(circle(x + 9, y - 4, 5, gear.charm.color, 0.16));
    } else if (gear.charm?.silhouette === "sigil") {
      this.lightLayer.addChild(new Graphics().poly([x + 8, y - 7, x + 11, y - 4, x + 8, y - 1, x + 5, y - 4]).fill({ color: gear.charm.color, alpha: 0.9 }));
    }

    this.lightLayer.addChild(rect(x - 5, y + 3, 4, 11, 0x17212e));
    this.lightLayer.addChild(rect(x + 1, y + 3, 4, 11, 0x17212e));
    if (gear.feet?.silhouette === "boots") {
      this.lightLayer.addChild(rect(x - 6, y + 10, 5, 5, gear.feet.color));
      this.lightLayer.addChild(rect(x + 1, y + 10, 5, 5, gear.feet.color));
    } else if (gear.feet?.silhouette === "greaves") {
      this.lightLayer.addChild(rect(x - 5, y + 4, 3, 10, gear.feet.color));
      this.lightLayer.addChild(rect(x + 2, y + 4, 3, 10, gear.feet.color));
    } else if (gear.feet?.silhouette === "sandals") {
      this.lightLayer.addChild(rect(x - 5, y + 12, 4, 2, gear.feet.color));
      this.lightLayer.addChild(rect(x + 1, y + 12, 4, 2, gear.feet.color));
    }

    this.lightLayer.addChild(rect(x - 5, y - 13, 10, 17, palette[2]));
    if (gear.body?.silhouette === "coat") {
      this.lightLayer.addChild(new Graphics().poly([x - 6, y - 13, x + 6, y - 13, x + 8, y + 6, x, y + 3, x - 8, y + 6]).fill(gear.body.color));
      this.lightLayer.addChild(rect(x - 1, y - 12, 2, 15, gear.body.accent));
    } else if (gear.body?.silhouette === "mail") {
      this.lightLayer.addChild(rect(x - 6, y - 13, 12, 17, gear.body.color));
      for (let row = 0; row < 4; row += 1) this.lightLayer.addChild(rect(x - 5 + (row % 2), y - 10 + row * 4, 9, 1, gear.body.accent));
    } else if (gear.body?.silhouette === "plate") {
      this.lightLayer.addChild(rect(x - 6, y - 12, 12, 14, gear.body.color));
      this.lightLayer.addChild(rect(x - 8, y - 13, 4, 5, gear.body.accent));
      this.lightLayer.addChild(rect(x + 4, y - 13, 4, 5, gear.body.accent));
      this.lightLayer.addChild(rect(x - 4, y - 4, 8, 2, gear.body.accent));
    }

    this.lightLayer.addChild(rect(x - 7, y - 10, 3, 14, 0x432d3a));
    this.lightLayer.addChild(rect(x + 4, y - 10, 3, 14, 0x432d3a));

    if (gear.offhand?.silhouette === "shield") {
      this.lightLayer.addChild(circle(x - 8, y - 3, 5, gear.offhand.color));
      this.lightLayer.addChild(circle(x - 8, y - 3, 2, gear.offhand.accent));
    } else if (gear.offhand?.silhouette === "book") {
      this.lightLayer.addChild(rect(x - 13, y - 7, 7, 9, gear.offhand.color));
      this.lightLayer.addChild(rect(x - 10, y - 6, 1, 7, gear.offhand.accent));
    } else if (gear.offhand?.silhouette === "lantern") {
      this.lightLayer.addChild(rect(x - 12, y - 5, 6, 7, gear.offhand.accent));
      this.lightLayer.addChild(circle(x - 9, y - 2, 4, gear.offhand.color, 0.28));
    }

    this.lightLayer.addChild(circle(x, y - 18, 5, 0xf6d2a6));
    if (gear.head?.silhouette === "cap") {
      this.lightLayer.addChild(new Graphics().moveTo(x - 6, y - 19).quadraticCurveTo(x, y - 27, x + 6, y - 19).lineTo(x + 7, y - 18).lineTo(x - 6, y - 18).closePath().fill(gear.head.color));
    } else if (gear.head?.silhouette === "crown") {
      this.lightLayer.addChild(new Graphics().poly([x - 6, y - 20, x - 5, y - 27, x - 1, y - 23, x + 2, y - 28, x + 5, y - 22, x + 6, y - 20]).fill(gear.head.color));
    } else if (gear.head?.silhouette === "helm") {
      this.lightLayer.addChild(new Graphics().moveTo(x - 6, y - 19).quadraticCurveTo(x, y - 28, x + 6, y - 19).lineTo(x + 6, y - 15).lineTo(x + 2, y - 15).lineTo(x + 2, y - 19).lineTo(x - 6, y - 19).closePath().fill(gear.head.color));
      this.lightLayer.addChild(rect(x - 3, y - 19, 7, 1, gear.head.accent));
    }

    if (gear.weapon?.silhouette === "sword") {
      this.lightLayer.addChild(new Graphics().moveTo(x + 7, y - 5).lineTo(x + 14, y - 22).stroke({ color: gear.weapon.color, width: 2 }));
      this.lightLayer.addChild(rect(x + 5, y - 7, 7, 2, gear.weapon.accent));
    } else if (gear.weapon?.silhouette === "spear") {
      this.lightLayer.addChild(new Graphics().moveTo(x + 7, y + 3).lineTo(x + 15, y - 27).stroke({ color: gear.weapon.accent, width: 1.5 }));
      this.lightLayer.addChild(new Graphics().poly([x + 15, y - 30, x + 18, y - 24, x + 13, y - 25]).fill(gear.weapon.color));
    } else if (gear.weapon?.silhouette === "wand") {
      this.lightLayer.addChild(new Graphics().moveTo(x + 7, y - 2).lineTo(x + 13, y - 18).stroke({ color: gear.weapon.accent, width: 2 }));
      this.lightLayer.addChild(circle(x + 14, y - 20, 3, gear.weapon.color));
      this.lightLayer.addChild(circle(x + 14, y - 20, 6, gear.weapon.color, 0.16));
    }

    const heroLayer = new Container();
    heroLayer.addChild(...this.lightLayer.removeChildren(heroStartIndex));
    heroLayer.pivot.set(x, y);
    heroLayer.position.set(x, y);
    heroLayer.scale.set(scale);
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

  private drawTravel(state: WorldState, palette: readonly [number, number, number]): void {
    this.worldLayer.addChild(rect(0, 126, designWidth, 54, 0x304c3f));
    const route = state.depth.atlas.route;
    const projection = projectRoute(state.depth.atlas);
    const sceneryKey = projection?.edgeId ?? state.depth.atlas.currentLocationId;
    const bend = randomInt(25, state.seed, "travel-road", sceneryKey, 0, "bend") - 12;
    this.worldLayer.addChild(
      new Graphics()
        .moveTo(102, 180)
        .bezierCurveTo(126 + bend, 149, 154 + bend * 0.35, 134, 151, 111)
        .lineTo(180, 111)
        .bezierCurveTo(184 + bend * 0.35, 134, 196 + bend, 151, 217, 180)
        .closePath()
        .fill(0xa48761),
    );
    for (let index = 0; index < 9; index += 1) {
      const x = randomInt(320, state.seed, "travel-scenery", sceneryKey, 0, "grass", index);
      const depth = randomInt(3, state.seed, "travel-scenery", sceneryKey, 0, "depth", index);
      this.worldLayer.addChild(rect(x, 119 + depth * 12, 3, 23, palette[1]));
      this.worldLayer.addChild(circle(x + 1.5, 117 + depth * 12, 7, 0x365f4c));
    }
    const routeRatio = projection?.routeRatio ?? 0;
    const legRatio = projection?.legRatio ?? 0;
    const heroX = 164 + bend * Math.sin(legRatio * Math.PI);
    const heroY = 150 - legRatio * 37;
    const heroScale = 1 - legRatio * 0.45;
    this.worldLayer.addChild(rect(56, 165, 208, 3, 0x1b2b27, 0.75));
    this.worldLayer.addChild(rect(56, 165, 208 * routeRatio, 3, palette[2], 0.85));
    for (let index = 0; index < (route?.path.length ?? 2); index += 1) {
      const x = 56 + (208 * index) / Math.max(1, (route?.path.length ?? 2) - 1);
      this.worldLayer.addChild(circle(x, 166.5, 3, index <= (route?.legIndex ?? 0) ? palette[2] : 0x5a655f));
    }
    for (let step = 0; step < 3; step += 1) {
      const trailRatio = Math.max(0, legRatio - 0.08 - step * 0.09);
      const trailY = 150 - trailRatio * 37 + 6;
      const trailX = 164 + bend * Math.sin(trailRatio * Math.PI);
      this.worldLayer.addChild(circle(trailX + (step % 2 === 0 ? -2 : 2), trailY, 1.2, palette[2], 0.2 + step * 0.08));
    }
    this.drawHero(state, heroX, heroY, palette, heroScale);
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
    const maze = new Graphics();
    for (const cell of dungeon.cells) {
      if (!discovered.has(cell.id)) continue;
      const x = offsetX + cell.x * cellSize;
      const y = offsetY + cell.y * cellSize;
      this.worldLayer.addChild(
        rect(x + 1, y + 1, cellSize - 2, cellSize - 2, visited.has(cell.id) ? 0x37444a : 0x202a31),
      );
      if (cell.feature !== "empty") {
        const featureColor =
          cell.feature === "treasure"
            ? 0xd7b35c
            : cell.feature === "trap"
              ? 0xa64b4b
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
    const current = dungeon.cells.find((cell) => cell.id === dungeon.currentCellId);
    if (current !== undefined) {
      const x = offsetX + (current.x + 0.5) * cellSize;
      const y = offsetY + (current.y + 0.5) * cellSize;
      this.lightLayer.addChild(circle(x, y, Math.max(2.5, cellSize * 0.24), palette[2]));
      this.lightLayer.addChild(circle(x, y, Math.max(5, cellSize * 0.5), palette[2], 0.13));
    }
    if (discovered.has(dungeon.exitCellId)) {
      const exit = dungeon.cells.find((cell) => cell.id === dungeon.exitCellId);
      if (exit !== undefined) {
        this.worldLayer.addChild(
          rect(
            offsetX + (exit.x + 0.3) * cellSize,
            offsetY + (exit.y + 0.3) * cellSize,
            cellSize * 0.4,
            cellSize * 0.4,
            0x7ab6d9,
          ),
        );
      }
    }
  }

  private drawBattle(state: WorldState, palette: readonly [number, number, number]): void {
    this.worldLayer.addChild(rect(0, 128, designWidth, 52, 0x3b3034));
    const combat = state.depth.combat ?? state.depth.completedCombats.at(-1);
    if (combat === undefined) {
      this.drawHero(state, 91, 139, palette);
      return;
    }
    this.host.dataset.combatId = combat.id;
    this.host.dataset.combatTurn = String(combat.turn);
    this.host.dataset.combatPhase = "settled";
    const activeId = combat.turnOrder[combat.activeIndex];
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
      this.drawStatusMarkers(unit, x, y - 34);
    }
    for (let index = 0; index < enemies.length; index += 1) {
      const unit = enemies[index];
      if (unit === undefined) continue;
      const column = index % 3;
      const row = Math.floor(index / 3);
      const x = 210 + column * 34;
      const y = 117 + row * 39;
      const layer = this.drawMonster(unit, x, y, palette);
      unitVisuals.set(unit.id, { layer, x, y });
      this.drawHealthBar(x - 13, y + 13, 26, unit.health, unit.maxHealth, unit.id === activeId);
      this.drawStatusMarkers(unit, x, y - 34);
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
      this.host.dataset.combatId = combat.id;
      this.host.dataset.combatTurn = String(combat.turn);
      this.host.dataset.combatEvent = cue.id;
      this.host.dataset.combatActor = cue.actorId;
      this.host.dataset.combatTarget = cue.targetId;
      this.host.dataset.combatAction = cue.action;
      this.updateBattleAnimation();
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
