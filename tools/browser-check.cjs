"use strict";

const fs = require("fs");
const path = require("path");
const { chromium } = require(
  process.env.PLAYWRIGHT_CORE ||
  "/Users/zoujiean/CodeX/_temp-screenshots/2026-11/tools/vidu-cdp/node_modules/playwright-core"
);

const BASE_URL = process.env.TANK_URL || "http://127.0.0.1:8810/";
const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORTAL_SCRIPT = fs.readFileSync(
  path.resolve(__dirname, "../../daobox-home/public/portal.js"),
  "utf8"
);

function corsHeaders(request) {
  return {
    "Access-Control-Allow-Origin": request.headers().origin || "*",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Vary": "Origin"
  };
}

async function attachPortalMock(page) {
  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.hostname !== "daobox.app") {
      await route.continue();
      return;
    }
    const cors = corsHeaders(request);
    if (request.method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: cors });
      return;
    }
    if (url.pathname === "/portal.js") {
      await route.fulfill({
        status: 200,
        headers: { ...cors, "Content-Type": "application/javascript; charset=utf-8" },
        body: PORTAL_SCRIPT
      });
      return;
    }
    let body = { ok: true };
    if (url.pathname === "/api/me") body = { ok: true, user: { id: 81, nickname: "测试坦克", avatar: null } };
    else if (url.pathname === "/api/child/me") body = { ok: false };
    else if (url.pathname === "/api/time") body = { ok: true, used: 1, limit: 10, remaining: 9, unlimited: false, exceeded: false, kind: "user" };
    else if (url.pathname === "/api/time/heartbeat") body = { ok: true, used: 1, limit: 10, remaining: 9, unlimited: false, exceeded: false, kind: "user" };
    else if (url.pathname === "/api/reward/status") body = { ok: true, balance: 25, checkedApps: [], streak: 2 };
    else if (url.pathname === "/api/backup" && request.method() === "GET") body = { ok: true, app: "tank", data: null };
    await route.fulfill({
      status: 200,
      headers: { ...cors, "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify(body)
    });
  });
}

function collectPageErrors(page) {
  const errors = [];
  page.on("pageerror", (error) => errors.push("pageerror: " + error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push("console: " + message.text());
  });
  return errors;
}

async function startAtEnemy(page, index = 0) {
  return page.evaluate((enemyIndex) => {
    const snapshot = window.__tankTest.getSnapshot();
    const enemy = snapshot.enemies[enemyIndex];
    window.__tankTest.aimAt(enemy.x, enemy.y);
    return {
      id: enemy.id,
      x: enemy.x,
      y: enemy.y,
      player: window.__tankTest.getSnapshot().player
    };
  }, index);
}

