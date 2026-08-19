/**
 * Server-side, THREE-free port of the *topology* portion of
 * app/game/engine/level.ts's Level.generate() — steps 1-4 (sealed border,
 * recursive division with door gaps, loop-punching, pillar clusters) plus
 * step 5 (center spawn search) and step 6 (BFS distance field).
 *
 * Given the same seed, this produces the exact same wall/pillar grid as the
 * client's Level class (both consume the same mulberry32 stream in the same
 * order for these steps), which is all the server needs to pick safe,
 * distinct, non-wall, non-pillar player spawn cells without ever building a
 * THREE.js scene. Page/art/water/false-exit placement (which consume more of
 * the rng stream) are intentionally NOT replicated here — the server doesn't
 * need them, and skipping them keeps this file small.
 */
import { mulberry32, Rand, randInt } from "../../app/game/engine/rng";

export const SIZE = 48;
export const CELL = 4;
const OPEN = 0;
const PILLAR = 2;

export class MazeCore {
  readonly size = SIZE;
  grid: Uint8Array;
  wallV: Uint8Array;
  wallH: Uint8Array;
  spawnCell = { x: 0, z: 0 };
  distFromSpawn!: Int32Array;
  reachable: { x: number; z: number; d: number }[] = [];

  constructor(seed: number) {
    const rng = mulberry32(seed);
    const S = this.size;
    this.grid = new Uint8Array(S * S).fill(OPEN);
    this.wallV = new Uint8Array((S + 1) * S);
    this.wallH = new Uint8Array(S * (S + 1));
    this.generate(rng);
  }

  private vIdx(x: number, z: number) {
    return x * this.size + z;
  }
  private hIdx(x: number, z: number) {
    return z * this.size + x;
  }

  cell(x: number, z: number): number {
    if (x < 0 || z < 0 || x >= this.size || z >= this.size) return 1; // SOLID
    return this.grid[z * this.size + x];
  }
  isBlocked(x: number, z: number): boolean {
    return this.cell(x, z) !== OPEN;
  }
  hasWallV(x: number, z: number): boolean {
    if (x < 0 || x > this.size || z < 0 || z >= this.size) return true;
    return this.wallV[this.vIdx(x, z)] === 1;
  }
  hasWallH(x: number, z: number): boolean {
    if (z < 0 || z > this.size || x < 0 || x >= this.size) return true;
    return this.wallH[this.hIdx(x, z)] === 1;
  }
  canMove(x: number, z: number, dx: number, dz: number): boolean {
    const nx = x + dx, nz = z + dz;
    if (this.isBlocked(nx, nz)) return false;
    if (dx === 1) return !this.hasWallV(x + 1, z);
    if (dx === -1) return !this.hasWallV(x, z);
    if (dz === 1) return !this.hasWallH(x, z + 1);
    if (dz === -1) return !this.hasWallH(x, z);
    return true;
  }

  worldX(cx: number): number {
    return (cx - this.size / 2) * CELL + CELL / 2;
  }
  worldZ(cz: number): number {
    return (cz - this.size / 2) * CELL + CELL / 2;
  }

