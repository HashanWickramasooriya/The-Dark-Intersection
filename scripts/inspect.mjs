/**
 * Deep visual inspection via the dev __backrooms hook.
 * Stages the camera/entity to verify key scenes render correctly.
 */
import puppeteer from "puppeteer-core";
import { mkdirSync } from "node:fs";

const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
mkdirSync("scripts/shots", { recursive: true });

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: true,
  args: ["--mute-audio", "--enable-unsafe-swiftshader", "--window-size=1280,720"],
  defaultViewport: { width: 1280, height: 720 },
});
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (err) => errors.push(`[pageerror] ${err.message}`));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(`[console] ${m.text()}`);
});

await page.goto("http://localhost:3000", { waitUntil: "networkidle2", timeout: 60000 });
await page.waitForFunction(
  () => {
    const b = [...document.querySelectorAll("button")].find((x) =>
      x.textContent.includes("ENTER"),
    );
    return b && !b.disabled;
  },
  { timeout: 30000 },
);
await page.click("button");
await new Promise((r) => setTimeout(r, 1200));

// --- 1. face the longest open run from spawn (walk-through doorway views)
await page.evaluate(() => {
  const e = window.__backrooms;
  const lvl = e.level;
  const s = lvl.spawnCell;
  let best = { dx: 0, dz: 1, len: 0 };
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    let len = 0;
    let cx = s.x, cz = s.z;
    while (len < 20 && lvl.canMove(cx, cz, dx, dz)) {
      cx += dx; cz += dz; len++;
    }
    if (len > best.len) best = { dx, dz, len };
  }
  e.player.yaw = Math.atan2(-best.dx, -best.dz);
  e.player.pitch = 0;
});
await new Promise((r) => setTimeout(r, 700));
await page.screenshot({ path: "scripts/shots/i1-corridor.png" });

// --- 2. entity 8.5m ahead (outside flashlight-interference range)
await page.evaluate(() => {
  const e = window.__backrooms;
  const p = e.player;
  const ent = e.entity;
  ent.activate();
  const f = p.forward;
  ent.pos.set(p.pos.x + f.x * 8.5, 0, p.pos.z + f.z * 8.5);
  ent.heading = Math.atan2(-f.x, -f.z);
  ent.root.visible = true;
});
await new Promise((r) => setTimeout(r, 500));
await page.screenshot({ path: "scripts/shots/i2-entity.png" });

// --- 3. page on a wall + interaction prompt
await page.evaluate(() => {
  const e = window.__backrooms;
  const p = e.player;
  const ent = e.entity;
  // park the entity far away again
  const far = e.level.entitySpawnCell;
  ent.pos.set(e.level.worldX(far.x), 0, e.level.worldZ(far.z));
  const spot = e.level.pageSpots[0];
  // stand back at a ~30 degree angle so the torch hotspot misses the page
  const sx = spot.normal.z, sz = -spot.normal.x;
  const px = spot.pos.x + spot.normal.x * 2.2 + sx * 1.1;
  const pz = spot.pos.z + spot.normal.z * 2.2 + sz * 1.1;
  p.pos.set(px, 0, pz);
  const tx = spot.pos.x - px, tz = spot.pos.z - pz;
  const tl = Math.hypot(tx, tz);
  p.yaw = Math.atan2(-tx / tl, -tz / tl);
  p.pitch = -0.06;
});
await new Promise((r) => setTimeout(r, 600));
await page.screenshot({ path: "scripts/shots/i3-page.png" });

// --- 4. the exit door
await page.evaluate(() => {
  const e = window.__backrooms;
  const p = e.player;
  const exit = e.level.exit;
  p.pos.set(
    exit.doorPos.x + exit.facing.x * 2.6,
    0,
    exit.doorPos.z + exit.facing.z * 2.6,
  );
  // look back along -facing, toward the door
  p.yaw = Math.atan2(exit.facing.x, exit.facing.z);
  p.pitch = -0.05;
});
await new Promise((r) => setTimeout(r, 600));
await page.screenshot({ path: "scripts/shots/i4-door.png" });

// --- 5. chase glitch FX
await page.evaluate(() => {
  const e = window.__backrooms;
  const p = e.player;
  const ent = e.entity;
  const f = p.forward;
  ent.pos.set(p.pos.x + f.x * 6, 0, p.pos.z + f.z * 6);
  ent.setState("chase");
});
await new Promise((r) => setTimeout(r, 700));
await page.screenshot({ path: "scripts/shots/i5-chase.png" });

// --- 6. look down at your own 3D body mid-stride
await page.evaluate(() => {
  const e = window.__backrooms;
  const ent = e.entity;
  const far = e.level.entitySpawnCell;
  ent.pos.set(e.level.worldX(far.x), 0, e.level.worldZ(far.z));
  ent.setState("roam");
  e.player.pos.copy(e.level.spawn);
  e.player.pitch = -1.25;
});
await page.keyboard.down("KeyW");
await new Promise((r) => setTimeout(r, 650));
await page.screenshot({ path: "scripts/shots/i6-body.png" });
await page.keyboard.up("KeyW");

// --- 7. doorway into a neighboring room (everything is enterable)
await page.evaluate(() => {
  const e = window.__backrooms;
  const lvl = e.level;
  const p = e.player;
  p.pitch = 0;
  // find a doorway: a missing wall segment with walls on both sides of it
  for (let x = 1; x < lvl.size; x++) {
    for (let z = 1; z < lvl.size - 1; z++) {
      if (
        !lvl.hasWallV(x, z) && lvl.hasWallV(x, z - 1) && lvl.hasWallV(x, z + 1) &&
        !lvl.isBlocked(x - 1, z) && !lvl.isBlocked(x, z)
      ) {
        p.pos.set(lvl.worldX(x - 1) - 1.2, 0, lvl.worldZ(z));
        p.yaw = -Math.PI / 2; // face +X through the gap
        return;
      }
    }
  }
});
await new Promise((r) => setTimeout(r, 700));
await page.screenshot({ path: "scripts/shots/i7-doorway.png" });

console.log("=== ISSUES (" + errors.length + ") ===");
for (const e of errors.slice(0, 20)) console.log(e);
await browser.close();