async function run() {
  const browser = await chromium.launch({ headless: true, executablePath: CHROME });
  const report = {};
  const shotDir = process.env.TANK_SHOT_DIR || "";
  if (shotDir) fs.mkdirSync(shotDir, { recursive: true });
  try {
    const desktop = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await attachPortalMock(desktop);
    const desktopErrors = collectPageErrors(desktop);
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
        path: path.join(shotDir, "PC端-主菜单-20261127.png"),
        fullPage: true
      });
    }
    await desktop.click("#btn-gallery");
    await desktop.waitForTimeout(900);
    report.gallery = await desktop.evaluate(() => {
      const cards = [...document.querySelectorAll(".tank-card")];
      return {
        cards: cards.length,
        loaded: cards.filter((card) => {
          const image = card.querySelector("img");
          return image && image.complete && image.naturalWidth > 0;
        }).length,
        backdrops: document.querySelectorAll("[data-backdrop]").length
      };
    });
    if (shotDir) {
      await desktop.screenshot({
        path: path.join(shotDir, "PC端-车型图鉴-20261127.png"),
        fullPage: true
      });
    }
    report.backdrops = {};
    for (const backdropId of ["plain", "desert", "forest", "europe"]) {
      await desktop.click('[data-backdrop="' + backdropId + '"]');
      await desktop.waitForTimeout(260);
      report.backdrops[backdropId] = await desktop.evaluate(() => {
        const snapshot = window.__tankTest.getSnapshot();
        return { selected: snapshot.backdrop, ready: snapshot.backdropReady };
      });
    }
    await desktop.click("#btn-gallery-close");
    await desktop.waitForTimeout(100);

    report.levels = await desktop.evaluate(() => {
      const result = [];
      for (let index = 0; index < 3; index += 1) {
        window.__tankTest.selectLevel(index);
        const snapshot = window.__tankTest.getSnapshot();
        result.push({
          index,
          label: snapshot.level.label,
          title: snapshot.level.title,
          enemyTotal: snapshot.level.enemyTotal,
          obstacleTotal: snapshot.level.obstacleTotal
        });
      }
      window.__tankTest.selectLevel(0);
      return result;
    });

    await desktop.click('[data-level="0"]');
    await desktop.click("#btn-start");
    await desktop.waitForTimeout(500);
    const levelOneStart = await desktop.evaluate(() => {
      const snapshot = window.__tankTest.getSnapshot();
      const enemy = snapshot.enemies[0];
      window.__tankTest.aimAt(enemy.x, enemy.y);
      return snapshot;
    });
    const burningFirst = await desktop.evaluate(() => window.__tankTest.damageEnemyForTest("enemy-1", 30));
    await desktop.waitForTimeout(350);
    if (shotDir) {
      await desktop.screenshot({
        path: path.join(shotDir, "PC端-虎式受损起火-20261128.png"),
        fullPage: true
      });
    }
    const burningSecond = await desktop.evaluate(() => window.__tankTest.damageEnemyForTest("enemy-1", 999));
    await desktop.waitForTimeout(250);
    if (shotDir) {
      await desktop.screenshot({
        path: path.join(shotDir, "PC端-虎式烧毁残骸-20261128.png"),
        fullPage: true
      });
    }
    await desktop.evaluate(() => window.__tankTest.pauseGame(false));
    await desktop.waitForTimeout(120);
    const pauseRestartVisible = await desktop.evaluate(() =>
      !!document.getElementById("btn-restart-level") &&
      !document.getElementById("btn-restart-level").classList.contains("hidden")
    );
    await desktop.click("#btn-restart-level");
    await desktop.waitForTimeout(450);
    const restartedLevel = await desktop.evaluate(() => window.__tankTest.getSnapshot());
    report.levelFlow = {
      levelOneEnemies: levelOneStart.enemyCount,
      levelOneObstacles: levelOneStart.level.obstacleTotal,
      burningFirst,
      burningSecond,
      pauseRestartVisible,
      restartedLevel: restartedLevel.level,
      restartedEnemies: restartedLevel.enemyCount,
      restartedKills: restartedLevel.kills
    };

    await desktop.evaluate(() => window.__tankTest.eliminateAllEnemies());
    await desktop.waitForTimeout(850);
    report.levelNext = await desktop.evaluate(() => ({
      state: window.__tankTest.state,
      nextVisible: !document.getElementById("btn-next-level").classList.contains("hidden"),
      nextText: document.getElementById("btn-next-level").textContent,
      title: document.getElementById("result-title").textContent
    }));
    await desktop.click("#btn-next-level");
    await desktop.waitForTimeout(350);
    report.levelNext.started = await desktop.evaluate(() => window.__tankTest.getSnapshot().level);

    await desktop.evaluate(() => window.__tankTest.startBattle(2));
    await desktop.waitForTimeout(500);
    report.bulletPath = await desktop.evaluate(() => {
      const snapshot = window.__tankTest.getSnapshot();
      window.__tankTest.setViewYaw(0);
      window.__tankTest.setViewPitch(0);
      const ys = [220, 620, 1120].map((distance) =>
        window.__tankTest.projectEyePoint(snapshot.player.x + distance, snapshot.player.y)?.y
      );
      window.__tankTest.setViewPitch(0.08);
      const highPoints = [220, 620, 1120].map((distance) =>
        window.__tankTest.projectAimRayPoint(distance)
      );
      window.__tankTest.setViewPitch(-0.06);
      const lowPoints = [220, 620, 1120].map((distance) =>
        window.__tankTest.projectAimRayPoint(distance)
      );
      const result = {
        ys,
        maxDelta: Math.max(...ys) - Math.min(...ys),
        highPitch: 0.08,
        highYs: highPoints.map((point) => point && point.y),
        highZs: highPoints.map((point) => point && point.z),
        lowPitch: -0.06,
        lowYs: lowPoints.map((point) => point && point.y),
        lowZs: lowPoints.map((point) => point && point.z)
      };
      window.__tankTest.setViewPitch(0);
      return result;
    });
    report.highShot = await desktop.evaluate(() => {
      const target = window.__tankTest.getSnapshot().enemies[0];
      window.__tankTest.setPlayerHp(9999);
      window.__tankTest.aimAt(target.x, target.y);
      window.__tankTest.setViewPitch(0.12);
      const fired = window.__tankTest.fire();
      return { id: target.id, fired, hpBefore: target.hp };
    });
    await desktop.waitForTimeout(1350);
    report.highShot.hpAfter = await desktop.evaluate((id) =>
      window.__tankTest.getSnapshot().enemies.find((enemy) => enemy.id === id)?.hp,
      report.highShot.id
    );
    const canvasBox = await desktop.locator("#game").boundingBox();
    const cockpitBase = await desktop.evaluate(() => window.__tankTest.cockpitInfo());
    report.cockpit = { base: cockpitBase };
    report.nearMissAudio = await desktop.evaluate(() => window.__tankTest.playNearMissSound());
    if (shotDir) {
      await desktop.screenshot({
        path: path.join(shotDir, "PC端-第一人称战斗-20261127.png"),
        fullPage: true
      });
    }
    await desktop.evaluate(() => window.__tankTest.fire());
    await desktop.waitForTimeout(35);
    const cockpitFlash = await desktop.evaluate(() => ({
      snapshot: window.__tankTest.getSnapshot(),
      cockpit: window.__tankTest.cockpitInfo()
    }));
    if (shotDir) {
      await desktop.screenshot({
        path: path.join(shotDir, "PC端-第一人称炮口焰-20261127.png"),
        fullPage: true
      });
    }
    report.cockpit.flash = {
      active: cockpitFlash.snapshot.cockpitMuzzleFlash > 0,
      muzzleX: cockpitFlash.cockpit.muzzleX,
      muzzleY: cockpitFlash.cockpit.muzzleY
    };
    await desktop.evaluate(() => window.__tankTest.startBattle());
    await desktop.waitForTimeout(100);
    const initial = await desktop.evaluate(() => window.__tankTest.getSnapshot());
    report.range = {
      range: initial.enemyRange,
      playerRange: initial.playerRange,
      playerReload: initial.playerReload,
      enemyReload: initial.enemyReload,
      distanceMin: initial.enemyDistanceMin,
      distanceMax: initial.enemyDistanceMax,
      allInRange: initial.enemies.every((enemy) =>
        Math.hypot(enemy.x - initial.player.x, enemy.y - initial.player.y) <= initial.playerRange
      )
    };
    report.battlefield = {
      enemyDistanceMin: initial.enemyDistanceMin,
      enemyDistanceMax: initial.enemyDistanceMax,
      difficulty: initial.difficulty
    };
    report.minimap = await desktop.evaluate(() => window.__tankTest.minimapInfo());
    report.tankViews = await desktop.evaluate(() => {
      const enemy = window.__tankTest.getSnapshot().enemies[0];
      const at = (angle, distance) => ({
        x: enemy.x + Math.cos(angle) * distance,
        y: enemy.y + Math.sin(angle) * distance
      });
      const front = at(enemy.angle, 500);
      const rear = at(enemy.angle + Math.PI, 500);
      const sideA = at(enemy.angle + Math.PI / 2, 500);
      const sideB = at(enemy.angle - Math.PI / 2, 500);
      return {
        front: window.__tankTest.enemySpriteViewAt(enemy.id, front.x, front.y),
        rear: window.__tankTest.enemySpriteViewAt(enemy.id, rear.x, rear.y),
        sideA: window.__tankTest.enemySpriteViewAt(enemy.id, sideA.x, sideA.y),
        sideB: window.__tankTest.enemySpriteViewAt(enemy.id, sideB.x, sideB.y),
        spriteReady: window.__tankTest.enemySpriteReady(enemy.id)
      };
    });
    const outOfRangeStart = await desktop.evaluate(() => {
      const snapshot = window.__tankTest.getSnapshot();
      const target = snapshot.enemies[0];
      let best = null;
      for (let x = 100; x <= 2900; x += 100) {
        for (let y = 100; y <= 2500; y += 100) {
          if (!window.__tankTest.setPlayerPosition(x, y)) continue;
          const distance = Math.hypot(target.x - x, target.y - y);
          if (!best || distance > best.distance) best = { x, y, distance };
        }
      }
      if (!best) return null;
      window.__tankTest.setPlayerHp(9999);
      window.__tankTest.setPlayerPosition(best.x, best.y);
      return {
        id: target.id,
        shotsFired: target.shotsFired,
        ...best
      };
    });
    await desktop.waitForTimeout(1800);
    const outOfRangeEnd = await desktop.evaluate((target) => {
      const snapshot = window.__tankTest.getSnapshot();
      return {
        shotsFired: snapshot.enemies.find((enemy) => enemy.id === target.id).shotsFired,
        inRange: window.__tankTest.enemyInRange(target.id)
      };
    }, outOfRangeStart);
    report.outOfRange = {
      ...outOfRangeStart,
      shotsAfterWait: outOfRangeEnd.shotsFired,
      stayedOutOfRange: !outOfRangeEnd.inRange,
      didNotFire: outOfRangeEnd.shotsFired === outOfRangeStart.shotsFired
    };
    await desktop.evaluate(() => {
      window.__tankTest.startBattle();
      window.__tankTest.setPlayerHp(9999);
    });
    await desktop.waitForTimeout(120);
    const singleShotStart = await desktop.evaluate(() => window.__tankTest.getSnapshot());
    await desktop.evaluate(() => {
      const canvas = document.getElementById("game");
      canvas.dispatchEvent(new PointerEvent("pointerdown", {
        pointerId: 70,
        pointerType: "mouse",
        button: 0,
        bubbles: true,
        cancelable: true
      }));
    });
    await desktop.waitForTimeout(1600);
    await desktop.evaluate(() => {
      const canvas = document.getElementById("game");
      canvas.dispatchEvent(new PointerEvent("pointerup", {
        pointerId: 70,
        pointerType: "mouse",
        button: 0,
        bubbles: true,
        cancelable: true
      }));
    });
    const singleShotEnd = await desktop.evaluate(() => window.__tankTest.getSnapshot());
    report.singleShot = {
      shotsAdded: singleShotEnd.player.shotsFired - singleShotStart.player.shotsFired,
      ammo: singleShotEnd.player.ammo,
      reloadAfterHold: singleShotEnd.player.reload
    };
    await desktop.evaluate(() => window.__tankTest.startBattle());
    await desktop.waitForTimeout(120);
    await desktop.mouse.move(canvasBox.x + canvasBox.width / 2, canvasBox.y + canvasBox.height / 2);
    const aimStart = await desktop.evaluate(() => window.__tankTest.getSnapshot());
    await desktop.mouse.down({ button: "right" });
    await desktop.waitForTimeout(220);
    const aimOpen = await desktop.evaluate(() => window.__tankTest.getSnapshot());
    const cockpitAim = await desktop.evaluate(() => window.__tankTest.cockpitInfo());
    report.cockpit.aim = cockpitAim;
    await desktop.mouse.up({ button: "right" });
    await desktop.waitForTimeout(160);
    const aimClosed = await desktop.evaluate(() => window.__tankTest.getSnapshot());
    report.pcAim = {
      open: aimOpen.player.aiming,
      openZoom: aimOpen.player.zoom,
      closed: aimClosed.player.aiming,
      closedZoom: aimClosed.player.zoom,
      hullPreserved: Math.abs(aimOpen.player.angle - aimStart.player.angle) < 1e-9 &&
        Math.abs(aimClosed.player.angle - aimStart.player.angle) < 1e-9,
      turretPreserved: Math.abs(aimOpen.player.turretAngle - aimStart.player.turretAngle) < 1e-9 &&
        Math.abs(aimClosed.player.turretAngle - aimStart.player.turretAngle) < 1e-9,
      ammoPreserved: aimOpen.player.ammo === aimStart.player.ammo,
      compassCount: aimOpen.threatCompassCount,
      contextMenuBlocked: await desktop.evaluate(() => {
        const canvas = document.getElementById("game");
        return !canvas.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
      })
    };
    await desktop.evaluate(() => window.__tankTest.setViewYaw(-Math.PI / 2));
    await desktop.mouse.down({ button: "right" });
    await desktop.waitForTimeout(140);
    if (shotDir) {
      await desktop.screenshot({
        path: path.join(shotDir, "PC端-第一人称开镜-20261127.png"),
        fullPage: true
      });
    }
    await desktop.mouse.up({ button: "right" });
    const beforeMove = initial.player;
    const idleAudio = await desktop.evaluate(() => window.__tankTest.getSnapshot().audio);
    await desktop.keyboard.down("w");
    await desktop.waitForTimeout(600);
    const desktopMoving = await desktop.evaluate(() => ({
      snapshot: window.__tankTest.getSnapshot(),
      hud: window.__tankTest.movementHud()
    }));
    if (shotDir) {
      await desktop.screenshot({
        path: path.join(shotDir, "PC端-移动反馈-20261127.png"),
        fullPage: true
      });
    }
    await desktop.keyboard.up("w");
    report.engineAudio = {
      idle: idleAudio,
      moving: desktopMoving.snapshot.audio
    };
    await desktop.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true })));
    await desktop.waitForTimeout(320);
    await desktop.evaluate(() => window.dispatchEvent(new KeyboardEvent("keyup", { key: "a", bubbles: true })));
    const yawBeforeMouse = await desktop.evaluate(() => window.__tankTest.getSnapshot().player.turretAngle);
    await desktop.mouse.move(canvasBox.x + canvasBox.width * 0.46, canvasBox.y + canvasBox.height * 0.48);
    await desktop.mouse.down();
    await desktop.mouse.move(canvasBox.x + canvasBox.width * 0.59, canvasBox.y + canvasBox.height * 0.5);
    await desktop.mouse.up();
    await desktop.waitForTimeout(300);
    const afterPlay = await desktop.evaluate(() => window.__tankTest.getSnapshot());
    report.desktopPlay = {
      state: afterPlay.state,
      enemyCount: initial.enemyCount,
      moved: Math.hypot(afterPlay.player.x - beforeMove.x, afterPlay.player.y - beforeMove.y),
      hullChanged: Math.abs(afterPlay.player.angle - beforeMove.angle),
      mouseAimChanged: Math.abs(afterPlay.player.turretAngle - yawBeforeMouse),
      ammoBefore: initial.player.ammo,
      ammoAfter: afterPlay.player.ammo,
      movingSpeed: desktopMoving.snapshot.player.speed,
      movingHud: desktopMoving.hud,
      audio: afterPlay.audio,
      pointerLock: await desktop.evaluate(() => document.pointerLockElement === document.getElementById("game"))
    };

    await desktop.evaluate(() => window.__tankTest.startBattle());
    await desktop.waitForTimeout(100);
    const strafeStart = await desktop.evaluate(() => window.__tankTest.getSnapshot());
    await desktop.keyboard.down("e");
    await desktop.waitForTimeout(620);
    const strafeMid = await desktop.evaluate(() => ({
      snapshot: window.__tankTest.getSnapshot(),
      hud: window.__tankTest.movementHud()
    }));
    await desktop.keyboard.up("e");
    report.desktopStrafe = {
      moved: Math.hypot(
        strafeMid.snapshot.player.x - strafeStart.player.x,
        strafeMid.snapshot.player.y - strafeStart.player.y
      ),
      strafeSpeed: strafeMid.snapshot.player.strafeSpeed,
      hud: strafeMid.hud
    };

    await desktop.evaluate(() => window.__tankTest.startBattle());
    await desktop.waitForTimeout(100);
    const reverseStart = await desktop.evaluate(() => window.__tankTest.getSnapshot().player);
    await desktop.keyboard.down("s");
    await desktop.waitForTimeout(620);
    await desktop.keyboard.up("s");
    const reverseEnd = await desktop.evaluate(() => window.__tankTest.getSnapshot().player);
    report.reverseControl = {
      moved: Math.hypot(reverseEnd.x - reverseStart.x, reverseEnd.y - reverseStart.y),
      reverseDistance: (
        (reverseEnd.x - reverseStart.x) * Math.cos(reverseStart.angle) +
        (reverseEnd.y - reverseStart.y) * Math.sin(reverseStart.angle)
      ),
      speed: reverseEnd.speed
    };

    report.coverDurability = await desktop.evaluate(() => ({
      wood: window.__tankTest.damageObstacleOfType("wood"),
      sandbag: window.__tankTest.damageObstacleOfType("sandbag"),
      earth: window.__tankTest.damageObstacleOfType("earth")
    }));
    report.combat = await desktop.evaluate(() => {
      const tank = { angle: Math.PI };
      const front = window.__tankTest.armorProfile(tank, 0);
      const rear = window.__tankTest.armorProfile(tank, Math.PI);
      window.__tankTest.destroyFirstObstacle();
      const obstacles = window.__tankTest.getSnapshot().obstacles;
      const obstacleAfter = obstacles.find((item) => item.type === "wood");
      return {
        front: front.multiplier,
        rear: rear.multiplier,
        coverDestroyed: obstacleAfter.destroyed,
        coverTypes: [...new Set(obstacles.map((item) => item.type))]
      };
    });

    report.ringView = await desktop.evaluate(() => {
      const snapshot = window.__tankTest.getSnapshot();
      const seen = new Set();
      for (const enemy of snapshot.enemies) {
        const bearing = Math.atan2(enemy.y - snapshot.player.y, enemy.x - snapshot.player.x);
        window.__tankTest.setViewYaw(bearing);
        for (const id of window.__tankTest.visibleEnemyIds()) seen.add(id);
      }
      return {
        total: snapshot.enemies.length,
        seen: seen.size,
        ids: [...seen]
      };
    });

    await desktop.evaluate(() => window.__tankTest.startBattle());
    await desktop.waitForTimeout(120);
    const projectionTarget = await startAtEnemy(desktop, 2);
    const projectionBefore = await desktop.evaluate((id) => window.__tankTest.projectEnemy(id), projectionTarget.id);
    await desktop.evaluate(({ target, centerX, centerY }) => {
      const dx = centerX - target.x;
      const dy = centerY - target.y;
      const length = Math.max(1, Math.hypot(dx, dy));
      window.__tankTest.setPlayerHp(9999);
      window.__tankTest.setPlayerPosition(
        target.x + dx / length * 110,
        target.y + dy / length * 110
      );
      window.__tankTest.aimAt(target.x, target.y);
    }, {
      target: projectionTarget,
      centerX: initial.player.x,
      centerY: initial.player.y
    });
    const projectionAfter = await desktop.evaluate((id) => window.__tankTest.projectEnemy(id), projectionTarget.id);
    await desktop.mouse.down({ button: "right" });
    await desktop.waitForTimeout(120);
    const aimCombatStart = await desktop.evaluate(() => window.__tankTest.getSnapshot());
    await desktop.keyboard.down("s");
    await desktop.waitForTimeout(360);
    await desktop.keyboard.up("s");
    await desktop.evaluate((target) => window.__tankTest.aimAt(target.x, target.y), projectionTarget);
    await desktop.evaluate(() => window.__tankTest.fire());
    await desktop.waitForTimeout(650);
    const aimCombatEnd = await desktop.evaluate((target) => {
      const snapshot = window.__tankTest.getSnapshot();
      return {
        enemy: snapshot.enemies.find((enemy) => enemy.id === target.id),
        player: snapshot.player,
        shotFeedback: snapshot.shotFeedback
      };
    }, projectionTarget);
    await desktop.mouse.up({ button: "right" });
    report.projection = {
      beforeDepth: projectionBefore && projectionBefore.depth,
      afterDepth: projectionAfter && projectionAfter.depth,
      beforeScale: projectionBefore && projectionBefore.scale,
      afterScale: projectionAfter && projectionAfter.scale,
      afterScreenX: projectionAfter && projectionAfter.x,
      closerScaleGrew: !!(projectionBefore && projectionAfter && projectionAfter.scale > projectionBefore.scale),
      aimedShotHit: !!(aimCombatEnd.enemy && aimCombatEnd.enemy.hp < 92),
      targetHpAfterShot: aimCombatEnd.enemy && aimCombatEnd.enemy.hp,
      shotFeedback: aimCombatEnd.shotFeedback,
      aimingDuringShot: aimCombatStart.player.aiming && aimCombatEnd.player.aiming,
      movedWhileAiming: Math.hypot(
        aimCombatEnd.player.x - aimCombatStart.player.x,
        aimCombatEnd.player.y - aimCombatStart.player.y
      ) > 0.2
    };

    await desktop.evaluate(() => window.__tankTest.setViewYaw(-Math.PI / 2));
    await desktop.waitForTimeout(120);
    await desktop.evaluate(() => {
      if (document.exitPointerLock) document.exitPointerLock();
    });
    await desktop.click("#btn-pause");
    await desktop.waitForTimeout(120);
    report.desktopPause = await desktop.evaluate(() => ({
      state: window.__tankTest.state,
      pauseVisible: !document.getElementById("pause-modal").classList.contains("hidden")
    }));
    await desktop.click("#btn-resume");
    await desktop.waitForTimeout(120);
    report.desktopResume = await desktop.evaluate(() => window.__tankTest.state);

    await desktop.evaluate(() => {
      window.__tankTest.setPlayerHp(9999);
      window.__tankTest.setPlayerPosition(1500, 1300);
    });
    await desktop.waitForTimeout(180);
    const fixedBefore = await desktop.evaluate(() => window.__tankTest.getSnapshot());
    for (const position of [
      { x: 1500, y: 1200, yaw: -1.7 },
      { x: 1300, y: 1300, yaw: 2.2 },
      { x: 1700, y: 1300, yaw: 0.45 }
    ]) {
      await desktop.evaluate(({ x, y, yaw }) => {
        window.__tankTest.setPlayerPosition(x, y);
        window.__tankTest.setViewYaw(yaw);
        window.__tankTest.fire();
      }, position);
      await desktop.waitForTimeout(300);
    }
    await desktop.waitForTimeout(8000);
    const fixedAfter = await desktop.evaluate(() => window.__tankTest.getSnapshot());
    const fixedBeforeById = new Map(fixedBefore.enemies.map((enemy) => [enemy.id, enemy]));
    const survivors = fixedAfter.enemies.filter((enemy) => fixedBeforeById.has(enemy.id));
    const maxPositionDrift = survivors.reduce((max, enemy) => {
      const before = fixedBeforeById.get(enemy.id);
      return Math.max(max, Math.hypot(enemy.x - before.x, enemy.y - before.y));
    }, 0);
    const maxHullAngleDrift = survivors.reduce((max, enemy) => {
      const before = fixedBeforeById.get(enemy.id);
      return Math.max(max, Math.abs(enemy.angle - before.angle));
    }, 0);
    const maxTurretTurn = survivors.reduce((max, enemy) => {
      const before = fixedBeforeById.get(enemy.id);
      return Math.max(max, Math.abs(enemy.turretAngle - before.turretAngle));
    }, 0);
    const maxShotsAdded = survivors.reduce((max, enemy) => {
      const before = fixedBeforeById.get(enemy.id);
      return Math.max(max, enemy.shotsFired - before.shotsFired);
    }, 0);
    const firingEnemies = survivors.filter((enemy) =>
      enemy.shotsFired > fixedBeforeById.get(enemy.id).shotsFired
    ).length;
    const enemyShots = survivors.reduce((sum, enemy) => sum + enemy.shotsFired, 0);
    const sameEnemySet = (
      fixedAfter.enemies.length === fixedBefore.enemies.length &&
      fixedAfter.enemies.every((enemy) => fixedBeforeById.has(enemy.id))
    );
    report.fixedTurret = {
      initialEnemyCount: fixedBefore.enemies.length,
      survivors: survivors.length,
      sameEnemySet,
      maxPositionDrift,
      maxHullAngleDrift,
      maxTurretTurn,
      maxShotsAdded,
      firingEnemies,
      enemyShots,
      allFixedFlags: survivors.every((enemy) => enemy.fixed),
      audioEvents: fixedAfter.audio.events
    };

    await desktop.evaluate(() => {
      window.__tankTest.startBattle();
      window.__tankTest.setPlayerPosition(1480, 1730);
    });
    await desktop.waitForTimeout(150);
    const easyStart = await desktop.evaluate(() => window.__tankTest.getSnapshot());
    let easyShots = 0;
    for (let attempt = 0; attempt < 9; attempt += 1) {
      const target = await desktop.evaluate(() => {
        const snapshot = window.__tankTest.getSnapshot();
        if (snapshot.state !== "playing") return null;
        const clearIds = window.__tankTest.clearShotEnemyIds();
        const enemy = snapshot.enemies.find((item) => clearIds.includes(item.id));
        if (!enemy) return null;
        window.__tankTest.aimAt(enemy.x, enemy.y);
        return { id: enemy.id, hp: enemy.hp };
      });
      if (!target) break;
      const fired = await desktop.evaluate(() => window.__tankTest.fire());
      if (fired) easyShots += 1;
      await desktop.waitForTimeout(1150);
      const snapshot = await desktop.evaluate(() => window.__tankTest.getSnapshot());
      if (snapshot.state !== "playing" || snapshot.kills >= 3) break;
    }
    const easyEnd = await desktop.evaluate(() => window.__tankTest.getSnapshot());
    report.easyCombat = {
      state: easyEnd.state,
      kills: easyEnd.kills,
      shots: easyShots,
      playerHp: easyEnd.player.hp,
      enemyCount: easyEnd.enemyCount,
      startX: easyStart.player.x,
      startY: easyStart.player.y
    };

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
    await attachPortalMock(portrait);
    const portraitErrors = collectPageErrors(portrait);
    await portrait.goto(BASE_URL, { waitUntil: "domcontentloaded" });
    await portrait.waitForTimeout(1300);
    report.portraitBoot = await portrait.evaluate(() => ({
      hintDisplay: getComputedStyle(document.getElementById("rotate-hint")).display,
      startVisible: !!document.getElementById("btn-start").offsetParent,
      bodyOverflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth
    }));
    if (shotDir) {
      await portrait.screenshot({
        path: path.join(shotDir, "手机竖屏-主菜单-20261127.png"),
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
    await attachPortalMock(mobile);
    const mobileErrors = collectPageErrors(mobile);
    await mobile.goto(BASE_URL, { waitUntil: "domcontentloaded" });
    await mobile.waitForTimeout(1500);
    await mobile.evaluate(() => window.__tankTest.selectLevel(2));
    await mobile.click("#btn-start");
    await mobile.waitForTimeout(450);
    const mobileCockpitBase = await mobile.evaluate(() => window.__tankTest.cockpitInfo());
    if (shotDir) {
      await mobile.screenshot({
        path: path.join(shotDir, "手机横屏-第一人称战斗-20261127.png"),
        fullPage: false
      });
    }
    const mobileBox = await mobile.locator("#game").boundingBox();
    const mobileAimInfo = await mobile.evaluate(() => {
      const aim = document.getElementById("mobile-aim");
      const fire = document.getElementById("mobile-fire");
      const ar = aim.getBoundingClientRect();
      const fr = fire.getBoundingClientRect();
      return {
        visible: ar.width > 0 && ar.height > 0 && getComputedStyle(aim).display !== "none",
        aim: { x: ar.x, y: ar.y, width: ar.width, height: ar.height },
        fire: { x: fr.x, y: fr.y, width: fr.width, height: fr.height },
        overlapped: !(ar.right <= fr.left || fr.right <= ar.left || ar.bottom <= fr.top || fr.bottom <= ar.top)
      };
    });
    const mobileAimStart = await mobile.evaluate(() => window.__tankTest.getSnapshot());
    await mobile.locator("#mobile-aim").dispatchEvent("pointerdown", {
      pointerId: 40,
      pointerType: "touch",
      bubbles: true,
      cancelable: true
    });
    await mobile.waitForTimeout(180);
    const mobileAimOpen = await mobile.evaluate(() => window.__tankTest.getSnapshot());
    const mobileCockpitAim = await mobile.evaluate(() => window.__tankTest.cockpitInfo());
    if (shotDir) {
      await mobile.screenshot({
        path: path.join(shotDir, "手机横屏-第一人称开镜-20261127.png"),
        fullPage: false
      });
    }
    await mobile.locator("#mobile-aim").dispatchEvent("pointerdown", {
      pointerId: 40,
      pointerType: "touch",
      bubbles: true,
      cancelable: true
    });
    await mobile.waitForTimeout(150);
    const mobileAimClosed = await mobile.evaluate(() => window.__tankTest.getSnapshot());
    const beforeTouch = await mobile.evaluate(() => window.__tankTest.getSnapshot());
    await mobile.evaluate(({ width, height }) => {
      const canvas = document.getElementById("game");
      const rect = canvas.getBoundingClientRect();
      const x = width > height ? rect.width * 0.12 : rect.width * 0.12;
      const y = height > width ? rect.height * 0.6 : rect.height * 0.72;
      window.__touchCenter = { x: rect.left + x, y: rect.top + y };
      canvas.dispatchEvent(new PointerEvent("pointerdown", {
        clientX: window.__touchCenter.x,
        clientY: window.__touchCenter.y,
        pointerId: 41,
        pointerType: "touch",
        bubbles: true,
        cancelable: true
      }));
      canvas.dispatchEvent(new PointerEvent("pointermove", {
        clientX: window.__touchCenter.x + 44,
        clientY: window.__touchCenter.y - 48,
        pointerId: 41,
        pointerType: "touch",
        bubbles: true,
        cancelable: true
      }));
    }, { width: mobileBox.width, height: mobileBox.height });
    await mobile.waitForTimeout(500);
    const mobileMoving = await mobile.evaluate(() => ({
      snapshot: window.__tankTest.getSnapshot(),
      hud: window.__tankTest.movementHud()
    }));
    if (shotDir) {
      await mobile.screenshot({
        path: path.join(shotDir, "手机横屏-移动反馈-20261127.png"),
        fullPage: false
      });
    }
    await mobile.evaluate(() => {
      const canvas = document.getElementById("game");
      canvas.dispatchEvent(new PointerEvent("pointerup", {
        clientX: window.__touchCenter.x + 44,
        clientY: window.__touchCenter.y - 48,
        pointerId: 41,
        pointerType: "touch",
        bubbles: true
      }));
    });
    const afterMove = await mobile.evaluate(() => window.__tankTest.getSnapshot());

    await mobile.evaluate(({ width, height }) => {
      const canvas = document.getElementById("game");
      const rect = canvas.getBoundingClientRect();
      const x = rect.left + rect.width * 0.72;
      const y = rect.top + (height > width ? rect.height * 0.6 : rect.height * 0.72);
      window.__lookCenter = { x, y };
      canvas.dispatchEvent(new PointerEvent("pointerdown", {
        clientX: x,
        clientY: y,
        pointerId: 42,
        pointerType: "touch",
        bubbles: true,
        cancelable: true
      }));
      canvas.dispatchEvent(new PointerEvent("pointermove", {
        clientX: x - 50,
        clientY: y - 8,
        pointerId: 42,
        pointerType: "touch",
        bubbles: true,
        cancelable: true
      }));
    }, { width: mobileBox.width, height: mobileBox.height });
    await mobile.waitForTimeout(500);
    const afterLook = await mobile.evaluate(() => window.__tankTest.getSnapshot());
    await mobile.evaluate(() => {
      const canvas = document.getElementById("game");
      canvas.dispatchEvent(new PointerEvent("pointerup", {
        clientX: window.__lookCenter.x - 50,
        clientY: window.__lookCenter.y - 8,
        pointerId: 42,
        pointerType: "touch",
        bubbles: true
      }));
    });
    await mobile.evaluate(() => {
      window.__tankTest.startBattle();
      window.__tankTest.setHullYaw(-Math.PI / 2);
    });
    await mobile.waitForTimeout(160);
    const beforeDual = await mobile.evaluate(() => window.__tankTest.getSnapshot());
    await mobile.evaluate(({ width, height }) => {
      const canvas = document.getElementById("game");
      const rect = canvas.getBoundingClientRect();
      const leftX = rect.left + rect.width * 0.12;
      const rightX = rect.left + rect.width * 0.7;
      const y = rect.top + (height > width ? rect.height * 0.58 : rect.height * 0.7);
      canvas.dispatchEvent(new PointerEvent("pointerdown", {
        clientX: leftX, clientY: y, pointerId: 51, pointerType: "touch", bubbles: true, cancelable: true
      }));
      canvas.dispatchEvent(new PointerEvent("pointerdown", {
        clientX: rightX, clientY: y, pointerId: 52, pointerType: "touch", bubbles: true, cancelable: true
      }));
      canvas.dispatchEvent(new PointerEvent("pointermove", {
        clientX: leftX + 48, clientY: y - 48, pointerId: 51, pointerType: "touch", bubbles: true, cancelable: true
      }));
      canvas.dispatchEvent(new PointerEvent("pointermove", {
        clientX: rightX - 52, clientY: y - 10, pointerId: 52, pointerType: "touch", bubbles: true, cancelable: true
      }));
    }, { width: mobileBox.width, height: mobileBox.height });
    await mobile.waitForTimeout(450);
    const afterDual = await mobile.evaluate(() => window.__tankTest.getSnapshot());
    await mobile.evaluate(() => {
      const canvas = document.getElementById("game");
      const rect = canvas.getBoundingClientRect();
      for (const pointerId of [51, 52]) {
        canvas.dispatchEvent(new PointerEvent("pointerup", {
          clientX: rect.left + rect.width * 0.4,
          clientY: rect.top + rect.height * 0.6,
          pointerId,
          pointerType: "touch",
          bubbles: true
        }));
      }
    });

    const fireButtonInfo = await mobile.evaluate(() => {
      const button = document.getElementById("mobile-fire");
      const rect = button.getBoundingClientRect();
      const style = getComputedStyle(button);
      return {
        visible: rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden",
        display: style.display,
        opacity: style.opacity,
        zIndex: style.zIndex,
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        topElement: document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)?.id || ""
      };
    });
    const mobileFireStart = await mobile.evaluate(() => window.__tankTest.getSnapshot());
    await mobile.locator("#mobile-fire").dispatchEvent("pointerdown", {
      pointerId: 43,
      pointerType: "touch",
      bubbles: true,
      cancelable: true
    });
    await mobile.waitForTimeout(1600);
    await mobile.locator("#mobile-fire").dispatchEvent("pointerup", {
      pointerId: 43,
      pointerType: "touch",
      bubbles: true,
      cancelable: true
    });
    const afterFire = await mobile.evaluate(() => window.__tankTest.getSnapshot());
    report.mobile = {
      before: {
        x: beforeTouch.player.x,
        y: beforeTouch.player.y,
        hull: beforeTouch.player.angle,
        turret: beforeTouch.player.turretAngle,
        ammo: beforeTouch.player.ammo
      },
      moved: Math.hypot(afterMove.player.x - beforeTouch.player.x, afterMove.player.y - beforeTouch.player.y),
      movingSpeed: mobileMoving.snapshot.player.speed,
      movingHud: mobileMoving.hud,
      hullChanged: Math.abs(afterMove.player.angle - beforeTouch.player.angle),
      lookChanged: Math.abs(afterLook.player.turretAngle - afterMove.player.turretAngle),
      dualMoved: Math.hypot(afterDual.player.x - beforeDual.player.x, afterDual.player.y - beforeDual.player.y),
      dualLookChanged: Math.abs(afterDual.player.turretAngle - beforeDual.player.turretAngle),
      fireButtonVisible: fireButtonInfo.visible,
      fireButtonInfo,
      shotsAddedAfterHold: afterFire.player.shotsFired - mobileFireStart.player.shotsFired,
      ammoAfterFire: afterFire.player.ammo,
      enemyCount: afterFire.enemyCount,
      aim: {
        visible: mobileAimInfo.visible,
        overlapped: mobileAimInfo.overlapped,
        openZoom: mobileAimOpen.player.zoom,
        closedZoom: mobileAimClosed.player.zoom,
        open: mobileAimOpen.player.aiming,
        closed: mobileAimClosed.player.aiming,
        hullPreserved: Math.abs(mobileAimClosed.player.angle - mobileAimStart.player.angle) < 1e-9,
        turretPreserved: Math.abs(mobileAimClosed.player.turretAngle - mobileAimStart.player.turretAngle) < 1e-9
      },
      cockpit: {
        base: mobileCockpitBase,
        aim: mobileCockpitAim
      },
      bodyOverflowX: await mobile.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    };
    report.mobileErrors = mobileErrors;
  } finally {
    await browser.close();
  }

  const errors = [
    ...(report.desktopErrors || []),
    ...(report.portraitErrors || []),
    ...(report.mobileErrors || [])
  ].filter((entry) => !entry.includes("Failed to load resource") && !entry.includes("ERR_NAME_NOT_RESOLVED"));
  const ring = report.ringView || {};
  const projection = report.projection || {};
  const fixed = report.fixedTurret || {};
  const mobile = report.mobile || {};
  const gallery = report.gallery || {};
  const backdrops = report.backdrops || {};
  const range = report.range || {};
  const tankViews = report.tankViews || {};
  const cockpit = report.cockpit || {};
  const battlefield = report.battlefield || {};
  const minimap = report.minimap || {};
  const singleShot = report.singleShot || {};
  const easyCombat = report.easyCombat || {};
  const desktopStrafe = report.desktopStrafe || {};
  const levels = report.levels || [];
  const levelFlow = report.levelFlow || {};
  const levelNext = report.levelNext || {};
  const coverDurability = report.coverDurability || {};
  const reverseControl = report.reverseControl || {};
  const cockpitBase = cockpit.base || {};
  const cockpitAim = cockpit.aim || {};
  const passed = (
    gallery.cards === 6 &&
    gallery.loaded === 6 &&
    gallery.backdrops === 4 &&
    Object.values(backdrops).length === 4 &&
    Object.values(backdrops).every((item) => item.ready && item.selected) &&
    levels.length === 3 &&
    levels[0].enemyTotal === 5 &&
    levels[0].obstacleTotal === 6 &&
    levels[1].enemyTotal === 8 &&
    levels[1].obstacleTotal === 19 &&
    levels[2].enemyTotal === 10 &&
    levels[2].obstacleTotal === 37 &&
    report.bulletPath.maxDelta < 0.01 &&
    report.bulletPath.highYs.every((value) => Math.abs(value - 360) < 0.01) &&
    report.bulletPath.lowYs.every((value) => Math.abs(value - 360) < 0.01) &&
    report.bulletPath.highZs[2] > 72 &&
    report.bulletPath.lowZs[2] < 0 &&
    report.highShot.fired &&
    report.highShot.hpAfter === report.highShot.hpBefore &&
    levelFlow.levelOneEnemies === 5 &&
    levelFlow.levelOneObstacles === 6 &&
    levelFlow.burningFirst?.alive &&
    levelFlow.burningFirst?.burning &&
    /起火/.test(levelFlow.burningFirst?.feedback || "") &&
    levelFlow.burningSecond?.alive === false &&
    levelFlow.burningSecond?.wrecks === 1 &&
    levelFlow.pauseRestartVisible &&
    levelFlow.restartedLevel?.index === 0 &&
    levelFlow.restartedEnemies === 5 &&
    levelFlow.restartedKills === 0 &&
    levelNext.state === "result" &&
    levelNext.nextVisible &&
    levelNext.started?.index === 1 &&
    levelNext.started?.enemyTotal === 8 &&
    range.range === 1500 &&
    range.playerRange === 1500 &&
    range.playerReload === 0.8 &&
    range.enemyReload === 5.2 &&
    range.allInRange &&
    report.outOfRange.distance > 1500 &&
    report.outOfRange.stayedOutOfRange &&
    report.outOfRange.didNotFire &&
    tankViews.front?.view === "front" &&
    tankViews.rear?.view === "rear" &&
    tankViews.sideA?.view === "side" &&
    tankViews.sideB?.view === "side" &&
    tankViews.sideA?.mirror !== tankViews.sideB?.mirror &&
    tankViews.spriteReady &&
    cockpitBase.ready &&
    cockpitBase.source === "assets/cockpit/cn-99a-gunner.webp" &&
    cockpitBase.width === 1364 &&
    cockpitBase.height === 768 &&
    cockpitBase.centerClear &&
    cockpitBase.reticleAlpha === 0 &&
    cockpitBase.muzzleY > 360 + 20 &&
    cockpitAim.ready &&
    cockpitAim.centerClear &&
    cockpitAim.reticleAlpha === 0 &&
    cockpitAim.muzzleY > 360 + 20 &&
    cockpitAim.aimScale === 1.035 &&
    cockpit.flash?.active &&
    cockpit.flash.muzzleY > 360 + 20 &&
    battlefield.enemyDistanceMin >= 1050 &&
    battlefield.enemyDistanceMax <= 1250 &&
    battlefield.difficulty?.label === "新手" &&
    battlefield.difficulty.playerHp === 180 &&
    battlefield.difficulty.playerDamage === 80 &&
    battlefield.difficulty.enemyDamage === 10 &&
    battlefield.difficulty.enemySpread === 0.16 &&
    minimap.visible &&
    minimap.enemyCount === 10 &&
    minimap.enemies.length === 10 &&
    minimap.enemies.every((enemy) => enemy.inside) &&
    singleShot.shotsAdded === 1 &&
    report.desktopPlay.enemyCount === 10 &&
    report.desktopPlay.ammoAfter < report.desktopPlay.ammoBefore &&
    report.desktopPlay.movingSpeed > 10 &&
    report.desktopPlay.movingHud.active &&
    /前进|倒车|车体转向/.test(report.desktopPlay.movingHud.text) &&
    report.desktopPlay.audio &&
    !report.desktopPlay.audio.muted &&
    report.desktopPlay.audio.state === "running" &&
    report.desktopPlay.audio.engineActive &&
    report.desktopPlay.audio.cannonSampleLoaded &&
    report.desktopPlay.audio.armorHitSampleLoaded &&
    report.desktopPlay.audio.explosionSampleLoaded &&
    report.desktopPlay.audio.events.sampleShots > 0 &&
    report.engineAudio.idle.engineSampleLoaded &&
    report.engineAudio.moving.engineSampleLoaded &&
    report.engineAudio.moving.engineMode === "sample" &&
    report.engineAudio.moving.engineGain > report.engineAudio.idle.engineGain + 0.01 &&
    report.nearMissAudio.state === "running" &&
    report.nearMissAudio.events.nearMisses > 0 &&
    desktopStrafe.moved > 8 &&
    desktopStrafe.strafeSpeed > 20 &&
    /右移/.test(desktopStrafe.hud.text) &&
    reverseControl.moved > 8 &&
    reverseControl.reverseDistance < -8 &&
    reverseControl.speed < 0 &&
    report.desktopPlay.mouseAimChanged > 0.01 &&
    Math.abs(report.desktopPlay.hullChanged) > 0.01 &&
    coverDurability.wood?.before === 160 &&
    coverDurability.wood?.after === 80 &&
    coverDurability.wood?.destroyed === false &&
    /挡住炮弹/.test(coverDurability.wood?.feedback || "") &&
    coverDurability.sandbag?.before === 240 &&
    coverDurability.sandbag?.after === 160 &&
    coverDurability.sandbag?.destroyed === false &&
    coverDurability.earth?.before === 360 &&
    coverDurability.earth?.after === 280 &&
    coverDurability.earth?.destroyed === false &&
    ["concrete", "sandbag", "wood", "earth"].every((type) => report.combat.coverTypes.includes(type)) &&
    ring.total === 10 &&
    ring.seen === 10 &&
    projection.closerScaleGrew &&
    projection.aimedShotHit &&
    /命中/.test(projection.shotFeedback?.text || "") &&
    projection.aimingDuringShot &&
    projection.movedWhileAiming &&
    report.pcAim.open &&
    report.pcAim.openZoom === 3.2 &&
    !report.pcAim.closed &&
    report.pcAim.closedZoom === 1 &&
    report.pcAim.hullPreserved &&
    report.pcAim.turretPreserved &&
    report.pcAim.ammoPreserved &&
    report.pcAim.compassCount === 10 &&
    report.pcAim.contextMenuBlocked &&
    fixed.initialEnemyCount === 10 &&
    fixed.survivors === 10 &&
    fixed.sameEnemySet &&
    fixed.maxPositionDrift < 1e-9 &&
    fixed.maxHullAngleDrift < 1e-9 &&
    fixed.maxTurretTurn > 0.05 &&
    fixed.maxShotsAdded <= 3 &&
    fixed.enemyShots > 0 &&
    fixed.firingEnemies >= 2 &&
    fixed.allFixedFlags &&
    fixed.audioEvents.playerShots > 0 &&
    fixed.audioEvents.enemyShots > 0 &&
    fixed.audioEvents.hits > 0 &&
    easyCombat.kills >= 2 &&
    easyCombat.state === "playing" &&
    easyCombat.playerHp > 0 &&
    easyCombat.startX === 1480 &&
    easyCombat.startY === 1730 &&
    mobile.enemyCount === 10 &&
    mobile.fireButtonVisible &&
    mobile.shotsAddedAfterHold === 1 &&
    mobile.movingSpeed > 5 &&
    mobile.movingHud.leftStickVisible &&
    mobile.movingHud.active &&
    mobile.aim.visible &&
    !mobile.aim.overlapped &&
    mobile.aim.open &&
    mobile.aim.openZoom === 3.2 &&
    !mobile.aim.closed &&
    mobile.aim.closedZoom === 1 &&
    mobile.aim.hullPreserved &&
    mobile.aim.turretPreserved &&
    mobile.cockpit.base.ready &&
    mobile.cockpit.base.centerClear &&
    mobile.cockpit.base.muzzleY > 360 + 20 &&
    mobile.cockpit.aim.ready &&
    mobile.cockpit.aim.centerClear &&
    mobile.cockpit.aim.aimScale === 1.035 &&
    Math.abs(mobile.lookChanged) > 0.02 &&
    mobile.dualMoved > 0.5 &&
    Math.abs(mobile.dualLookChanged) > 0.02 &&
    Math.abs(mobile.hullChanged) > 0.01
  );
  report.assertions = { firstPersonEncirlementPassed: passed };
  console.log(JSON.stringify(report, null, 2));
  if (errors.length || !passed) process.exitCode = 1;
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

