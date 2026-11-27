"use strict";

// 坦克项目云同步：游客只写本机，登录后与 /api/backup?app=tank 双向合并。
window.TankSync = (() => {
  const SAVE_KEY = "dbtank-save-v1";
  const PENDING_KEY = "dbtank-sync-pending-v1";
  const APP_ID = "tank";
  const SAVE_VERSION = 1;
  const SYNC_INTERVAL_MS = 60000;
  const ME_TIMEOUT_MS = 6500;

  let dbHome = "https://daobox.app";
  let initialized = false;
  let syncing = null;
  let lastSyncAt = 0;
  let knownLoggedIn = false;
  let onChange = null;

  const emptySave = () => ({
    version: SAVE_VERSION,
    updatedAt: 0,
    stats: {
      bestScore: 0,
      bestKills: 0,
      bestCombo: 0,
      wins: 0,
      battles: 0,
      totalKills: 0
    },
    settings: {
      muted: false
    }
  });

  const numberOrZero = (value) => {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  };

  const sanitize = (raw) => {
    const base = emptySave();
    let data = raw;
    if (typeof raw === "string") {
      try {
        data = JSON.parse(raw);
      } catch (e) {
        return base;
      }
    }
    if (!data || typeof data !== "object") return base;
    const stats = data.stats && typeof data.stats === "object" ? data.stats : {};
    base.updatedAt = numberOrZero(data.updatedAt);
    base.stats.bestScore = numberOrZero(stats.bestScore);
    base.stats.bestKills = numberOrZero(stats.bestKills);
    base.stats.bestCombo = numberOrZero(stats.bestCombo);
    base.stats.wins = numberOrZero(stats.wins);
    base.stats.battles = numberOrZero(stats.battles);
    base.stats.totalKills = numberOrZero(stats.totalKills);
    if (data.settings && typeof data.settings === "object") {
      base.settings.muted = !!data.settings.muted;
    }
    return base;
  };

  const hasProgress = (save) => {
    const s = sanitize(save).stats;
    return !!(
      s.bestScore ||
      s.bestKills ||
      s.bestCombo ||
      s.wins ||
      s.battles ||
      s.totalKills
    );
  };

  const mergeSaves = (a, b) => {
    const left = sanitize(a);
    const right = sanitize(b);
    const newer = right.updatedAt > left.updatedAt ? right : left;
    return {
      version: SAVE_VERSION,
      updatedAt: Math.max(left.updatedAt, right.updatedAt),
      stats: {
        bestScore: Math.max(left.stats.bestScore, right.stats.bestScore),
        bestKills: Math.max(left.stats.bestKills, right.stats.bestKills),
        bestCombo: Math.max(left.stats.bestCombo, right.stats.bestCombo),
        wins: Math.max(left.stats.wins, right.stats.wins),
        battles: Math.max(left.stats.battles, right.stats.battles),
        totalKills: Math.max(left.stats.totalKills, right.stats.totalKills)
      },
      settings: {
        muted: !!newer.settings.muted
      }
    };
  };

  const loadLocal = () => {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      return raw ? sanitize(raw) : emptySave();
    } catch (e) {
      return emptySave();
    }
  };

  const saveLocal = (save, options = {}) => {
    const safe = sanitize(save);
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(safe));
    } catch (e) {}
    if (options.pending) setPending(true);
    if (onChange) onChange(safe);
    return safe;
  };

  const setPending = (pending) => {
    try {
      if (pending) localStorage.setItem(PENDING_KEY, "1");
      else localStorage.removeItem(PENDING_KEY);
    } catch (e) {}
  };

  const isPending = () => {
    try {
      return localStorage.getItem(PENDING_KEY) === "1";
    } catch (e) {
      return false;
    }
  };

  const fetchWithTimeout = (url, options = {}, timeout = ME_TIMEOUT_MS) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
  };

  const detectLogin = async () => {
    try {
      const res = await fetchWithTimeout(
        dbHome + "/api/me?src=" + encodeURIComponent(APP_ID) + "&app=" + encodeURIComponent(APP_ID),
        { credentials: "include", cache: "no-store" }
      );
      const data = await res.json().catch(() => ({}));
      knownLoggedIn = !!(res.ok && data && data.ok && data.user);
      return {
        loggedIn: knownLoggedIn,
        user: knownLoggedIn ? data.user : null
      };
    } catch (e) {
      return { loggedIn: false, user: null, offline: true };
    }
  };

  const readCloud = async () => {
    const res = await fetchWithTimeout(
      dbHome + "/api/backup?app=" + encodeURIComponent(APP_ID),
      { credentials: "include", cache: "no-store" }
    );
    if (!res.ok) throw new Error("cloud backup read failed");
    const body = await res.json();
    return {
      save: body && body.data ? sanitize(body.data) : emptySave(),
      raw: body && body.data ? String(body.data) : ""
    };
  };

  const uploadCloud = async (save) => {
    const payload = JSON.stringify(save);
    if (payload.length > 256 * 1024) throw new Error("backup too large");
    const res = await fetchWithTimeout(dbHome + "/api/backup", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ app: APP_ID, data: payload })
    });
    if (!res.ok) throw new Error("cloud backup write failed");
    setPending(false);
    return true;
  };

  const normalizedComparable = (save) => JSON.stringify(sanitize(save));

  const runSync = async (reason, options = {}) => {
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      if (hasProgress(loadLocal())) setPending(true);
      return { ok: false, reason: "offline" };
    }
    const login = await detectLogin();
    if (!login.loggedIn) {
      return { ok: true, reason: login.offline ? "portal-unavailable" : "guest" };
    }

    const local = loadLocal();
    const cloud = await readCloud();
    const merged = mergeSaves(local, cloud.save);

    if (JSON.stringify(merged) !== JSON.stringify(local)) {
      saveLocal(merged);
    } else if (onChange) {
      onChange(local);
    }

    const localValid = hasProgress(merged);
    const localChanged = hasProgress(local) || isPending() || options.forceUpload;
    const cloudChanged = normalizedComparable(merged) !== normalizedComparable(cloud.save);
    const emptyCloudWouldBeOverwritten = !hasProgress(merged);

    if (localValid && localChanged && cloudChanged && !emptyCloudWouldBeOverwritten) {
      await uploadCloud(merged);
      lastSyncAt = Date.now();
      return { ok: true, reason, action: "uploaded", save: merged };
    }

    if (!hasProgress(local) && hasProgress(cloud.save)) {
      setPending(false);
      lastSyncAt = Date.now();
      return { ok: true, reason, action: "restored", save: merged };
    }

    lastSyncAt = Date.now();
    return { ok: true, reason, action: "merged", save: merged };
  };

  const syncNow = (reason = "manual", options = {}) => {
    if (syncing) return syncing;
    syncing = runSync(reason, options)
      .catch(() => {
        if (hasProgress(loadLocal())) setPending(true);
        return { ok: false, reason: "network-error" };
      })
      .finally(() => {
        syncing = null;
      });
    return syncing;
  };

  const recordBattle = (result) => {
    const current = loadLocal();
    const wins = current.stats.wins + (result.won ? 1 : 0);
    const battles = current.stats.battles + 1;
    const totalKills = current.stats.totalKills + numberOrZero(result.kills);
    const next = {
      ...current,
      updatedAt: Date.now(),
      stats: {
        bestScore: Math.max(current.stats.bestScore, numberOrZero(result.score)),
        bestKills: Math.max(current.stats.bestKills, numberOrZero(result.kills)),
        bestCombo: Math.max(current.stats.bestCombo, numberOrZero(result.bestCombo)),
        wins,
        battles,
        totalKills
      }
    };
    const saved = saveLocal(next, { pending: true });
    syncNow("battle", { forceUpload: true });
    return saved;
  };

  const updateSettings = (partial) => {
    const current = loadLocal();
    const next = {
      ...current,
      updatedAt: Date.now(),
      settings: {
        ...current.settings,
        ...partial
      }
    };
    const saved = saveLocal(next, { pending: true });
    syncNow("settings", { forceUpload: true });
    return saved;
  };

  const init = (options = {}) => {
    if (options.dbHome) dbHome = String(options.dbHome).replace(/\/$/, "");
    onChange = typeof options.onChange === "function" ? options.onChange : null;
    if (initialized) return syncNow("reinit");
    initialized = true;
    setTimeout(() => syncNow("startup"), 500);
    setInterval(() => syncNow("interval"), SYNC_INTERVAL_MS);
    window.addEventListener("online", () => syncNow("online", { forceUpload: true }));
    window.addEventListener("offline", () => {
      if (hasProgress(loadLocal())) setPending(true);
    });
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") syncNow("visible");
    });
    return Promise.resolve();
  };

  return {
    SAVE_KEY,
    PENDING_KEY,
    emptySave,
    sanitize,
    hasProgress,
    mergeSaves,
    loadLocal,
    saveLocal,
    recordBattle,
    updateSettings,
    syncNow,
    init,
    get loggedIn() {
      return knownLoggedIn;
    },
    get lastSyncAt() {
      return lastSyncAt;
    }
  };
})();

