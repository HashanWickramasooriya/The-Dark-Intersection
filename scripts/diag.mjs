/** Diagnostic: flood the scene with ambient light to verify wall geometry. */
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
await page.goto("http://localhost:3000", { waitUntil: "networkidle2", timeout: 60000 });
await page.waitForFunction(() => {
  const b = [...document.querySelectorAll("button")].find((x) => x.textContent.includes("ENTER"));
  return b && !b.disabled;
});
await page.click("button");
await new Promise((r) => setTimeout(r, 1000));

await page.evaluate(() => {
  const e = window.__backrooms;
  e.scene.traverse((o) => {
    if (o.isAmbientLight) o.intensity = 6;
  });
  e.scene.fog.density = 0.004;
  const lvl = e.level;
  const p = e.player;
  // same doorway-finding as i7
  for (let x = 1; x < lvl.size; x++) {
    for (let z = 1; z < lvl.size - 1; z++) {
      if (
        !lvl.hasWallV(x, z) && lvl.hasWallV(x, z - 1) && lvl.hasWallV(x, z + 1) &&
        !lvl.isBlocked(x - 1, z) && !lvl.isBlocked(x, z)
      ) {
        p.pos.set(lvl.worldX(x - 1) - 1.2, 0, lvl.worldZ(z));
        p.yaw = -Math.PI / 2;
        return;
      }
    }
  }
});
await new Promise((r) => setTimeout(r, 600));
await page.screenshot({ path: "scripts/shots/diag-bright.png" });

// player body looking down while walking
await page.evaluate(() => {
  window.__backrooms.player.pitch = -1.35;
});
await page.keyboard.down("KeyW");
await new Promise((r) => setTimeout(r, 700));
await page.screenshot({ path: "scripts/shots/diag-body.png" });
await page.keyboard.up("KeyW");

// entity close-up, well lit, facing the camera (LOS-checked placement)
await page.evaluate(() => {
  const e = window.__backrooms;
  const lvl = e.level;
  const p = e.player;
  const ent = e.entity;
  ent.activate();
  const f = p.forward;
  const pc = lvl.cellOf(p.pos.x, p.pos.z);
  let d = 3;
  for (let trial = 5.5; trial >= 2.5; trial -= 0.5) {
    const c = lvl.cellOf(p.pos.x + f.x * trial, p.pos.z + f.z * trial);
    if (!lvl.isBlocked(c.x, c.z) && lvl.lineOfSight(pc.x, pc.z, c.x, c.z)) {
      d = trial;
      break;
    }
  }
  ent.pos.set(p.pos.x + f.x * d, 0, p.pos.z + f.z * d);
  ent.heading = Math.atan2(-f.x, -f.z);
  ent.root.visible = true;
  p.pitch = 0.12;
});
await new Promise((r) => setTimeout(r, 500));
await page.screenshot({ path: "scripts/shots/diag-entity.png" });

// entity mid-chase reach (arms up, fingers splayed) — may end in a kill
await page.evaluate(() => {
  const e = window.__backrooms;
  e.entity.setState("chase");
});
await new Promise((r) => setTimeout(r, 550));
await page.screenshot({ path: "scripts/shots/diag-entity-chase.png" });

await browser.close();
console.log("done");
