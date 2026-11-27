"use strict";

const fs = require("fs");
const path = require("path");
const { chromium } = require(
  process.env.PLAYWRIGHT_CORE ||
  "/Users/zoujiean/CodeX/_temp-screenshots/2026-11/tools/vidu-cdp/node_modules/playwright-core"
);

const ORIGIN = process.env.TANK_ORIGIN || "http://127.0.0.1:8811";
const BASE_URL = ORIGIN + "/tank/";
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

function createMockServer() {
  return {
    cloudData: null,
    cloudWrites: 0,
    failBackupWrites: false,
    failEverything: false,
    async handle(route) {
      const request = route.request();
      const url = new URL(request.url());
      const cors = corsHeaders(request);

      if (request.method() === "OPTIONS") {
        await route.fulfill({ status: 204, headers: cors });
        return true;
      }

      if (url.hostname === "daobox.app" && url.pathname === "/portal.js") {
        await route.fulfill({
          status: 200,
          headers: { ...cors, "Content-Type": "application/javascript; charset=utf-8" },
          body: PORTAL_SCRIPT
        });
        return true;
      }

      if (url.hostname !== "daobox.app" || !url.pathname.startsWith("/api/")) return false;
      if (this.failEverything) {
        await route.fulfill({ status: 503, headers: cors, body: JSON.stringify({ error: "offline" }) });
        return true;
      }

      if (url.pathname === "/api/me") {
        await route.fulfill({
          status: 200,
          headers: { ...cors, "Content-Type": "application/json; charset=utf-8" },
          body: JSON.stringify({ ok: true, user: { id: 81, nickname: "测试坦克", phone: "13900000081" } })
        });
        return true;
      }

      if (url.pathname === "/api/child/me") {
        await route.fulfill({
          status: 200,
          headers: { ...cors, "Content-Type": "application/json; charset=utf-8" },
          body: JSON.stringify({ ok: false })
        });
        return true;
      }

      if (url.pathname === "/api/time") {
        await route.fulfill({
          status: 200,
          headers: { ...cors, "Content-Type": "application/json; charset=utf-8" },
          body: JSON.stringify({
            ok: true,
            used: 0,
            limit: 10,
            remaining: 10,
            unlimited: false,
            exceeded: false,
            kind: "anon",
            date: "2026-11-27"
          })
        });
        return true;
      }

      if (url.pathname === "/api/time/heartbeat") {
        await route.fulfill({
          status: 200,
          headers: { ...cors, "Content-Type": "application/json; charset=utf-8" },
          body: JSON.stringify({
            ok: true,
            used: 1,
            limit: 10,
            remaining: 9,
            unlimited: false,
            exceeded: false,
            kind: "anon"
          })
        });
        return true;
      }

      if (url.pathname === "/api/reward/status") {
        await route.fulfill({
          status: 200,
          headers: { ...cors, "Content-Type": "application/json; charset=utf-8" },
          body: JSON.stringify({ ok: true, balance: 25, checkedApps: [], streak: 2, memberUntil: 0 })
        });
        return true;
      }

      if (url.pathname === "/api/reward/checkin") {
        await route.fulfill({
          status: 200,
          headers: { ...cors, "Content-Type": "application/json; charset=utf-8" },
          body: JSON.stringify({ ok: true, balance: 30, streak: 3, bonus: 0 })
        });
        return true;
      }

      if (url.pathname === "/api/backup") {
        if (request.method() === "GET") {
          await route.fulfill({
            status: 200,
            headers: { ...cors, "Content-Type": "application/json; charset=utf-8" },
            body: JSON.stringify({ ok: true, app: "tank", data: this.cloudData, updatedAt: Date.now() })
          });
          return true;
        }
        if (request.method() === "POST") {
          if (this.failBackupWrites) {
            await route.fulfill({
              status: 503,
              headers: { ...cors, "Content-Type": "application/json; charset=utf-8" },
              body: JSON.stringify({ error: "temporary" })
            });
            return true;
          }
          const body = request.postDataJSON();
          this.cloudData = body.data;
          this.cloudWrites += 1;
          await route.fulfill({
            status: 200,
            headers: { ...cors, "Content-Type": "application/json; charset=utf-8" },
            body: JSON.stringify({ ok: true, app: "tank", size: String(body.data).length })
          });
          return true;
        }
      }

      if (url.pathname === "/api/logout") {
        await route.fulfill({
          status: 200,
          headers: { ...cors, "Content-Type": "application/json; charset=utf-8" },
          body: JSON.stringify({ ok: true })
        });
        return true;
      }

      await route.fulfill({
        status: 200,
        headers: { ...cors, "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({ ok: true })
      });
      return true;
    }
  };
}

async function attachMock(context, mock) {
  await context.route("**/*", async (route) => {
    const handled = await mock.handle(route);
    if (!handled) await route.continue();
  });
}

async function runPortalAndCloud(browser) {
  const mock = createMockServer();
  const contextA = await browser.newContext({ viewport: { width: 1280, height: 820 } });
  await attachMock(contextA, mock);
  const pageA = await contextA.newPage();
  const errorsA = [];
  pageA.on("pageerror", (error) => errorsA.push(error.message));
  await pageA.goto(BASE_URL, { waitUntil: "domcontentloaded" });
  await pageA.waitForTimeout(2000);
  const portal = await pageA.evaluate(() => ({
    accountSlot: document.getElementById("db-account-slot").children.length,
    pill: document.getElementById("db-account-pill")?.textContent,
    checkin: document.getElementById("db-checkin-chip")?.textContent,
    sync: document.getElementById("sync-status")?.textContent
  }));

  await pageA.click("#btn-start");
  await pageA.waitForTimeout(150);
  await pageA.evaluate(() => window.__tankTest.finishBattle(false));
  await pageA.waitForTimeout(1800);
  const localA = await pageA.evaluate(() => window.TankSync.loadLocal());
  const writesAfterA = mock.cloudWrites;

  const contextB = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await attachMock(contextB, mock);
  const pageB = await contextB.newPage();
  const errorsB = [];
  pageB.on("pageerror", (error) => errorsB.push(error.message));
  await pageB.goto(BASE_URL, { waitUntil: "domcontentloaded" });
  await pageB.waitForTimeout(2300);
  const restored = await pageB.evaluate(() => ({
    save: window.TankSync.loadLocal(),
    killsText: document.getElementById("menu-kills").textContent,
    writes: window.TankSync.lastSyncAt
  }));
  const timeLock = await pageB.evaluate(() => {
    window.dispatchEvent(new CustomEvent("daobox:timeexceeded", {
      detail: { used: 10, limit: 10, remaining: 0, unlimited: false, exceeded: true }
    }));
    return {
      locked: window.__tankTest.getSnapshot().locked,
      visible: !document.getElementById("time-lock").classList.contains("hidden")
    };
  });
  const writesAfterRestore = mock.cloudWrites;

  mock.failBackupWrites = true;
  await pageA.click("#btn-retry");
  await pageA.waitForTimeout(150);
  await pageA.evaluate(() => window.__tankTest.finishBattle(false));
  await pageA.waitForTimeout(900);
  const pendingBefore = await pageA.evaluate(() => ({
    pending: localStorage.getItem("dbtank-sync-pending-v1") === "1",
    battles: window.TankSync.loadLocal().stats.battles
  }));
  const writesWhileFailed = mock.cloudWrites;
  mock.failBackupWrites = false;
  await pageA.evaluate(() => window.TankSync.syncNow("test-online", { forceUpload: true }));
  await pageA.waitForTimeout(800);
  const pendingAfter = await pageA.evaluate(() => ({
    pending: localStorage.getItem("dbtank-sync-pending-v1") === "1",
    battles: window.TankSync.loadLocal().stats.battles
  }));
  const writesAfterFlush = mock.cloudWrites;

  await contextA.close();
  await contextB.close();
  return {
    portal,
    localA,
    writesAfterA,
    restored,
    timeLock,
    writesAfterRestore,
    emptyDeviceDidNotOverwrite: writesAfterRestore === writesAfterA,
    pendingBefore,
    writesWhileFailed,
    pendingAfter,
    writesAfterFlush,
    errors: [...errorsA, ...errorsB]
  };
}

async function runPwaChecks(browser) {
  const context = await browser.newContext({ viewport: { width: 900, height: 700 } });
  const root = await context.newPage();
  await root.goto(ORIGIN + "/", { waitUntil: "domcontentloaded" });
  await root.evaluate(async () => {
    const oldTank = await caches.open("dbtank-old");
    await oldTank.put("/old-probe", new Response("old"));
    const other = await caches.open("otherapp-cache");
    await other.put("/other-probe", new Response("other"));
  });
  const page = await context.newPage();
  await page.goto(BASE_URL, { waitUntil: "load" });
  await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.ready, null, { timeout: 15000 });
  const registration = await page.evaluate(async () => {
    const item = await navigator.serviceWorker.ready;
    return { scope: item.scope, controlled: !!navigator.serviceWorker.controller };
  });
  if (!registration.controlled) {
    await page.reload({ waitUntil: "load" });
    await page.waitForTimeout(500);
  }
  const cacheKeys = await page.evaluate(() => caches.keys());
  const assetCache = await page.evaluate(async () => {
    const key = (await caches.keys()).find((item) => item.startsWith("dbtank-"));
    if (!key) return { count: 0, totalBytes: 0, cockpitCached: false };
    const cache = await caches.open(key);
    const requests = await cache.keys();
    const manifestResponse = await cache.match(new URL("./assets/manifest.json", location.href).href);
    let totalBytes = 0;
    if (manifestResponse) {
      const manifest = await manifestResponse.json().catch(() => ({}));
      totalBytes = Number(manifest.totalBytes) || 0;
    }
    return {
      count: requests.filter((request) => new URL(request.url).pathname.includes("/assets/")).length,
      totalBytes,
      cockpitCached: requests.some((request) => request.url.endsWith("/assets/cockpit/cn-99a-gunner.webp"))
    };
  });
  await context.setOffline(true);
  await page.reload({ waitUntil: "domcontentloaded", timeout: 15000 });
  await page.waitForTimeout(900);
  const offline = await page.evaluate(() => ({
    title: document.title,
    state: window.__tankTest && window.__tankTest.state,
    canvas: !!document.getElementById("game")
  }));
  await context.setOffline(false);
  await context.close();
  return {
    scope: registration.scope,
    cacheKeys,
    assetCache,
    deletedOwnOld: !cacheKeys.includes("dbtank-old"),
    keptOtherApp: cacheKeys.includes("otherapp-cache"),
    offline
  };
}

