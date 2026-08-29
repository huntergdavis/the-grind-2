import { Application, Container, Graphics } from "pixi.js";
import { randomInt } from "../core/rng";
import type { SceneMode, WorldState } from "../core/types";
import { projectHeroAppearance } from "./hero-appearance";
import { animatedLayerY, calculateSceneLayout } from "./layout";

const designWidth = 320;
const designHeight = 180;

const palettes: Record<SceneMode, readonly [number, number, number]> = {
  town: [0x16283b, 0xdd9c57, 0x79b392],
  atlas: [0x172b36, 0x567f61, 0xe3c47b],
  travel: [0x1c3341, 0x456856, 0xdbba70],
  dungeon: [0x111820, 0x46505a, 0xd5985b],
  battle: [0x28171d, 0x933f43, 0xffc857],
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

export class GameRenderer {
  private readonly app = new Application();
  private readonly worldLayer = new Container();
  private readonly lightLayer = new Container();
  private elapsed = 0;
  private paused = false;
  private lightBaseY = 0;

  private constructor(private readonly host: HTMLElement) {}

  static async mount(host: HTMLElement): Promise<GameRenderer> {
    const renderer = new GameRenderer(host);
    await renderer.app.init({
      antialias: true,
      autoDensity: true,
      backgroundColor: 0x111827,
      powerPreference: "low-power",
      preference: "webgl",
      resizeTo: host,
      resolution: Math.min(window.devicePixelRatio, 2),
    });
    renderer.app.ticker.maxFPS = 30;
    renderer.app.stage.addChild(renderer.worldLayer, renderer.lightLayer);
    renderer.host.append(renderer.app.canvas);
    renderer.layout();
    window.addEventListener("resize", () => renderer.layout(), { passive: true });
    renderer.app.ticker.add((ticker) => {
      if (renderer.paused) return;
      renderer.elapsed += ticker.deltaMS / 1000;
      renderer.lightLayer.alpha = 0.88 + Math.sin(renderer.elapsed * 1.7) * 0.08;
      renderer.lightLayer.y = animatedLayerY(renderer.lightBaseY, renderer.elapsed);
    });
    return renderer;
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
  }

  render(state: WorldState): void {
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
    for (const child of layer.removeChildren()) child.destroy();
  }

  private layout(): void {
    const layout = calculateSceneLayout(this.app.screen.width, this.app.screen.height, designWidth, designHeight);
    this.worldLayer.scale.set(layout.scale);
    this.worldLayer.position.set(layout.x, layout.y);
    this.lightLayer.scale.set(layout.scale);
    this.lightBaseY = layout.y;
    this.lightLayer.position.set(layout.x, animatedLayerY(this.lightBaseY, this.elapsed));
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

  private drawHero(state: WorldState, x: number, y: number, palette: readonly [number, number, number]): void {
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

  private drawAtlas(state: WorldState, palette: readonly [number, number, number]): void {
    this.worldLayer.addChild(rect(44, 29, 232, 132, 0xd9c28d));
    this.worldLayer.addChild(rect(48, 33, 224, 124, 0x9f8a5e, 0.25));
    const atlas = state.depth.atlas;
    const point = (locationId: string): readonly [number, number] => {
      const location = atlas.locations.find((candidate) => candidate.id === locationId);
      return location === undefined
        ? [160, 90]
        : [50 + location.x * 2.2, 35 + location.y * 1.15];
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
    for (const edge of atlas.edges) {
      const [fromX, fromY] = point(edge.from);
      const [toX, toY] = point(edge.to);
      const selected = routeEdges.has(edge.id);
      this.worldLayer.addChild(
        new Graphics()
          .moveTo(fromX, fromY)
          .lineTo(toX, toY)
          .stroke({ color: selected ? 0x713c43 : 0x7d745e, width: selected ? 3 : 1, alpha: selected ? 1 : 0.55 }),
      );
    }
    for (const location of atlas.locations) {
      const [x, y] = point(location.id);
      const discovered = atlas.discoveredLocationIds.includes(location.id);
      const color =
        location.kind === "town"
          ? 0x8b4b46
          : location.kind === "dungeon"
            ? 0x433d57
            : location.kind === "landmark"
              ? 0xb58a46
              : palette[1];
      this.worldLayer.addChild(circle(x, y, location.kind === "town" ? 4 : 3, color, discovered ? 1 : 0.35));
    }
    let [partyX, partyY] = point(atlas.currentLocationId);
    if (atlas.route !== null) {
      const from = atlas.route.path[atlas.route.legIndex];
      const to = atlas.route.path[atlas.route.legIndex + 1];
      const edge = atlas.edges.find(
        (candidate) =>
          from !== undefined &&
          to !== undefined &&
          ((candidate.from === from && candidate.to === to) ||
            (candidate.from === to && candidate.to === from)),
      );
      if (from !== undefined && to !== undefined && edge !== undefined) {
        const [fromX, fromY] = point(from);
        const [toX, toY] = point(to);
        const ratio = atlas.route.legProgress / edge.distance;
        partyX = fromX + (toX - fromX) * ratio;
        partyY = fromY + (toY - fromY) * ratio;
      }
    }
    this.lightLayer.addChild(circle(partyX, partyY, 5, palette[2]));
    this.lightLayer.addChild(circle(partyX, partyY, 10, palette[2], 0.18));
  }

  private drawTravel(state: WorldState, palette: readonly [number, number, number]): void {
    this.worldLayer.addChild(rect(0, 126, designWidth, 54, 0x304c3f));
    this.worldLayer.addChild(
      new Graphics()
        .moveTo(102, 180)
        .bezierCurveTo(141, 147, 160, 148, 151, 111)
        .lineTo(180, 111)
        .bezierCurveTo(195, 151, 182, 161, 217, 180)
        .closePath()
        .fill(0xa48761),
    );
    for (let index = 0; index < 9; index += 1) {
      const x = randomInt(320, state.seed, "visual", "travel", state.tick, "grass", index);
      this.worldLayer.addChild(rect(x, 119 + (index % 3) * 12, 3, 23, palette[1]));
      this.worldLayer.addChild(circle(x + 1.5, 117 + (index % 3) * 12, 7, 0x365f4c));
    }
    const route = state.depth.atlas.route;
    const ratio = route === null ? 0 : route.distanceTravelled / Math.max(1, route.totalDistance);
    const heroX = 78 + ratio * 164;
    this.worldLayer.addChild(rect(56, 165, 208, 3, 0x1b2b27, 0.75));
    this.worldLayer.addChild(rect(56, 165, 208 * ratio, 3, palette[2], 0.85));
    for (let index = 0; index < (route?.path.length ?? 2); index += 1) {
      const x = 56 + (208 * index) / Math.max(1, (route?.path.length ?? 2) - 1);
      this.worldLayer.addChild(circle(x, 166.5, 3, index <= (route?.legIndex ?? 0) ? palette[2] : 0x5a655f));
    }
    this.drawHero(state, heroX, 143, palette);
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
    const activeId = combat.turnOrder[combat.activeIndex];
    const heroes = combat.combatants.filter((unit) => unit.side === "heroes");
    const enemies = combat.combatants.filter((unit) => unit.side === "enemies");
    for (let index = 0; index < heroes.length; index += 1) {
      const unit = heroes[index];
      if (unit === undefined) continue;
      const x = 74 + index * 34;
      const y = 139 - index * 14;
      this.drawHero(state, x, y, palette);
      this.drawHealthBar(x - 12, y + 17, 24, unit.health, unit.maxHealth, unit.id === activeId);
    }
    for (let index = 0; index < enemies.length; index += 1) {
      const unit = enemies[index];
      if (unit === undefined) continue;
      const column = index % 3;
      const row = Math.floor(index / 3);
      const x = 210 + column * 34;
      const y = 117 + row * 39;
      const bodyColor = unit.health <= 0 ? 0x343a37 : 0x4b7754;
      this.worldLayer.addChild(circle(x, y - 18, 10, bodyColor));
      this.worldLayer.addChild(rect(x - 9, y - 9, 18, 19, bodyColor));
      this.worldLayer.addChild(circle(x - 4, y - 20, 1.5, palette[2]));
      this.worldLayer.addChild(circle(x + 4, y - 20, 1.5, palette[2]));
      this.drawHealthBar(x - 13, y + 13, 26, unit.health, unit.maxHealth, unit.id === activeId);
      for (let statusIndex = 0; statusIndex < unit.statuses.length; statusIndex += 1) {
        this.lightLayer.addChild(circle(x - 6 + statusIndex * 6, y - 34, 2, 0xb074c4));
      }
    }
    const impactX = 150 + randomInt(20, state.seed, "visual", "battle", state.tick, "impact");
    for (let ray = 0; ray < 8; ray += 1) {
      const angle = (Math.PI * ray) / 4;
      this.lightLayer.addChild(
        new Graphics()
          .moveTo(impactX + Math.cos(angle) * 9, 104 + Math.sin(angle) * 9)
          .lineTo(impactX + Math.cos(angle) * 22, 104 + Math.sin(angle) * 22)
          .stroke({ color: palette[2], width: 2 }),
      );
    }
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
