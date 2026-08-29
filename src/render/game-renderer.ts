import { Application, Container, Graphics } from "pixi.js";
import { randomInt } from "../core/rng";
import type { SceneMode, WorldState } from "../core/types";

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
      renderer.lightLayer.y = Math.sin(renderer.elapsed * 0.7) * 0.8;
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
        this.drawTown(palette);
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
    const scale = Math.min(
      this.app.screen.width / designWidth,
      this.app.screen.height / designHeight,
    );
    for (const layer of [this.worldLayer, this.lightLayer]) {
      layer.scale.set(scale);
      layer.position.set(
        (this.app.screen.width - designWidth * scale) / 2,
        (this.app.screen.height - designHeight * scale) / 2,
      );
    }
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

  private drawHero(x: number, y: number, palette: readonly [number, number, number]): void {
    this.lightLayer.addChild(circle(x, y - 18, 5, 0xf6d2a6));
    this.lightLayer.addChild(rect(x - 5, y - 13, 10, 17, palette[2]));
    this.lightLayer.addChild(rect(x - 7, y - 10, 3, 14, 0x432d3a));
    this.lightLayer.addChild(rect(x + 4, y - 10, 3, 14, 0x432d3a));
    this.lightLayer.addChild(rect(x - 5, y + 3, 4, 11, 0x17212e));
    this.lightLayer.addChild(rect(x + 1, y + 3, 4, 11, 0x17212e));
  }

  private drawTown(palette: readonly [number, number, number]): void {
    const buildings = [
      [18, 83, 48, 49],
      [74, 67, 58, 65],
      [144, 78, 46, 54],
      [201, 59, 74, 73],
      [283, 87, 32, 45],
    ] as const;
    for (const [x, y, width, height] of buildings) {
      this.worldLayer.addChild(rect(x, y, width, height, 0xc98055));
      this.worldLayer.addChild(
        new Graphics()
          .poly([x - 4, y, x + width / 2, y - 18, x + width + 4, y])
          .fill(0x613f4b),
      );
      this.worldLayer.addChild(rect(x + 8, y + 14, 8, 9, palette[2], 0.78));
    }
    this.worldLayer.addChild(rect(0, 132, designWidth, 48, 0x345446));
    this.worldLayer.addChild(
      new Graphics()
        .moveTo(128, 180)
        .bezierCurveTo(137, 159, 156, 143, 176, 132)
        .lineTo(202, 132)
        .bezierCurveTo(177, 149, 167, 165, 164, 180)
        .closePath()
        .fill(0xb6956a),
    );
    this.drawHero(172, 146, palette);
  }

  private drawAtlas(state: WorldState, palette: readonly [number, number, number]): void {
    this.worldLayer.addChild(rect(44, 29, 232, 132, 0xd9c28d));
    this.worldLayer.addChild(rect(48, 33, 224, 124, 0x9f8a5e, 0.25));
    const route = new Graphics()
      .moveTo(68, 132)
      .bezierCurveTo(103, 87, 144, 127, 172, 80)
      .bezierCurveTo(193, 45, 225, 70, 252, 45)
      .stroke({ color: 0x6f3b3b, width: 3 });
    this.worldLayer.addChild(route);
    for (let index = 0; index < 18; index += 1) {
      const x = 57 + randomInt(204, state.seed, "visual", "atlas", state.tick, "tree-x", index);
      const y = 40 + randomInt(105, state.seed, "visual", "atlas", state.tick, "tree-y", index);
      this.worldLayer.addChild(circle(x, y, 2.5, palette[1], 0.78));
    }
    const waypoint = 68 + (state.tick % 6) * 36;
    this.lightLayer.addChild(circle(waypoint, 99, 5, palette[2]));
    this.lightLayer.addChild(circle(waypoint, 99, 10, palette[2], 0.18));
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
    this.drawHero(161, 143, palette);
  }

  private drawDungeon(state: WorldState, palette: readonly [number, number, number]): void {
    this.worldLayer.addChild(rect(34, 19, 252, 142, 0x0b1117));
    const maze = new Graphics();
    for (let column = 0; column < 12; column += 1) {
      for (let row = 0; row < 7; row += 1) {
        if (randomInt(3, state.seed, "visual", "maze", state.tick, "wall", column * 7 + row) === 0) continue;
        const x = 42 + column * 20;
        const y = 27 + row * 18;
        if ((column + row) % 2 === 0) maze.moveTo(x, y).lineTo(x + 16, y);
        else maze.moveTo(x, y).lineTo(x, y + 14);
      }
    }
    maze.stroke({ color: palette[1], width: 4 });
    this.worldLayer.addChild(maze);
    this.lightLayer.addChild(circle(160, 92, 42, palette[2], 0.08));
    this.drawHero(160, 103, palette);
  }

  private drawBattle(state: WorldState, palette: readonly [number, number, number]): void {
    this.worldLayer.addChild(rect(0, 128, designWidth, 52, 0x3b3034));
    const monsterX = 222;
    const monsterY = 125;
    this.worldLayer.addChild(circle(monsterX, monsterY - 22, 24, 0x4b7754));
    this.worldLayer.addChild(circle(monsterX - 18, monsterY - 36, 9, 0x4b7754));
    this.worldLayer.addChild(circle(monsterX + 18, monsterY - 36, 9, 0x4b7754));
    this.worldLayer.addChild(circle(monsterX - 8, monsterY - 25, 2, palette[2]));
    this.worldLayer.addChild(circle(monsterX + 8, monsterY - 25, 2, palette[2]));
    this.worldLayer.addChild(rect(monsterX - 18, monsterY, 9, 20, 0x34543d));
    this.worldLayer.addChild(rect(monsterX + 9, monsterY, 9, 20, 0x34543d));
    this.drawHero(91, 139, palette);
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
    this.drawHero(118, 151, palette);
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
