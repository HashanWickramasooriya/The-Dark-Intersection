/**
 * Multiplayer menu + lobby smoke test: boots the menu, verifies the two
 * mode buttons, creates a multiplayer room, screenshots the lobby.
 * Usage: node scripts/mp-smoke.mjs
 */
import puppeteer from "puppeteer-core";
import { mkdirSync } from "node:fs";

const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const URL = "http://localhost:3000";
mkdirSync("scripts/shots", { recursive: true });

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: true,
  args: ["--window-size=1280,720", "--mute-audio", "--autoplay-policy=no-user-gesture-required", "--enable-unsafe-swiftshader", "--no-sandbox", "--disable-gpu"],
  defaultViewport: { width: 1280, height: 720 },
});

const page = await browser.newPage();
const errors = [];
page.on("console", (msg) => {
  if (msg.type() === "error") errors.push(`[console.error] ${msg.text()}`);
});
page.on("pageerror", (err) => errors.push(`[pageerror] ${err.message}`));

await page.goto(URL, { waitUntil: "networkidle2", timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));
await page.screenshot({ path: "scripts/shots/mp-1-menu.png" });

const menuText = await page.evaluate(() => document.body.innerText);
console.log("=== MENU TEXT CONTAINS ===");
console.log("තනි ක්‍රීඩාව:", menuText.includes("තනි ක්‍රීඩාව"));
console.log("බහු ක්‍රීඩක:", menuText.includes("බහු ක්‍රීඩක"));
console.log("අඳුරු මංසන්ධිය:", menuText.includes("අඳුරු මංසන්ධිය"));

// Click "බහු ක්‍රීඩක"
const clicked = await page.evaluate(() => {
  const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === "බහු ක්‍රීඩක");
  if (b) { b.click(); return true; }
  return false;
});
console.log("clicked බහු ක්‍රීඩක:", clicked);
await new Promise((r) => setTimeout(r, 500));
await page.screenshot({ path: "scripts/shots/mp-2-panel.png" });

// Type a name, click create room
await page.type('input[placeholder="ක්‍රීඩකයා"]', "Tester");
const createClicked = await page.evaluate(() => {
  const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === "කාමරයක් සාදන්න");
  if (b) { b.click(); return true; }
  return false;
});
console.log("clicked කාමරයක් සාදන්න:", createClicked);

await page.waitForFunction(() => location.pathname.startsWith("/multiplayer/"), { timeout: 10000 }).catch(() => {});
await new Promise((r) => setTimeout(r, 1500));
console.log("URL after create:", await page.evaluate(() => location.href));
await page.screenshot({ path: "scripts/shots/mp-3-lobby.png" });

const lobbyText = await page.evaluate(() => document.body.innerText);
console.log("=== LOBBY TEXT ===");
console.log(lobbyText);

console.log("=== CONSOLE ISSUES (" + errors.length + ") ===");
for (const e of errors.slice(0, 30)) console.log(e);

await browser.close();
