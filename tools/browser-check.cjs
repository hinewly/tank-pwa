"use strict";

const fs = require("fs");
const { chromium } = require(
  process.env.PLAYWRIGHT_CORE ||
  "/Users/zoujiean/CodeX/_temp-screenshots/2026-11/tools/vidu-cdp/node_modules/playwright-core"
);

const BASE_URL = process.env.TANK_URL || "http://127.0.0.1:8810/";
const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

async function collectPageErrors(page) {
  const errors = [];
  page.on("pageerror", (error) => errors.push("pageerror: " + error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push("console: " + message.text());
  });
  return errors;
}

async function run() {
  const browser = await chromium.launch({ headless: true, executablePath: CHROME });
  const report = {};
  const shotDir = process.env.TANK_SHOT_DIR || "";
  if (shotDir) fs.mkdirSync(shotDir, { recursive: true });
  try {
    const desktop = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const desktopErrors = await collectPageErrors(desktop);
    await desktop.goto(BASE_URL, { waitUntil: "domcontentloaded" });
    await desktop.waitForTimeout(1800);
    report.desktopBoot = await desktop.evaluate(() => ({
      state: window.__tankTest && window.__tankTest.state,
      menuVisible: !document.getElementById("menu").classList.contains("hidden"),
      canvas: !!document.getElementById("game"),
      accountSlot: document.getElementById("db-account-slot").children.length,
      syncText: document.getElementById("sync-status").textContent
    }));
    if (shotDir) {
      await desktop.screenshot({
        path: require("path").join(shotDir, "PC端-主菜单-20261127.png"),
        fullPage: true
      });
    }
    await desktop.click("#btn-start");
    await desktop.waitForTimeout(700);
    const before = await desktop.evaluate(() => window.__tankTest.getSnapshot());
    await desktop.keyboard.down("w");
    await desktop.waitForTimeout(650);
    await desktop.keyboard.up("w");
    const box = await desktop.locator("#game").boundingBox();
    await desktop.mouse.move(box.x + box.width * 0.82, box.y + box.height * 0.48);
    await desktop.mouse.down();
    await desktop.waitForTimeout(120);
    await desktop.mouse.up();
    await desktop.waitForTimeout(350);
    const after = await desktop.evaluate(() => window.__tankTest.getSnapshot());
    report.desktopPlay = {
      state: after.state,
      moved: Math.hypot(after.player.x - before.player.x, after.player.y - before.player.y),
      ammoBefore: before.player.ammo,
      ammoAfter: after.player.ammo,
      bullets: after.bullets
    };
    report.combat = await desktop.evaluate(() => {
      const tank = { angle: Math.PI };
      const front = window.__tankTest.armorProfile(tank, 0);
      const rear = window.__tankTest.armorProfile(tank, Math.PI);
      window.__tankTest.destroyFirstObstacle();
      const obstacleAfter = window.__tankTest.getSnapshot().obstacles.find((item) => item.type === "wood");
      return {
        front: front.multiplier,
        rear: rear.multiplier,
        coverDestroyed: obstacleAfter.destroyed
      };
    });
    if (shotDir) {
      await desktop.screenshot({
        path: require("path").join(shotDir, "PC端-战斗界面-20261127.png"),
        fullPage: true
      });
    }
    await desktop.keyboard.press("Escape");
    await desktop.waitForTimeout(100);
    report.desktopPause = await desktop.evaluate(() => ({
      state: window.__tankTest.state,
      pauseVisible: !document.getElementById("pause-modal").classList.contains("hidden")
    }));
    await desktop.click("#btn-resume");
    await desktop.waitForTimeout(100);
    report.desktopResume = await desktop.evaluate(() => window.__tankTest.state);
    await desktop.evaluate(() => window.__tankTest.eliminateAllEnemies());
    await desktop.waitForTimeout(850);
    report.desktopVictory = await desktop.evaluate(() => ({
      state: window.__tankTest.state,
      title: document.getElementById("result-title").textContent,
      resultVisible: !document.getElementById("result-modal").classList.contains("hidden"),
      localWins: window.TankSync.loadLocal().stats.wins
    }));
    report.desktopErrors = desktopErrors;

    const portrait = await browser.newPage({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 2
    });
    const portraitErrors = await collectPageErrors(portrait);
    await portrait.goto(BASE_URL, { waitUntil: "domcontentloaded" });
    await portrait.waitForTimeout(1300);
    report.portraitBoot = await portrait.evaluate(() => ({
      hintDisplay: getComputedStyle(document.getElementById("rotate-hint")).display,
      startVisible: !!document.getElementById("btn-start").offsetParent,
      bodyOverflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth
    }));
    if (shotDir) {
      await portrait.screenshot({
        path: require("path").join(shotDir, "手机竖屏-主菜单-20261127.png"),
        fullPage: true
      });
    }
    report.portraitErrors = portraitErrors;

    const mobile = await browser.newPage({
      viewport: { width: 844, height: 390 },
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 2
    });
    const mobileErrors = await collectPageErrors(mobile);
    await mobile.goto(BASE_URL, { waitUntil: "domcontentloaded" });
    await mobile.waitForTimeout(1600);
    report.mobileBoot = await mobile.evaluate(() => ({
      width: document.documentElement.clientWidth,
      hintDisplay: getComputedStyle(document.getElementById("rotate-hint")).display,
      stageHeight: document.getElementById("game").getBoundingClientRect().height,
      menuVisible: !document.getElementById("menu").classList.contains("hidden"),
      bodyOverflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth
    }));
    await mobile.click("#btn-start");
    await mobile.waitForTimeout(500);
    const mobileBox = await mobile.locator("#game").boundingBox();
    const beforeMobile = await mobile.evaluate(() => window.__tankTest.getSnapshot());
    await mobile.evaluate(({ width, height }) => {
      const canvas = document.getElementById("game");
      const rect = canvas.getBoundingClientRect();
      const point = (x, y) => ({
        clientX: rect.left + rect.width * x,
        clientY: rect.top + rect.height * y,
        pointerId: 41,
        pointerType: "touch",
        bubbles: true,
        cancelable: true
      });
      canvas.dispatchEvent(new PointerEvent("pointerdown", point(0.1, height > width ? 0.55 : 0.72)));
      canvas.dispatchEvent(new PointerEvent("pointermove", point(0.18, height > width ? 0.45 : 0.48)));
    }, { width: mobileBox.width, height: mobileBox.height });
    await mobile.waitForTimeout(650);
    await mobile.evaluate(() => {
      const canvas = document.getElementById("game");
      const rect = canvas.getBoundingClientRect();
      canvas.dispatchEvent(new PointerEvent("pointerup", {
        clientX: rect.left + rect.width * 0.18,
        clientY: rect.top + rect.height * 0.48,
        pointerId: 41,
        pointerType: "touch",
        bubbles: true
      }));
    });
    const afterMove = await mobile.evaluate(() => window.__tankTest.getSnapshot());
    await mobile.evaluate(({ width, height }) => {
      const canvas = document.getElementById("game");
      const rect = canvas.getBoundingClientRect();
      const startX = rect.left + rect.width * 0.78;
      const startY = rect.top + rect.height * (height > width ? 0.55 : 0.72);
      const fire = new PointerEvent("pointerdown", {
        clientX: startX,
        clientY: startY,
        pointerId: 42,
        pointerType: "touch",
        bubbles: true,
        cancelable: true
      });
      canvas.dispatchEvent(fire);
      canvas.dispatchEvent(new PointerEvent("pointermove", {
        clientX: startX - 58,
        clientY: startY - 8,
        pointerId: 42,
        pointerType: "touch",
        bubbles: true,
        cancelable: true
      }));
    }, { width: mobileBox.width, height: mobileBox.height });
    await mobile.waitForTimeout(320);
    await mobile.evaluate(() => {
      const canvas = document.getElementById("game");
      const rect = canvas.getBoundingClientRect();
      canvas.dispatchEvent(new PointerEvent("pointerup", {
        clientX: rect.left + rect.width * 0.7,
        clientY: rect.top + rect.height * 0.7,
        pointerId: 42,
        pointerType: "touch",
        bubbles: true
      }));
    });
    const afterTouchFire = await mobile.evaluate(() => window.__tankTest.getSnapshot());
    const beforeDual = afterTouchFire;
    await mobile.evaluate(({ width, height }) => {
      const canvas = document.getElementById("game");
      const rect = canvas.getBoundingClientRect();
      const leftX = rect.left + rect.width * 0.12;
      const leftY = rect.top + rect.height * (height > width ? 0.58 : 0.72);
      const rightX = rect.left + rect.width * 0.78;
      const rightY = leftY;
      canvas.dispatchEvent(new PointerEvent("pointerdown", {
        clientX: leftX, clientY: leftY, pointerId: 43, pointerType: "touch", bubbles: true, cancelable: true
      }));
      canvas.dispatchEvent(new PointerEvent("pointerdown", {
        clientX: rightX, clientY: rightY, pointerId: 44, pointerType: "touch", bubbles: true, cancelable: true
      }));
      canvas.dispatchEvent(new PointerEvent("pointermove", {
        clientX: leftX + 54, clientY: leftY - 50, pointerId: 43, pointerType: "touch", bubbles: true, cancelable: true
      }));
      canvas.dispatchEvent(new PointerEvent("pointermove", {
        clientX: rightX - 62, clientY: rightY - 10, pointerId: 44, pointerType: "touch", bubbles: true, cancelable: true
      }));
    }, { width: mobileBox.width, height: mobileBox.height });
    await mobile.waitForTimeout(380);
    const afterDual = await mobile.evaluate(() => window.__tankTest.getSnapshot());
    await mobile.evaluate(() => {
      const canvas = document.getElementById("game");
      const rect = canvas.getBoundingClientRect();
      for (const pointerId of [43, 44]) {
        canvas.dispatchEvent(new PointerEvent("pointerup", {
          clientX: rect.left + rect.width * 0.4,
          clientY: rect.top + rect.height * 0.6,
          pointerId,
          pointerType: "touch",
          bubbles: true
        }));
      }
    });
    report.mobilePlay = await mobile.evaluate(() => ({
      state: window.__tankTest.state,
      player: window.__tankTest.getSnapshot().player,
      enemyCount: window.__tankTest.getSnapshot().enemies.length
    }));
    report.mobileTouch = {
      moved: Math.hypot(afterMove.player.x - beforeMobile.player.x, afterMove.player.y - beforeMobile.player.y),
      ammoBefore: afterMove.player.ammo,
      ammoAfter: afterTouchFire.player.ammo,
      turretChanged: Math.abs(afterTouchFire.player.turretAngle - afterMove.player.turretAngle)
    };
    report.mobileDualTouch = {
      moved: Math.hypot(afterDual.player.x - beforeDual.player.x, afterDual.player.y - beforeDual.player.y),
      ammoDelta: beforeDual.player.ammo - afterDual.player.ammo,
      turretChanged: Math.abs(afterDual.player.turretAngle - beforeDual.player.turretAngle)
    };
    if (shotDir) {
      await mobile.evaluate(() => window.__tankTest.startBattle());
      await mobile.waitForTimeout(450);
      await mobile.screenshot({
        path: require("path").join(shotDir, "手机横屏-战斗界面-20261127.png"),
        fullPage: true
      });
    }
    report.mobileErrors = mobileErrors;
  } finally {
    await browser.close();
  }
  console.log(JSON.stringify(report, null, 2));
  const errors = [
    ...(report.desktopErrors || []),
      ...(report.portraitErrors || []),
    ...(report.mobileErrors || [])
  ].filter((entry) => !entry.includes("Failed to load resource") && !entry.includes("ERR_NAME_NOT_RESOLVED"));
  if (errors.length) process.exitCode = 1;
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