  private generate(rng: Rand) {
    const S = this.size;

    // 1) Sealed border.
    for (let z = 0; z < S; z++) {
      this.wallV[this.vIdx(0, z)] = 1;
      this.wallV[this.vIdx(S, z)] = 1;
    }
    for (let x = 0; x < S; x++) {
      this.wallH[this.hIdx(x, 0)] = 1;
      this.wallH[this.hIdx(x, S)] = 1;
    }

    // 2) Recursive division with door gaps.
    const divide = (x0: number, z0: number, x1: number, z1: number, depth: number) => {
      const w = x1 - x0 + 1;
      const h = z1 - z0 + 1;
      if (w < 3 && h < 3) return;
      if (w * h <= 30 && rng() < 0.3 && depth > 2) return;

      const vertical = w === h ? rng() < 0.5 : w > h;
      if (vertical && w >= 3) {
        const sx = randInt(rng, x0 + 1, x1);
        for (let z = z0; z <= z1; z++) this.wallV[this.vIdx(sx, z)] = 1;
        const gaps = 1 + (h > 5 && rng() < 0.55 ? 1 : 0);
        for (let g = 0; g < gaps; g++) {
          const gz = randInt(rng, z0, z1);
          this.wallV[this.vIdx(sx, gz)] = 0;
          if (rng() < 0.45 && gz + 1 <= z1) this.wallV[this.vIdx(sx, gz + 1)] = 0;
        }
        divide(x0, z0, sx - 1, z1, depth + 1);
        divide(sx, z0, x1, z1, depth + 1);
      } else if (h >= 3) {
        const sz = randInt(rng, z0 + 1, z1);
        for (let x = x0; x <= x1; x++) this.wallH[this.hIdx(x, sz)] = 1;
        const gaps = 1 + (w > 5 && rng() < 0.55 ? 1 : 0);
        for (let g = 0; g < gaps; g++) {
          const gx = randInt(rng, x0, x1);
          this.wallH[this.hIdx(gx, sz)] = 0;
          if (rng() < 0.45 && gx + 1 <= x1) this.wallH[this.hIdx(gx + 1, sz)] = 0;
        }
        divide(x0, z0, x1, sz - 1, depth + 1);
        divide(x0, sz, x1, z1, depth + 1);
      }
    };
    divide(0, 0, S - 1, S - 1, 0);

    // 3) Loop-punching.
    for (let x = 1; x < S; x++) {
      for (let z = 0; z < S; z++) {
        if (this.wallV[this.vIdx(x, z)] === 1 && rng() < 0.06) this.wallV[this.vIdx(x, z)] = 0;
      }
    }
    for (let z = 1; z < S; z++) {
      for (let x = 0; x < S; x++) {
        if (this.wallH[this.hIdx(x, z)] === 1 && rng() < 0.06) this.wallH[this.hIdx(x, z)] = 0;
      }
    }

    // 4) Pillar clusters.
    for (let i = 0; i < 8; i++) {
      const cx = randInt(rng, 4, S - 5);
      const cz = randInt(rng, 4, S - 5);
      for (let z = cz - 3; z <= cz + 3; z++) {
        for (let x = cx - 3; x <= cx + 3; x++) {
          if (x % 2 !== 0 || z % 2 !== 0 || rng() > 0.7) continue;
          const clear =
            !this.hasWallV(x, z) && !this.hasWallV(x + 1, z) &&
            !this.hasWallH(x, z) && !this.hasWallH(x, z + 1);
          if (clear) this.grid[z * S + x] = PILLAR;
        }
      }
    }

    // 5) Spawn near center.
    const c = Math.floor(S / 2);
    outer: for (let radius = 0; radius < S; radius++) {
      for (let z = c - radius; z <= c + radius; z++) {
        for (let x = c - radius; x <= c + radius; x++) {
          if (this.cell(x, z) === OPEN) {
            this.spawnCell = { x, z };
            break outer;
          }
        }
      }
    }

    // 6) BFS distance field from spawn.
    this.distFromSpawn = new Int32Array(S * S).fill(-1);
    const queue: number[] = [this.spawnCell.z * S + this.spawnCell.x];
    this.distFromSpawn[queue[0]] = 0;
    let qi = 0;
    while (qi < queue.length) {
      const cur = queue[qi++];
      const cx = cur % S, cz = Math.floor(cur / S);
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (!this.canMove(cx, cz, dx, dz)) continue;
        const ni = (cz + dz) * S + (cx + dx);
        if (this.distFromSpawn[ni] === -1) {
          this.distFromSpawn[ni] = this.distFromSpawn[cur] + 1;
          queue.push(ni);
        }
      }
    }
    for (let z = 0; z < S; z++) {
      for (let x = 0; x < S; x++) {
        const d = this.distFromSpawn[z * S + x];
        if (d > 0) this.reachable.push({ x, z, d });
      }
    }
    this.reachable.sort((a, b) => a.d - b.d);
  }

  /**
   * Pick `count` distinct, open, mutually-spaced cells in the near-to-mid
   * distance band from the level's central spawn point (roughly the same
   * region the single-player run itself starts in). The entity's own spawn
   * (mirrored deterministically on every client from the shared seed) is
   * always drawn from the FAR band (>=70% of reachable — see level.ts step
   * 9), so keeping players in the near/mid band keeps every player spawn
   * clear of the monster without needing to replicate that draw here.
   */
  pickPlayerSpawns(count: number, seed: number): { x: number; z: number }[] {
    const rng = mulberry32(seed ^ 0x5eed);
    const hiIdx = Math.max(1, Math.floor(this.reachable.length * 0.45));
    const candidates = this.reachable.slice(0, hiIdx).filter((c) => c.d >= 1);

    const chosen: { x: number; z: number }[] = [];
    const minSep = 3; // manhattan cells
    let guard = 0;
    while (chosen.length < count && guard++ < 2000) {
      const cand = candidates.length > 0
        ? candidates[randInt(rng, 0, candidates.length - 1)]
        : this.reachable[randInt(rng, 0, this.reachable.length - 1)];
      if (chosen.some((p) => Math.abs(p.x - cand.x) + Math.abs(p.z - cand.z) < minSep)) continue;
      chosen.push({ x: cand.x, z: cand.z });
    }
    // Fallback: if the maze is too small/dense to find enough spaced cells,
    // fill remaining slots from any open cell (still never inside a wall).
    while (chosen.length < count) {
      const cand = this.reachable[randInt(rng, 0, this.reachable.length - 1)] ?? this.spawnCell;
      chosen.push({ x: cand.x, z: cand.z });
    }
    return chosen;
  }
}
