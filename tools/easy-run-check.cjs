"use strict";

const fs = require("fs");
const path = require("path");
const { chromium } = require(
  process.env.PLAYWRIGHT_CORE ||
  "/Users/zoujiean/CodeX/_temp-screenshots/2026-11/tools/vidu-cdp/node_modules/playwright-core"
);

const BASE_URL = process.env.TANK_URL || "http://127.0.0.1:8811/tank/";
const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const SHOT_DIR = process.env.TANK_SHOT_DIR || "";

async function snapshot(page) {
  return page.evaluate(() => ({
    game: window.__tankTest.getSnapshot(),
    clearIds: window.__tankTest.clearShotEnemyIds()
  }));
}

async function run() {
  const browser = await chromium.launch({ headless: true, executablePath: CHROME });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  try {
    await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForFunction(() => window.__tankTest && window.__tankTest.state === "menu");
    await page.click("#btn-start");
    await page.waitForTimeout(200);
    await page.evaluate(() => window.__tankTest.setPlayerPosition(1480, 1730));

    let shots = 0;
    let repositioned = false;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const current = await snapshot(page);
      if (current.game.state !== "playing" || current.game.kills >= 10) break;
      if (!current.clearIds.length) {
        const moved = await page.evaluate(() => {
          for (let x = 300; x <= 2700; x += 60) {
            for (let y = 300; y <= 2300; y += 60) {
              if (!window.__tankTest.setPlayerPosition(x, y)) continue;
              if (window.__tankTest.clearShotEnemyIds().length) return true;
            }
          }
          return false;
        });
        repositioned = repositioned || moved;
        await page.waitForTimeout(150);
        continue;
      }
      const fired = await page.evaluate((ids) => {
        const game = window.__tankTest.getSnapshot();
        const enemy = game.enemies.find((item) => ids.includes(item.id));
        if (!enemy) return false;
        window.__tankTest.aimAt(enemy.x, enemy.y);
        return window.__tankTest.fire();
      }, current.clearIds);
      if (fired) shots += 1;
      await page.waitForTimeout(fired ? 1150 : 250);
    }

    await page.waitForTimeout(1000);
    const result = await snapshot(page);
    if (SHOT_DIR) {
      fs.mkdirSync(SHOT_DIR, { recursive: true });
      await page.screenshot({
        path: path.join(SHOT_DIR, "新手实弹通关-20261127.png"),
        fullPage: true
      });
    }
    const report = {
      state: result.game.state,
      kills: result.game.kills,
      enemyCount: result.game.enemyCount,
      playerHp: result.game.player ? result.game.player.hp : 0,
      shots,
      repositioned
    };
    console.log(JSON.stringify(report, null, 2));
    if (result.game.kills < 10 || result.game.state !== "result" || report.playerHp <= 0) {
      process.exitCode = 1;
    }
  } finally {
    await browser.close();
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