async function runPortalFailure(browser) {
  const context = await browser.newContext({ viewport: { width: 1000, height: 720 } });
  await context.route("https://daobox.app/portal.js", (route) => route.abort());
  await context.route("https://daobox.app/api/**", (route) => route.abort());
  const page = await context.newPage();
  const startedAt = Date.now();
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 15000 });
  await page.waitForTimeout(1200);
  const result = await page.evaluate(() => ({
    state: window.__tankTest && window.__tankTest.state,
    menuVisible: !document.getElementById("menu").classList.contains("hidden"),
    canvas: !!document.getElementById("game")
  }));
  result.bootMs = Date.now() - startedAt;
  await context.close();
  return result;
}

async function run() {
  const browser = await chromium.launch({ headless: true, executablePath: CHROME });
  try {
    const platform = await runPortalAndCloud(browser);
    const pwa = await runPwaChecks(browser);
    const portalFailure = await runPortalFailure(browser);
    console.log(JSON.stringify({ platform, pwa, portalFailure }, null, 2));
    const failures = [];
    if (!platform.portal.accountSlot) failures.push("账号胶囊未注入");
    if (!platform.portal.pill || !platform.portal.pill.includes("测试坦克")) failures.push("账号身份未显示");
    if (!platform.portal.checkin) failures.push("打卡 chip 未注入");
    if (!platform.localA.stats.battles) failures.push("战斗未写入本机");
    if (!platform.restored.save.stats.battles) failures.push("新设备未恢复云档");
    if (!platform.timeLock.locked || !platform.timeLock.visible) failures.push("时长耗尽未锁定");
    if (!platform.emptyDeviceDidNotOverwrite) failures.push("空设备覆盖了云档");
    if (!platform.pendingBefore.pending) failures.push("离线失败未标记待同步");
    if (platform.pendingAfter.pending) failures.push("恢复网络后未清除待同步");
    if (!platform.writesAfterFlush || platform.writesAfterFlush <= platform.writesWhileFailed) failures.push("恢复网络后未补传");
    if (pwa.scope !== ORIGIN + "/tank/") failures.push("SW scope 不正确");
    if (!pwa.deletedOwnOld || !pwa.keptOtherApp) failures.push("缓存隔离不正确");
    if (pwa.assetCache.count < 34) failures.push("PWA 素材预缓存不完整");
    if (pwa.assetCache.totalBytes > 2 * 1024 * 1024) failures.push("PWA 素材包体超过 2 MiB");
    if (!pwa.assetCache.cockpitCached) failures.push("PWA 未预缓存 99A 炮塔内部");
    if (pwa.offline.state !== "menu") failures.push("离线首屏不可用");
    if (portalFailure.state !== "menu" || !portalFailure.canvas) failures.push("portal 不可用时游戏未启动");
    const unexpected = platform.errors.filter((message) =>
      !message.includes("Failed to load resource") &&
      !message.includes("ERR_NAME_NOT_RESOLVED")
    );
    if (unexpected.length) failures.push("页面脚本错误: " + unexpected.join(" | "));
    if (failures.length) {
      console.error("FAIL:", failures.join("; "));
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

