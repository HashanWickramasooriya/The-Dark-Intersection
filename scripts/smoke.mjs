/**
 * Headless smoke test: boots the game in Edge, walks around, screenshots.
 * Usage: node scripts/smoke.mjs
 */
import puppeteer from "puppeteer-core";
import { mkdirSync } from "node:fs";

const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const URL = "http://localhost:3000";
mkdirSync("scripts/shots", { recursive: true });

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: true,
  args: [
    "--window-size=1280,720",
    "--mute-audio",
    "--autoplay-policy=no-user-gesture-required",
    "--enable-unsafe-swiftshader",
  ],
  defaultViewport: { width: 1280, height: 720 },
});

const page = await browser.newPage();
const errors = [];
page.on("console", (msg) => {
  if (msg.type() === "error" || msg.type() === "warning") {
    errors.push(`[${msg.type()}] ${msg.text()}`);
  }
});
page.on("pageerror", (err) => errors.push(`[pageerror] ${err.message}`));

await page.goto(URL, { waitUntil: "networkidle2", timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));
await page.screenshot({ path: "scripts/shots/1-menu.png" });

// Wait for generation to finish, then enter.
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
await new Promise((r) => setTimeout(r, 2000));
await page.screenshot({ path: "scripts/shots/2-spawn.png" });

// Walk forward + look around for a few seconds.
await page.keyboard.down("KeyW");
await new Promise((r) => setTimeout(r, 2500));
await page.mouse.move(640, 360);
await page.mouse.move(900, 380); // look right (only works if lock succeeded)
await new Promise((r) => setTimeout(r, 1500));
await page.screenshot({ path: "scripts/shots/3-walk.png" });
await page.keyboard.up("KeyW");

// Toggle flashlight off to check the dark look.
await page.keyboard.press("KeyF");
await new Promise((r) => setTimeout(r, 800));
await page.screenshot({ path: "scripts/shots/4-dark.png" });
await page.keyboard.press("KeyF");

// Sprint a bit.
await page.keyboard.down("ShiftLeft");
await page.keyboard.down("KeyW");
await new Promise((r) => setTimeout(r, 2500));
await page.screenshot({ path: "scripts/shots/5-sprint.png" });
await page.keyboard.up("KeyW");
await page.keyboard.up("ShiftLeft");

const hud = await page.evaluate(() => document.body.innerText);
console.log("=== HUD TEXT ===\n" + hud);
console.log("=== CONSOLE ISSUES (" + errors.length + ") ===");
for (const e of errors.slice(0, 30)) console.log(e);

await browser.close();
