/** Verify the dev cheat system: unlock via "redrum", then each toggle. */
import puppeteer from "puppeteer-core";

const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
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
await page.waitForFunction(() => {
  const b = [...document.querySelectorAll("button")].find((x) => x.textContent.includes("ENTER"));
  return b && !b.disabled;
}, { timeout: 30000 });
await page.click("button");
await new Promise((r) => setTimeout(r, 900));

// type the code
await page.keyboard.type("redrum", { delay: 60 });
await new Promise((r) => setTimeout(r, 300));
const unlocked = await page.evaluate(() =>
  document.body.innerText.includes("CHEATS UNLOCKED"),
);
console.log("UNLOCK TOAST:", unlocked ? "OK" : "FAILED");

const press = async (key) => {
  await page.keyboard.down(key);
  await new Promise((r) => setTimeout(r, 60));
  await page.keyboard.up(key);
  await new Promise((r) => setTimeout(r, 250));
};

await press("KeyG");
await press("KeyN");
await press("KeyB");
await press("KeyX");
const flags = await page.evaluate(() => {
  const c = window.__backrooms.cheats;
  return { god: c.god, noclip: c.noclip, fullbright: c.fullbright, freeze: c.freeze };
});
console.log("TOGGLES:", JSON.stringify(flags),
  flags.god && flags.noclip && flags.fullbright && flags.freeze ? "OK" : "FAILED");

// persistent HUD indicator lists every active cheat
const hudShows = await page.evaluate(() =>
  document.body.innerText.includes("CHEATS: GOD · NOCLIP · BRIGHT · FROZEN"),
);
console.log("HUD INDICATOR:", hudShows ? "OK" : "FAILED");

await press("KeyP");
const pages = await page.evaluate(() => window.__backrooms.items.collected);
console.log("ALL PAGES:", pages === 8 ? "OK" : `FAILED (${pages})`);

await press("KeyT");
const nearDoor = await page.evaluate(() => {
  const e = window.__backrooms;
  const d = e.level.exit.doorPos;
  return Math.hypot(e.player.pos.x - d.x, e.player.pos.z - d.z) < 3;
});
console.log("TELEPORT TO EXIT:", nearDoor ? "OK" : "FAILED");
await new Promise((r) => setTimeout(r, 400));
await page.screenshot({ path: "scripts/shots/cheat-door.png" });

console.log("=== ISSUES (" + errors.length + ") ===");
for (const e of errors.slice(0, 20)) console.log(e);
await browser.close();
