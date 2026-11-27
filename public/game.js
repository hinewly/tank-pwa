"use strict";

(() => {
  const D = window.TankData;
  const Sync = window.TankSync;
  const B = D.BATTLE;
  const WORLD = D.WORLD;
  const TANK_TYPES = D.TANKS;
  const VIEW_W = 1280;
  const VIEW_H = 720;
  const APP_VERSION = "v0.1.2";
  const $ = (id) => document.getElementById(id);
  const TAU = Math.PI * 2;
  const COARSE_POINTER = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;

  let canvas = null;
  let ctx = null;
  let terrainCanvas = null;
  let state = "menu";
  let player = null;
  let enemies = [];
  let bullets = [];
  let obstacles = [];
  let particles = [];
  let floats = [];
  let rings = [];
  let tracks = [];
  let spawnedEnemies = 0;
  let nextEnemyId = 1;
  let kills = 0;
  let score = 0;
  let combo = 0;
  let comboTime = 0;
  let battleStartedAt = 0;
  let battleEndedAt = 0;
  let shotsFired = 0;
  let shotsHit = 0;
  let spawnTimer = 0;
  let lastFrame = performance.now();
  let locked = false;
  let pausedByVisibility = false;
  let screenShake = 0;
  let damageFlash = 0;
  let toastTimer = 0;
  let deferredInstallPrompt = null;
  let installDismissed = false;
  let saveData = Sync ? Sync.loadLocal() : null;
  let muted = !!(saveData && saveData.settings && saveData.settings.muted);
  const camera = { x: 0, y: 0 };
  const mouse = { x: VIEW_W / 2, y: VIEW_H / 2, active: false, firing: false };
  const keys = new Set();
  const touches = {
    left: { id: null, baseX: 0, baseY: 0, x: 0, y: 0, dx: 0, dy: 0, mag: 0 },
    right: { id: null, baseX: 0, baseY: 0, x: 0, y: 0, dx: 0, dy: 0, mag: 0 }
  };

  // ---------- 工具 ----------
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const normalizeAngle = (angle) => {
    while (angle > Math.PI) angle -= TAU;
    while (angle < -Math.PI) angle += TAU;
    return angle;
  };
  const angleDelta = (from, to) => normalizeAngle(to - from);
  const rotateToward = (current, target, maxStep) => {
    const delta = angleDelta(current, target);
    if (Math.abs(delta) <= maxStep) return target;
    return current + Math.sign(delta) * maxStep;
  };
  const approach = (value, target, step) => {
    if (value < target) return Math.min(value + step, target);
    if (value > target) return Math.max(value - step, target);
    return target;
  };
  const pointInView = (x, y, pad = 120) =>
    x > camera.x - pad && x < camera.x + VIEW_W + pad &&
    y > camera.y - pad && y < camera.y + VIEW_H + pad;
  const roundedRect = (x, y, w, h, r) => {
    const radius = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + w - radius, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
    ctx.lineTo(x + w, y + h - radius);
    ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
    ctx.lineTo(x + radius, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  };

  // ---------- 碰撞 ----------
  const circleRectIntersects = (x, y, r, rect) => {
    const nx = clamp(x, rect.x, rect.x + rect.w);
    const ny = clamp(y, rect.y, rect.y + rect.h);
    return (x - nx) * (x - nx) + (y - ny) * (y - ny) <= r * r;
  };

  const segmentRectHit = (x1, y1, x2, y2, rect) => {
    const dx = x2 - x1;
    const dy = y2 - y1;
    let tmin = 0;
    let tmax = 1;
    const axes = [
      [x1, dx, rect.x, rect.x + rect.w],
      [y1, dy, rect.y, rect.y + rect.h]
    ];
    for (const [origin, dir, min, max] of axes) {
      if (Math.abs(dir) < 0.00001) {
        if (origin < min || origin > max) return null;
        continue;
      }
      let t1 = (min - origin) / dir;
      let t2 = (max - origin) / dir;
      if (t1 > t2) [t1, t2] = [t2, t1];
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return null;
    }
    return tmin;
  };

  const segmentCircleHit = (x1, y1, x2, y2, cx, cy, r) => {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const fx = x1 - cx;
    const fy = y1 - cy;
    const a = dx * dx + dy * dy;
    if (a < 0.000001) return null;
    const b = 2 * (fx * dx + fy * dy);
    const c = fx * fx + fy * fy - r * r;
    const disc = b * b - 4 * a * c;
    if (disc < 0) return null;
    const root = Math.sqrt(disc);
    const t1 = (-b - root) / (2 * a);
    const t2 = (-b + root) / (2 * a);
    if (t1 >= 0 && t1 <= 1) return t1;
    if (t2 >= 0 && t2 <= 1) return t2;
    return null;
  };

  const lineBlocked = (x1, y1, x2, y2) => {
    for (const obstacle of obstacles) {
      if (obstacle.destroyed || !obstacle.blocks) continue;
      if (segmentRectHit(x1, y1, x2, y2, obstacle) !== null) return true;
    }
    return false;
  };

  const tankAtPositionFree = (tank, x, y) => {
    if (x < tank.radius || y < tank.radius || x > WORLD.width - tank.radius || y > WORLD.height - tank.radius) {
      return false;
    }
    for (const obstacle of obstacles) {
      if (obstacle.destroyed || !obstacle.blocks) continue;
      if (circleRectIntersects(x, y, tank.radius, obstacle)) return false;
    }
    const bodies = [player, ...enemies];
    for (const other of bodies) {
      if (!other || other === tank || !other.alive) continue;
      if (Math.hypot(x - other.x, y - other.y) < (tank.radius + other.radius) * 0.82) return false;
    }
    return true;
  };

  const moveTank = (tank, dx, dy) => {
    let moved = false;
    if (tankAtPositionFree(tank, tank.x + dx, tank.y + dy)) {
      tank.x += dx;
      tank.y += dy;
      moved = true;
    } else if (Math.abs(dx) > Math.abs(dy) && tankAtPositionFree(tank, tank.x + dx, tank.y)) {
      tank.x += dx;
      moved = true;
    } else if (tankAtPositionFree(tank, tank.x, tank.y + dy)) {
      tank.y += dy;
      moved = true;
    }
    if (moved) {
      tank.odometer += Math.hypot(dx, dy);
    } else {
      tank.speed *= 0.35;
    }
    return moved;
  };

  // ---------- 音效 ----------
  const AudioFx = (() => {
    let audio = null;
    const get = () => {
      if (!audio) {
        try {
          audio = new (window.AudioContext || window.webkitAudioContext)();
        } catch (e) {}
      }
      if (audio && audio.state === "suspended") {
        try {
          audio.resume().catch(() => {});
        } catch (e) {}
      }
      return audio;
    };

    const tone = (from, to, duration, type, volume, delay = 0) => {
      const ac = get();
      if (!ac || muted) return;
      const start = ac.currentTime + delay;
      const oscillator = ac.createOscillator();
      const gain = ac.createGain();
      oscillator.type = type || "sine";
      oscillator.frequency.setValueAtTime(from, start);
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, to), start + duration);
      gain.gain.setValueAtTime(volume, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
      oscillator.connect(gain).connect(ac.destination);
      oscillator.start(start);
      oscillator.stop(start + duration + 0.02);
    };

    const noise = (duration, volume, cutoff) => {
      const ac = get();
      if (!ac || muted) return;
      const length = Math.floor(ac.sampleRate * duration);
      const buffer = ac.createBuffer(1, length, ac.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i += 1) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 1.8);
      }
      const source = ac.createBufferSource();
      const filter = ac.createBiquadFilter();
      const gain = ac.createGain();
      source.buffer = buffer;
      filter.type = "lowpass";
      filter.frequency.value = cutoff;
      gain.gain.value = volume;
      source.connect(filter).connect(gain).connect(ac.destination);
      source.start();
    };

    return {
      unlock: get,
      click: () => tone(520, 760, 0.07, "triangle", 0.08),
      shoot: (isPlayer) => {
        noise(isPlayer ? 0.16 : 0.12, isPlayer ? 0.32 : 0.19, isPlayer ? 1300 : 900);
        tone(isPlayer ? 210 : 160, 54, 0.18, "square", isPlayer ? 0.18 : 0.11);
        tone(110, 45, 0.25, "triangle", 0.12);
      },
      empty: () => tone(760, 520, 0.06, "square", 0.06),
      reload: () => {
        tone(360, 300, 0.04, "square", 0.05);
        setTimeout(() => tone(460, 390, 0.04, "square", 0.05), 190);
      },
      hit: (zone) => {
        const strong = zone === "rear" ? 1 : 0;
        noise(0.13, 0.2 + strong * 0.08, 1900);
        tone(zone === "rear" ? 180 : 260, 70, 0.2, "square", 0.16);
        if (strong) tone(95, 45, 0.35, "triangle", 0.16);
      },
      ricochet: () => {
        tone(1450, 720, 0.18, "sawtooth", 0.1);
        noise(0.08, 0.08, 3000);
      },
      explode: (large) => {
        noise(large ? 0.62 : 0.32, large ? 0.55 : 0.28, large ? 650 : 900);
        tone(large ? 105 : 155, 38, large ? 0.65 : 0.35, "triangle", large ? 0.24 : 0.14);
      },
      breakCover: () => {
        noise(0.24, 0.2, 1250);
        tone(210, 95, 0.16, "square", 0.08);
      },
      win: () => {
        [392, 523, 659, 784].forEach((freq, i) => tone(freq, freq, 0.22, "triangle", 0.1, i * 0.12));
      },
      lose: () => {
        [280, 220, 165].forEach((freq, i) => tone(freq, freq * 0.82, 0.32, "sawtooth", 0.08, i * 0.15));
      }
    };
  })();

  // ---------- 地形 ----------
  const seededRandom = (seed) => {
    let value = seed >>> 0;
    return () => {
      value = (value * 1664525 + 1013904223) >>> 0;
      return value / 4294967296;
    };
  };

  const buildTerrain = () => {
    terrainCanvas = document.createElement("canvas");
    terrainCanvas.width = WORLD.width;
    terrainCanvas.height = WORLD.height;
    const terrain = terrainCanvas.getContext("2d");
    const rnd = seededRandom(20261127);
    terrain.fillStyle = "#536a3d";
    terrain.fillRect(0, 0, WORLD.width, WORLD.height);

    for (let i = 0; i < 1800; i += 1) {
      const x = rnd() * WORLD.width;
      const y = rnd() * WORLD.height;
      const w = 8 + rnd() * 52;
      const h = 5 + rnd() * 26;
      terrain.fillStyle = i % 4 === 0
        ? "rgba(122,145,78," + (0.08 + rnd() * 0.12) + ")"
        : "rgba(46,66,35," + (0.06 + rnd() * 0.12) + ")";
      terrain.beginPath();
      terrain.ellipse(x, y, w, h, rnd() * Math.PI, 0, TAU);
      terrain.fill();
    }

    terrain.strokeStyle = "rgba(96,81,48,.34)";
    terrain.lineWidth = 150;
    terrain.lineCap = "round";
    terrain.beginPath();
    terrain.moveTo(-80, 360);
    terrain.bezierCurveTo(520, 280, 1060, 520, 2280, 310);
    terrain.stroke();
    terrain.beginPath();
    terrain.moveTo(-80, 1190);
    terrain.bezierCurveTo(620, 1290, 1320, 1070, 2280, 1260);
    terrain.stroke();

    terrain.strokeStyle = "rgba(198,174,110,.16)";
    terrain.lineWidth = 2;
    for (let x = 0; x <= WORLD.width; x += 110) {
      terrain.beginPath();
      terrain.moveTo(x, 0);
      terrain.lineTo(x, WORLD.height);
      terrain.stroke();
    }
    for (let y = 0; y <= WORLD.height; y += 110) {
      terrain.beginPath();
      terrain.moveTo(0, y);
      terrain.lineTo(WORLD.width, y);
      terrain.stroke();
    }

    terrain.fillStyle = "rgba(33,45,27,.22)";
    for (let i = 0; i < 28; i += 1) {
      const x = 100 + rnd() * (WORLD.width - 200);
      const y = 100 + rnd() * (WORLD.height - 200);
      const r = 18 + rnd() * 52;
      terrain.beginPath();
      terrain.arc(x, y, r, 0, TAU);
      terrain.fill();
      terrain.strokeStyle = "rgba(175,148,89,.16)";
      terrain.lineWidth = 2;
      terrain.stroke();
    }
  };

  // ---------- 实体 ----------
  const makeTank = (typeId, x, y, angle, isPlayer) => {
    const type = TANK_TYPES[typeId];
    const tank = {
      type,
      isPlayer,
      fixed: !isPlayer,
      x,
      y,
      angle,
      turretAngle: angle,
      targetAim: angle,
      fireCooldown: 0,
      reload: 0,
      reloadDuration: isPlayer ? B.playerReload : B.enemyReload,
      ammo: B.magazineSize,
      shotsFired: 0,
      hp: isPlayer ? B.playerHp : B.enemyHp,
      maxHp: isPlayer ? B.playerHp : B.enemyHp,
      radius: type.radius,
      alive: true,
      recoil: 0,
      hitFlash: 0
    };
    if (isPlayer) {
      tank.speed = 0;
      tank.throttle = 0;
      tank.steer = 0;
      tank.fireHeld = false;
      tank.odometer = 0;
      tank.trackClock = 0;
    } else {
      tank.aimBias = (Math.random() - 0.5) * B.enemyAimBias;
    }
    return tank;
  };

  const resetBattle = () => {
    obstacles = D.cloneObstacles().map((obstacle, index) => {
      const meta = D.OBSTACLE_TYPES[obstacle.type];
      return {
        ...obstacle,
        id: index,
        hp: meta.hp,
        maxHp: meta.hp,
        destroyed: false,
        blocks: true,
        hitFlash: 0
      };
    });
    enemies = [];
    bullets = [];
    particles = [];
    floats = [];
    rings = [];
    tracks = [];
    kills = 0;
    score = 0;
    combo = 0;
    comboTime = 0;
    shotsFired = 0;
    shotsHit = 0;
    spawnedEnemies = 0;
    nextEnemyId = 1;
    spawnTimer = 1.2;
    screenShake = 0;
    damageFlash = 0;
    battleEndedAt = 0;
    battleStartedAt = performance.now();
    player = makeTank("type99a", WORLD.playerSpawn.x, WORLD.playerSpawn.y, WORLD.playerSpawn.angle, true);
    camera.x = clamp(player.x - VIEW_W / 2, 0, WORLD.width - VIEW_W);
    camera.y = clamp(player.y - VIEW_H / 2, 0, WORLD.height - VIEW_H);
    mouse.x = camera.x + VIEW_W * 0.68;
    mouse.y = player.y;

    const spawns = D.cloneSpawns();
    for (let i = 0; i < B.initialEnemies; i += 1) {
      spawnEnemy(spawns[i]);
    }
    updateMenuStats();
    updateHud();
  };

  const spawnEnemy = (spawn) => {
    const slot = spawnedEnemies % B.enemyTotal;
    const source = spawn || D.cloneSpawns()[slot];
    const enemy = makeTank("tiger", source.x, source.y, 0, false);
    enemy.slot = slot;
    enemy.id = "enemy-" + nextEnemyId;
    nextEnemyId += 1;
    enemy.reload = 0.7 + Math.random() * 1.2;
    if (!tankAtPositionFree(enemy, enemy.x, enemy.y)) {
      for (let attempt = 0; attempt < 16; attempt += 1) {
        const angle = (attempt / 16) * TAU;
        const radius = 35 + attempt * 6;
        const x = source.x + Math.cos(angle) * radius;
        const y = source.y + Math.sin(angle) * radius;
        if (tankAtPositionFree(enemy, x, y)) {
          enemy.x = x;
          enemy.y = y;
          break;
        }
      }
    }
    // 固定炮台：车体朝向在生成时确定，此后 x/y/angle 永不变化。
    enemy.angle = Math.atan2(
      WORLD.height / 2 - enemy.y,
      WORLD.width * 0.22 - enemy.x
    );
    enemy.turretAngle = enemy.angle;
    enemy.targetAim = enemy.angle;
    enemies.push(enemy);
    spawnedEnemies += 1;
  };

  const addObstacleWreck = (tank) => {
    const type = D.OBSTACLE_TYPES.wreck;
    obstacles.push({
      x: tank.x - 32,
      y: tank.y - 38,
      w: 64,
      h: 76,
      type: "wreck",
      id: "wreck-" + Math.random().toString(36).slice(2),
      angle: tank.angle,
      hp: null,
      maxHp: null,
      destroyed: false,
      blocks: true,
      hitFlash: 0,
      meta: type
    });
  };

  // ---------- 输入 ----------
  const updateMouseWorld = (event) => {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const sx = (event.clientX - rect.left) / rect.width * VIEW_W;
    const sy = (event.clientY - rect.top) / rect.height * VIEW_H;
    mouse.x = camera.x + sx;
    mouse.y = camera.y + sy;
    mouse.active = true;
  };

  const updateStick = (stick, event) => {
    const rect = canvas.getBoundingClientRect();
    const sx = (event.clientX - rect.left) / rect.width * VIEW_W;
    const sy = (event.clientY - rect.top) / rect.height * VIEW_H;
    stick.x = sx;
    stick.y = sy;
    const dx = sx - stick.baseX;
    const dy = sy - stick.baseY;
    const length = Math.hypot(dx, dy);
    const limit = 72;
    const scale = length > limit ? limit / length : 1;
    stick.dx = dx * scale / limit;
    stick.dy = dy * scale / limit;
    stick.mag = clamp(length / limit, 0, 1);
  };

  const beginTouchStick = (side, event) => {
    const rect = canvas.getBoundingClientRect();
    const sx = (event.clientX - rect.left) / rect.width * VIEW_W;
    const sy = (event.clientY - rect.top) / rect.height * VIEW_H;
    const stick = touches[side];
    const centerX = side === "left" ? 176 : VIEW_W - 176;
    const centerY = VIEW_H - 128;
    const distToBase = Math.hypot(sx - centerX, sy - centerY);
    stick.id = event.pointerId;
    stick.baseX = distToBase < 122 ? centerX : sx;
    stick.baseY = distToBase < 122 ? centerY : sy;
    stick.x = sx;
    stick.y = sy;
    stick.dx = 0;
    stick.dy = 0;
    stick.mag = 0;
    try {
      canvas.setPointerCapture(event.pointerId);
    } catch (e) {}
  };

  const bindInput = () => {
    canvas.addEventListener("pointerdown", (event) => {
      if (state !== "playing" || locked) return;
      AudioFx.unlock();
      if (event.pointerType === "mouse" || !COARSE_POINTER && event.pointerType !== "touch") {
        updateMouseWorld(event);
        mouse.firing = event.button === 0;
        if (event.button === 0) event.preventDefault();
        return;
      }
      event.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width * VIEW_W;
      beginTouchStick(x < VIEW_W / 2 ? "left" : "right", event);
    }, { passive: false });

    canvas.addEventListener("pointermove", (event) => {
      if (event.pointerType === "mouse" || event.pointerType === "pen") {
        updateMouseWorld(event);
        return;
      }
      if (touches.left.id === event.pointerId) updateStick(touches.left, event);
      if (touches.right.id === event.pointerId) updateStick(touches.right, event);
    }, { passive: false });

    const endPointer = (event) => {
      if (event.pointerType === "mouse" || event.pointerType === "pen") {
        if (event.type === "pointerup" || event.type === "pointercancel") mouse.firing = false;
        return;
      }
      for (const side of ["left", "right"]) {
        const stick = touches[side];
        if (stick.id === event.pointerId) {
          stick.id = null;
          stick.mag = 0;
          stick.dx = 0;
          stick.dy = 0;
        }
      }
    };
    canvas.addEventListener("pointerup", endPointer);
    canvas.addEventListener("pointercancel", endPointer);
    window.addEventListener("pointerup", (event) => {
      if (event.pointerType === "mouse") mouse.firing = false;
    });
    canvas.addEventListener("contextmenu", (event) => event.preventDefault());

    window.addEventListener("keydown", (event) => {
      const key = event.key.toLowerCase();
      if (["w", "a", "s", "d", "r", " ", "arrowup", "arrowdown", "arrowleft", "arrowright", "escape"].includes(key)) {
        if (state === "playing" || key === "escape") event.preventDefault();
      }
      AudioFx.unlock();
      keys.add(key);
      if (key === "r" && state === "playing" && !locked) startReload(player);
      if (key === "escape" && (state === "playing" || state === "paused")) togglePause();
    });
    window.addEventListener("keyup", (event) => {
      keys.delete(event.key.toLowerCase());
    });
    window.addEventListener("blur", () => {
      keys.clear();
      mouse.firing = false;
      if (state === "playing") pauseGame(true);
    });
    window.addEventListener("resize", updateCanvasFrame);
  };

  const updatePlayer = (dt) => {
    if (!player || !player.alive) return;
    let throttle = 0;
    let steer = 0;
    let fire = false;
    let aimAngle = player.turretAngle;

    if (touches.left.id !== null) {
      throttle = -touches.left.dy;
      steer = touches.left.dx;
    } else {
      if (keys.has("w") || keys.has("arrowup")) throttle += 1;
      if (keys.has("s") || keys.has("arrowdown")) throttle -= 1;
      if (keys.has("d") || keys.has("arrowright")) steer += 1;
      if (keys.has("a") || keys.has("arrowleft")) steer -= 1;
    }

    if (touches.right.id !== null && touches.right.mag > 0.12) {
      const sx = touches.right.x - touches.right.baseX;
      const sy = touches.right.y - touches.right.baseY;
      aimAngle = Math.atan2(sy, sx);
      fire = touches.right.mag > 0.2;
    } else if (mouse.active) {
      aimAngle = Math.atan2(mouse.y - player.y, mouse.x - player.x);
      fire = mouse.firing || keys.has(" ");
    } else if (keys.has(" ")) {
      fire = true;
      aimAngle = player.turretAngle;
    }

    const speedSign = Math.sign(throttle);
    const speedLimit = speedSign >= 0 ? player.type.maxForward : player.type.maxReverse;
    const targetSpeed = throttle * speedLimit * clamp(Math.abs(throttle) + 0.1, 0, 1);
    const speedStep = (speedSign !== 0 ? player.type.acceleration : player.type.brake) * dt;
    player.speed = approach(player.speed, targetSpeed, speedStep);

    const turnScale = 0.42 + 0.58 * clamp(Math.abs(player.speed) / 55, 0, 1);
    player.angle = normalizeAngle(player.angle + steer * player.type.hullTurnRate * turnScale * dt);
    player.turretAngle = rotateToward(
      player.turretAngle,
      aimAngle,
      player.type.turretTurnRate * dt
    );

    moveTank(
      player,
      Math.cos(player.angle) * player.speed * dt,
      Math.sin(player.angle) * player.speed * dt
    );

    player.fireHeld = fire;
    updateWeaponTimers(player, dt);
    if (fire) tryFire(player);
  };

  // ---------- 固定炮台 ----------
  const updateEnemy = (enemy, dt) => {
    if (!enemy.alive || !player || !player.alive) return;
    const dx = player.x - enemy.x;
    const dy = player.y - enemy.y;
    const dist = Math.hypot(dx, dy);
    const toPlayer = Math.atan2(dy, dx);
    const visible = !lineBlocked(enemy.x, enemy.y, player.x, player.y);
    const inRange = dist <= B.enemyRange;
    const targetAim = toPlayer + enemy.aimBias;
    enemy.targetAim = targetAim;
    enemy.turretAngle = rotateToward(enemy.turretAngle, targetAim, enemy.type.turretTurnRate * dt);
    updateWeaponTimers(enemy, dt);
    if (!visible || !inRange) return;
    const turretError = Math.abs(angleDelta(enemy.turretAngle, toPlayer));
    if (turretError < 0.065 && enemy.reload <= 0 && enemy.ammo > 0) {
      tryFire(enemy);
    }
  };

  // ---------- 战斗 ----------
  const updateWeaponTimers = (tank, dt) => {
    if (!tank) return;
    tank.fireCooldown = Math.max(0, tank.fireCooldown - dt);
    tank.recoil = Math.max(0, tank.recoil - dt * 28);
    tank.hitFlash = Math.max(0, tank.hitFlash - dt * 4);
    if (tank.reload > 0) {
      tank.reload = Math.max(0, tank.reload - dt);
      if (tank.reload === 0) {
        tank.ammo = B.magazineSize;
        if (tank.isPlayer) AudioFx.reload();
      }
    }
    if (tank.ammo <= 0 && tank.reload === 0) startReload(tank);
  };

  const startReload = (tank) => {
    if (!tank || tank.reload > 0 || tank.ammo >= B.magazineSize || !tank.alive) return;
    tank.reload = tank.reloadDuration;
    if (tank.isPlayer) AudioFx.reload();
  };

  const tryFire = (tank) => {
    if (!tank || !tank.alive || tank.fireCooldown > 0 || tank.reload > 0) return false;
    if (tank.ammo <= 0) {
      if (tank.isPlayer) AudioFx.empty();
      startReload(tank);
      return false;
    }
    const muzzleDistance = tank.type.hullLength * 0.22 + tank.type.barrelLength - tank.recoil;
    const x = tank.x + Math.cos(tank.turretAngle) * muzzleDistance;
    const y = tank.y + Math.sin(tank.turretAngle) * muzzleDistance;
    bullets.push({
      x,
      y,
      px: x,
      py: y,
      vx: Math.cos(tank.turretAngle) * B.bulletSpeed,
      vy: Math.sin(tank.turretAngle) * B.bulletSpeed,
      owner: tank,
      isPlayer: tank.isPlayer,
      damage: tank.isPlayer ? B.playerDamage : B.enemyDamage,
      alive: true,
      trail: 0
    });
    tank.ammo -= 1;
    tank.shotsFired += 1;
    tank.fireCooldown = B.fireCooldown;
    tank.recoil = 7;
    if (tank.ammo <= 0) {
      tank.reload = tank.reloadDuration;
    }
    if (tank.isPlayer) {
      shotsFired += 1;
      screenShake = Math.max(screenShake, 2.2);
    }
    AudioFx.shoot(tank.isPlayer);
    for (let i = 0; i < 7; i += 1) {
      particles.push({
        x,
        y,
        vx: Math.cos(tank.turretAngle) * (50 + Math.random() * 110) + (Math.random() - 0.5) * 35,
        vy: Math.sin(tank.turretAngle) * (50 + Math.random() * 110) + (Math.random() - 0.5) * 35,
        life: 0.15 + Math.random() * 0.18,
        maxLife: 0.35,
        size: 2 + Math.random() * 4,
        color: tank.isPlayer ? "#ffe58a" : "#ffb15d"
      });
    }
    return true;
  };

  const armorProfile = (tank, impactDirection) => {
    const relative = Math.abs(angleDelta(impactDirection, tank.angle));
    if (relative > (Math.PI * 2) / 3) {
      return { zone: "front", label: "正面装甲", multiplier: B.frontMultiplier, color: "#d6e7b4" };
    }
    if (relative < Math.PI / 3) {
      return { zone: "rear", label: "后部装甲", multiplier: B.rearMultiplier, color: "#ff9b73" };
    }
    return { zone: "side", label: "侧面装甲", multiplier: B.sideMultiplier, color: "#ffe889" };
  };

  const addFloat = (x, y, text, color, size = 18) => {
    floats.push({ x, y, text, color, size, life: 1.15, maxLife: 1.15 });
  };

  const addRing = (x, y, maxRadius, color, duration = 0.45) => {
    rings.push({ x, y, radius: 8, maxRadius, color, life: duration, maxLife: duration });
  };

  const addBurst = (x, y, color, count, power) => {
    for (let i = 0; i < count; i += 1) {
      const angle = Math.random() * TAU;
      const speed = power * (0.35 + Math.random() * 0.9);
      particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.28 + Math.random() * 0.6,
        maxLife: 0.9,
        size: 2 + Math.random() * 6,
        color,
        drag: 0.94
      });
    }
  };

  const damageObstacle = (obstacle, bullet) => {
    if (!obstacle || obstacle.destroyed) return;
    if (obstacle.hp === null) {
      addBurst(bullet.x, bullet.y, "#f6d58b", 9, 130);
      addFloat(bullet.x, bullet.y - 18, "硬掩体", "#ddd7c5", 15);
      AudioFx.hit("front");
      return;
    }
    obstacle.hp -= bullet.damage;
    obstacle.hitFlash = 1;
    addBurst(bullet.x, bullet.y, D.OBSTACLE_TYPES[obstacle.type].edge, 12, 150);
    if (obstacle.hp <= 0) {
      obstacle.destroyed = true;
      addBurst(obstacle.x + obstacle.w / 2, obstacle.y + obstacle.h / 2, "#b57b43", 34, 220);
      addRing(obstacle.x + obstacle.w / 2, obstacle.y + obstacle.h / 2, 60, "rgba(221,179,105,.7)");
      addFloat(obstacle.x + obstacle.w / 2, obstacle.y - 10, "掩体摧毁", "#ffd178", 17);
      screenShake = Math.max(screenShake, 5);
      AudioFx.breakCover();
    } else {
      AudioFx.hit("side");
    }
  };

  const destroyTank = (tank) => {
    if (!tank || !tank.alive) return;
    tank.alive = false;
    addObstacleWreck(tank);
    addBurst(tank.x, tank.y, "#ffb347", 48, 310);
    addBurst(tank.x, tank.y, "#333a31", 30, 180);
    addRing(tank.x, tank.y, 105, "rgba(255,183,86,.8)", 0.7);
    screenShake = Math.max(screenShake, tank.isPlayer ? 20 : 13);
    AudioFx.explode(true);
    if (tank.isPlayer) {
      damageFlash = 1.4;
      finishBattle(false);
      return;
    }
    enemies = enemies.filter((enemy) => enemy !== tank);
    kills += 1;
    combo = comboTime > 0 ? combo + 1 : 1;
    comboTime = B.comboWindow;
    const points = (110 + (combo - 1) * 28) * Math.min(combo, 8);
    score += points;
    addFloat(tank.x, tank.y - 26, "+" + points + (combo > 1 ? "  ×" + combo : ""), "#f7e59a", 22);
    if (kills >= B.enemyTotal && enemies.length === 0) {
      // 最后一辆敌车被击毁时清除在途敌弹，避免“敌军已清零但玩家死于旧弹”的结算竞态。
      bullets = bullets.filter((bullet) => bullet.isPlayer);
      setTimeout(() => {
        if (state === "playing") finishBattle(true);
      }, 550);
    }
  };

  const damageTank = (target, bullet) => {
    if (!target || !target.alive) return;
    const impactDirection = Math.atan2(bullet.vy, bullet.vx);
    const armor = armorProfile(target, impactDirection);
    if (armor.zone === "front" && Math.random() < B.frontRicochetChance) {
      addBurst(bullet.x, bullet.y, "#fff2b2", 17, 230);
      addRing(bullet.x, bullet.y, 48, "rgba(255,239,176,.75)", 0.38);
      addFloat(target.x, target.y - 42, "跳弹", "#fff0a6", 20);
      AudioFx.ricochet();
      target.hitFlash = 0.8;
      return;
    }
    const damage = Math.round(bullet.damage * armor.multiplier);
    target.hp = Math.max(0, target.hp - damage);
    target.hitFlash = 1;
    if (bullet.isPlayer) shotsHit += 1;
    if (target.isPlayer) damageFlash = Math.max(damageFlash, 0.7);
    addBurst(bullet.x, bullet.y, armor.color, 15, 180);
    addFloat(target.x, target.y - 48, armor.label + " -" + damage, armor.color, 18);
    screenShake = Math.max(screenShake, target.isPlayer ? 8 : 4);
    AudioFx.hit(armor.zone);
    if (target.hp <= 0) destroyTank(target);
  };

  const updateBullets = (dt) => {
    for (const bullet of bullets) {
      if (!bullet.alive) continue;
      bullet.px = bullet.x;
      bullet.py = bullet.y;
      bullet.x += bullet.vx * dt;
      bullet.y += bullet.vy * dt;
      bullet.trail += dt;

      if (bullet.x < -40 || bullet.y < -40 || bullet.x > WORLD.width + 40 || bullet.y > WORLD.height + 40) {
        bullet.alive = false;
        continue;
      }

      let nearestT = 1;
      let hitType = null;
      let hitTarget = null;
      for (const obstacle of obstacles) {
        if (obstacle.destroyed || !obstacle.blocks) continue;
        const t = segmentRectHit(bullet.px, bullet.py, bullet.x, bullet.y, obstacle);
        if (t !== null && t < nearestT) {
          nearestT = t;
          hitType = "obstacle";
          hitTarget = obstacle;
        }
      }
      const candidates = [player, ...enemies];
      for (const tank of candidates) {
        if (!tank || !tank.alive || tank === bullet.owner) continue;
        const t = segmentCircleHit(bullet.px, bullet.py, bullet.x, bullet.y, tank.x, tank.y, tank.radius);
        if (t !== null && t < nearestT) {
          nearestT = t;
          hitType = "tank";
          hitTarget = tank;
        }
      }
      if (hitType) {
        const hitX = lerp(bullet.px, bullet.x, nearestT);
        const hitY = lerp(bullet.py, bullet.y, nearestT);
        bullet.x = hitX;
        bullet.y = hitY;
        bullet.alive = false;
        if (hitType === "obstacle") damageObstacle(hitTarget, bullet);
        else damageTank(hitTarget, bullet);
      }
    }
    bullets = bullets.filter((bullet) => bullet.alive);
  };

  const updateEffects = (dt) => {
    for (const particle of particles) {
      particle.life -= dt;
      const drag = particle.drag || 0.97;
      particle.vx *= Math.pow(drag, dt * 60);
      particle.vy *= Math.pow(drag, dt * 60);
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
    }
    particles = particles.filter((particle) => particle.life > 0);
    for (const item of floats) {
      item.life -= dt;
      item.y -= 30 * dt;
    }
    floats = floats.filter((item) => item.life > 0);
    for (const ring of rings) {
      ring.life -= dt;
      const progress = 1 - ring.life / ring.maxLife;
      ring.radius = lerp(8, ring.maxRadius, progress);
    }
    rings = rings.filter((ring) => ring.life > 0);
    for (const track of tracks) track.life -= dt;
    tracks = tracks.filter((track) => track.life > 0);
    screenShake = Math.max(0, screenShake - dt * 28);
    damageFlash = Math.max(0, damageFlash - dt * 2);
    for (const obstacle of obstacles) obstacle.hitFlash = Math.max(0, obstacle.hitFlash - dt * 3.5);
    if (comboTime > 0) {
      comboTime = Math.max(0, comboTime - dt);
      if (comboTime === 0) combo = 0;
    }
  };

  const addTracks = (tank, dt, owner) => {
    tank.trackClock -= dt;
    if (Math.abs(tank.speed) < 18 || tank.trackClock > 0) return;
    tank.trackClock = 0.22;
    const sideX = Math.cos(tank.angle + Math.PI / 2) * tank.type.hullWidth * 0.36;
    const sideY = Math.sin(tank.angle + Math.PI / 2) * tank.type.hullWidth * 0.36;
    const backX = Math.cos(tank.angle) * tank.type.hullLength * 0.46;
    const backY = Math.sin(tank.angle) * tank.type.hullLength * 0.46;
    tracks.push({
      x1: tank.x - backX + sideX,
      y1: tank.y - backY + sideY,
      x2: tank.x - backX - sideX,
      y2: tank.y - backY - sideY,
      owner: owner || "player",
      life: 12
    });
    if (tracks.length > 220) tracks.splice(0, tracks.length - 220);
  };

  // ---------- 渲染 ----------
  const updateCamera = (dt) => {
    if (!player) return;
    const lookX = mouse.active && touches.right.id === null
      ? clamp(mouse.x, player.x - 260, player.x + 260)
      : player.x + Math.cos(player.angle) * 90;
    const lookY = mouse.active && touches.right.id === null
      ? clamp(mouse.y, player.y - 170, player.y + 170)
      : player.y + Math.sin(player.angle) * 90;
    const targetX = clamp(lookX - VIEW_W / 2, 0, WORLD.width - VIEW_W);
    const targetY = clamp(lookY - VIEW_H / 2, 0, WORLD.height - VIEW_H);
    const ease = 1 - Math.pow(0.0001, dt);
    camera.x = lerp(camera.x, targetX, ease);
    camera.y = lerp(camera.y, targetY, ease);
  };

  const drawTracks = () => {
    ctx.strokeStyle = "rgba(37,43,29,.34)";
    ctx.lineWidth = 4;
    for (const track of tracks) {
      ctx.globalAlpha = clamp(track.life / 12, 0, 0.42);
      ctx.beginPath();
      ctx.moveTo(track.x1, track.y1);
      ctx.lineTo(track.x2, track.y2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  };

  const drawObstacle = (obstacle) => {
    if (!obstacle || obstacle.destroyed || !pointInView(obstacle.x, obstacle.y, 120)) return;
    const meta = D.OBSTACLE_TYPES[obstacle.type];
    ctx.save();
    ctx.translate(obstacle.x + obstacle.w / 2, obstacle.y + obstacle.h / 2);
    if (obstacle.type === "wreck") ctx.rotate(obstacle.angle || 0);
    ctx.translate(-obstacle.w / 2, -obstacle.h / 2);
    ctx.shadowColor = "rgba(12,18,10,.34)";
    ctx.shadowBlur = 12;
    ctx.shadowOffsetX = 8;
    ctx.shadowOffsetY = 10;
    ctx.fillStyle = meta.fill;
    roundedRect(0, 0, obstacle.w, obstacle.h, obstacle.type === "sandbag" ? 9 : 4);
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.strokeStyle = obstacle.hitFlash > 0 ? "#ffecad" : meta.edge;
    ctx.lineWidth = obstacle.hitFlash > 0 ? 4 : 2;
    ctx.stroke();

    if (obstacle.type === "wood") {
      ctx.strokeStyle = meta.pattern;
      ctx.lineWidth = 3;
      const horizontal = obstacle.w >= obstacle.h;
      if (horizontal) {
        for (let y = 12; y < obstacle.h; y += 15) {
          ctx.beginPath();
          ctx.moveTo(4, y);
          ctx.lineTo(obstacle.w - 4, y);
          ctx.stroke();
        }
      } else {
        for (let x = 12; x < obstacle.w; x += 15) {
          ctx.beginPath();
          ctx.moveTo(x, 4);
          ctx.lineTo(x, obstacle.h - 4);
          ctx.stroke();
        }
      }
    } else if (obstacle.type === "sandbag") {
      ctx.fillStyle = meta.pattern;
      const bagWidth = 34;
      const bagHeight = Math.max(18, obstacle.h / 2);
      for (let y = 3; y < obstacle.h; y += bagHeight) {
        for (let x = 5 + ((y / bagHeight) % 2) * 12; x < obstacle.w - 8; x += bagWidth) {
          roundedRect(x, y, Math.min(bagWidth - 3, obstacle.w - x - 3), bagHeight - 4, 8);
          ctx.globalAlpha = 0.5;
          ctx.fill();
          ctx.globalAlpha = 1;
        }
      }
    } else if (obstacle.type === "concrete") {
      ctx.strokeStyle = meta.pattern;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(obstacle.w * 0.18, 0);
      ctx.lineTo(obstacle.w * 0.34, obstacle.h * 0.4);
      ctx.lineTo(obstacle.w * 0.25, obstacle.h);
      ctx.moveTo(obstacle.w * 0.74, 0);
      ctx.lineTo(obstacle.w * 0.64, obstacle.h * 0.5);
      ctx.lineTo(obstacle.w * 0.8, obstacle.h);
      ctx.stroke();
    } else if (obstacle.type === "wreck") {
      ctx.fillStyle = meta.pattern;
      roundedRect(7, 8, obstacle.w - 14, obstacle.h - 16, 12);
      ctx.fill();
      ctx.strokeStyle = "#6e5640";
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(obstacle.w / 2 + 4, obstacle.h / 2);
      ctx.lineTo(obstacle.w / 2 + 30, obstacle.h / 2 - 8);
      ctx.stroke();
      ctx.fillStyle = "#9a4d2f";
      ctx.beginPath();
      ctx.arc(obstacle.w * 0.42, obstacle.h * 0.38, 5, 0, TAU);
      ctx.fill();
    }

    if (obstacle.hp !== null && obstacle.maxHp && obstacle.hp < obstacle.maxHp) {
      const p = clamp(obstacle.hp / obstacle.maxHp, 0, 1);
      ctx.fillStyle = "rgba(20,24,17,.58)";
      ctx.fillRect(4, obstacle.h - 8, obstacle.w - 8, 4);
      ctx.fillStyle = p > 0.45 ? "#d2b165" : "#d66b4a";
      ctx.fillRect(4, obstacle.h - 8, (obstacle.w - 8) * p, 4);
    }
    ctx.restore();
  };

  const drawTank = (tank) => {
    if (!tank || !tank.alive || !pointInView(tank.x, tank.y)) return;
    const type = tank.type;
    const colors = type.colors;
    ctx.save();
    ctx.translate(tank.x + 7, tank.y + 10);
    ctx.rotate(tank.angle);
    ctx.fillStyle = "rgba(17,23,14,.36)";
    roundedRect(-type.hullLength / 2, -type.hullWidth / 2, type.hullLength, type.hullWidth, 10);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(tank.x, tank.y);
    ctx.rotate(tank.angle);

    const halfL = type.hullLength / 2;
    const halfW = type.hullWidth / 2;
    ctx.fillStyle = colors.track;
    roundedRect(-halfL + 1, -halfW - 5, type.hullLength - 2, 13, 4);
    ctx.fill();
    roundedRect(-halfL + 1, halfW - 8, type.hullLength - 2, 13, 4);
    ctx.fill();
    ctx.strokeStyle = colors.trackLine;
    ctx.lineWidth = 2;
    const trackOffset = ((tank.odometer || 0) * 0.26) % 12;
    for (let x = -halfL + 5 - trackOffset; x < halfL - 3; x += 12) {
      ctx.beginPath();
      ctx.moveTo(x, -halfW - 3);
      ctx.lineTo(x, -halfW + 5);
      ctx.moveTo(x, halfW - 5);
      ctx.lineTo(x, halfW + 3);
      ctx.stroke();
    }

    ctx.fillStyle = colors.bodyDark;
    ctx.beginPath();
    ctx.moveTo(halfL + 3, 0);
    ctx.lineTo(halfL - 11, -halfW + 2);
    ctx.lineTo(-halfL + 10, -halfW + 3);
    ctx.lineTo(-halfL - 1, 0);
    ctx.lineTo(-halfL + 10, halfW - 3);
    ctx.lineTo(halfL - 11, halfW - 2);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = tank.hitFlash > 0 ? "#f2e7b5" : colors.body;
    ctx.beginPath();
    ctx.moveTo(halfL - 2, 0);
    ctx.lineTo(halfL - 13, -halfW + 7);
    ctx.lineTo(-halfL + 10, -halfW + 7);
    ctx.lineTo(-halfL + 3, 0);
    ctx.lineTo(-halfL + 10, halfW - 7);
    ctx.lineTo(halfL - 13, halfW - 7);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = colors.accent;
    ctx.lineWidth = 1.4;
    ctx.stroke();

    if (tank.isPlayer) {
      ctx.fillStyle = "rgba(51,72,45,.7)";
      ctx.beginPath();
      ctx.ellipse(-11, -7, 9, 5, 0.4, 0, TAU);
      ctx.ellipse(8, 8, 11, 5, -0.5, 0, TAU);
      ctx.ellipse(18, -9, 6, 4, 0.2, 0, TAU);
      ctx.fill();
      ctx.fillStyle = "#d2e494";
      ctx.fillRect(-halfL + 11, -halfW + 8, 4, 5);
    } else {
      ctx.strokeStyle = "rgba(69,49,28,.75)";
      ctx.lineWidth = 3;
      for (let i = -2; i <= 2; i += 1) {
        ctx.beginPath();
        ctx.moveTo(i * 12 - 3, -halfW + 9);
        ctx.lineTo(i * 12 + 4, halfW - 9);
        ctx.stroke();
      }
      ctx.fillStyle = "#c96042";
      ctx.fillRect(halfL - 14, -4, 7, 8);
    }

    ctx.save();
    ctx.rotate(angleDelta(tank.angle, tank.turretAngle));
    ctx.fillStyle = colors.bodyDark;
    ctx.beginPath();
    ctx.arc(0, 0, type.turretLength, 0, TAU);
    ctx.fill();
    ctx.fillStyle = tank.hitFlash > 0 ? "#fff1b3" : colors.bodyLight;
    ctx.beginPath();
    ctx.arc(-1, -1, type.turretLength - 5, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = colors.accent;
    ctx.lineWidth = 1.6;
    ctx.stroke();

    const recoil = tank.recoil;
    ctx.fillStyle = colors.barrel;
    roundedRect(type.turretLength * 0.28 - recoil, -4, type.barrelLength, 8, 3);
    ctx.fill();
    ctx.fillStyle = colors.bodyLight;
    roundedRect(type.barrelLength - 7 - recoil, -6, 9, 12, 2);
    ctx.fill();
    ctx.fillStyle = tank.isPlayer ? "#9fd06c" : "#e8bf72";
    ctx.beginPath();
    ctx.arc(-2, 0, 4, 0, TAU);
    ctx.fill();
    ctx.restore();

    ctx.restore();

    if (!tank.isPlayer && tank.hp < tank.maxHp) {
      const p = clamp(tank.hp / tank.maxHp, 0, 1);
      ctx.fillStyle = "rgba(16,20,15,.7)";
      ctx.fillRect(tank.x - 30, tank.y - 47, 60, 6);
      ctx.fillStyle = p > 0.5 ? "#d9c66b" : "#e07354";
      ctx.fillRect(tank.x - 30, tank.y - 47, 60 * p, 6);
    }
  };

  const drawBullets = () => {
    for (const bullet of bullets) {
      const length = 17;
      ctx.strokeStyle = bullet.isPlayer ? "rgba(240,255,183,.82)" : "rgba(255,173,103,.85)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(bullet.x - bullet.vx / B.bulletSpeed * length, bullet.y - bullet.vy / B.bulletSpeed * length);
      ctx.lineTo(bullet.x, bullet.y);
      ctx.stroke();
      ctx.fillStyle = bullet.isPlayer ? "#f6ffc7" : "#ffb15d";
      ctx.beginPath();
      ctx.arc(bullet.x, bullet.y, 2.8, 0, TAU);
      ctx.fill();
    }
  };

  const drawEffects = () => {
    for (const particle of particles) {
      ctx.globalAlpha = clamp(particle.life / particle.maxLife, 0, 1);
      ctx.fillStyle = particle.color;
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.size * clamp(particle.life / particle.maxLife, 0.2, 1), 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    for (const ring of rings) {
      ctx.globalAlpha = clamp(ring.life / ring.maxLife, 0, 1);
      ctx.strokeStyle = ring.color;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(ring.x, ring.y, ring.radius, 0, TAU);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    for (const item of floats) {
      const alpha = clamp(item.life / item.maxLife, 0, 1);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = "rgba(11,17,10,.72)";
      ctx.font = "700 " + item.size + "px -apple-system,'PingFang SC','Microsoft YaHei',sans-serif";
      const width = ctx.measureText(item.text).width;
      roundedRect(item.x - width / 2 - 8, item.y - item.size - 7, width + 16, item.size + 13, 8);
      ctx.fill();
      ctx.fillStyle = item.color;
      ctx.textAlign = "center";
      ctx.fillText(item.text, item.x, item.y);
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = "left";
  };

  const drawJoystick = (stick, active) => {
    if (!active) return;
    const baseX = stick.baseX;
    const baseY = stick.baseY;
    const knobX = baseX + stick.dx * 54;
    const knobY = baseY + stick.dy * 54;
    ctx.fillStyle = "rgba(15,24,14,.28)";
    ctx.strokeStyle = "rgba(225,239,176,.4)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(baseX, baseY, 67, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "rgba(222,240,166,.38)";
    ctx.beginPath();
    ctx.arc(knobX, knobY, 25, 0, TAU);
    ctx.fill();
  };

  const render = () => {
    if (!ctx) return;
    const scaleX = canvas.width / VIEW_W;
    const scaleY = canvas.height / VIEW_H;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(scaleX, 0, 0, scaleY, 0, 0);
    const shakeX = screenShake > 0 ? (Math.random() - 0.5) * screenShake : 0;
    const shakeY = screenShake > 0 ? (Math.random() - 0.5) * screenShake : 0;
    if (terrainCanvas) {
      const sourceX = clamp(camera.x - shakeX, 0, WORLD.width - VIEW_W);
      const sourceY = clamp(camera.y - shakeY, 0, WORLD.height - VIEW_H);
      ctx.drawImage(terrainCanvas, sourceX, sourceY, VIEW_W, VIEW_H, 0, 0, VIEW_W, VIEW_H);
    } else {
      ctx.fillStyle = "#536a3d";
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }
    ctx.save();
    ctx.translate(-camera.x + shakeX, -camera.y + shakeY);
    drawTracks();
    for (const obstacle of obstacles) drawObstacle(obstacle);
    for (const enemy of enemies) drawTank(enemy);
    drawTank(player);
    drawBullets();
    drawEffects();
    ctx.restore();

    if (mouse.active && touches.right.id === null && state === "playing") {
      const sx = mouse.x - camera.x;
      const sy = mouse.y - camera.y;
      ctx.strokeStyle = "rgba(233,246,188,.7)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(sx, sy, 11, 0, TAU);
      ctx.moveTo(sx - 18, sy);
      ctx.lineTo(sx - 6, sy);
      ctx.moveTo(sx + 6, sy);
      ctx.lineTo(sx + 18, sy);
      ctx.moveTo(sx, sy - 18);
      ctx.lineTo(sx, sy - 6);
      ctx.moveTo(sx, sy + 6);
      ctx.lineTo(sx, sy + 18);
      ctx.stroke();
    }

    drawJoystick(touches.left, touches.left.id !== null);
    drawJoystick(touches.right, touches.right.id !== null);

    const vignette = ctx.createRadialGradient(VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.22, VIEW_W / 2, VIEW_H / 2, VIEW_W * 0.67);
    vignette.addColorStop(0, "rgba(7,12,7,0)");
    vignette.addColorStop(1, "rgba(7,12,7,.36)");
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    if (damageFlash > 0) {
      ctx.fillStyle = "rgba(184,46,26," + clamp(damageFlash * 0.28, 0, 0.35) + ")";
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }
  };

  // ---------- HUD 与流程 ----------
  const setText = (id, text) => {
    const element = $(id);
    if (element) element.textContent = text;
  };

  const updateHud = () => {
    if (!player) return;
    const hpPercent = clamp(player.hp / player.maxHp, 0, 1);
    const hpBar = $("hud-hp-bar");
    if (hpBar) hpBar.style.width = (hpPercent * 100).toFixed(1) + "%";
    setText("hud-hp-text", Math.max(0, Math.ceil(player.hp)) + " / " + player.maxHp);
    const remaining = B.enemyTotal - kills;
    setText("hud-enemies", String(Math.max(0, remaining)));
    setText("hud-score", String(score));
    setText("hud-combo", combo > 1 ? "×" + combo : "—");
    setText("hud-ammo", player.reload > 0 ? "装填中" : player.ammo + " / " + B.magazineSize);
    const reloadBar = $("hud-reload-bar");
    if (reloadBar) {
      const progress = player.reload > 0 ? 1 - player.reload / player.reloadDuration : 1;
      reloadBar.style.width = (clamp(progress, 0, 1) * 100).toFixed(1) + "%";
    }
    const turret = $("hud-turret");
    if (turret) {
      const offset = Math.abs(angleDelta(player.angle, player.turretAngle));
      turret.style.transform = "rotate(" + angleDelta(player.angle, player.turretAngle) + "rad)";
      turret.title = "炮塔偏角 " + Math.round(offset * 180 / Math.PI) + "°";
    }
    const syncLabel = $("sync-status");
    if (syncLabel) {
      if (typeof navigator !== "undefined" && navigator.onLine === false) syncLabel.textContent = "离线 · 本机存档";
      else if (Sync && Sync.loggedIn) syncLabel.textContent = "云同步已开启";
      else syncLabel.textContent = "本机存档 · 登录后云同步";
    }
  };

  const updateMenuStats = () => {
    const data = Sync ? Sync.loadLocal() : saveData;
    if (!data) return;
    saveData = data;
    setText("menu-best", String(data.stats.bestScore || 0));
    setText("menu-kills", String(data.stats.totalKills || 0));
    setText("menu-wins", String(data.stats.wins || 0));
  };

  const showToast = (message, duration = 2600) => {
    const toast = $("toast");
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), duration);
  };

  const setOverlay = (id, visible) => {
    const element = $(id);
    if (element) element.classList.toggle("hidden", !visible);
  };

  const showMenu = () => {
    state = "menu";
    keys.clear();
    mouse.firing = false;
    setOverlay("menu", true);
    setOverlay("pause-modal", false);
    setOverlay("result-modal", false);
    updateMenuStats();
    updateHud();
  };

  const startBattle = () => {
    if (locked) {
      setOverlay("time-lock", true);
      return;
    }
    if (window.DaoBox && window.DaoBox.timeExceeded) {
      if (window.DaoBox.showQuotaModal) window.DaoBox.showQuotaModal(window.DaoBox.timeInfo);
      setOverlay("time-lock", true);
      return;
    }
    AudioFx.unlock();
    AudioFx.click();
    resetBattle();
    state = "playing";
    setOverlay("menu", false);
    setOverlay("pause-modal", false);
    setOverlay("result-modal", false);
    setOverlay("time-lock", false);
    lastFrame = performance.now();
  };

  const pauseGame = (automatic = false) => {
    if (state !== "playing" || locked) return;
    state = "paused";
    pausedByVisibility = automatic;
    keys.clear();
    mouse.firing = false;
    setOverlay("pause-modal", true);
    const info = $("pause-info");
    if (info) info.textContent = automatic ? "页面切到后台，战场已冻结。" : "战场已冻结，装填和敌军都会暂停。";
  };

  const resumeGame = () => {
    if (state !== "paused" || locked) return;
    state = "playing";
    pausedByVisibility = false;
    setOverlay("pause-modal", false);
    lastFrame = performance.now();
  };

  const togglePause = () => {
    if (state === "playing") pauseGame(false);
    else if (state === "paused") resumeGame();
  };

  const finishBattle = (won) => {
    if (state !== "playing") return;
    state = "result";
    battleEndedAt = performance.now();
    keys.clear();
    mouse.firing = false;
    const duration = Math.max(1, Math.round((battleEndedAt - battleStartedAt) / 1000));
    const accuracy = shotsFired ? Math.round(shotsHit / shotsFired * 100) : 0;
    const result = {
      won,
      score,
      kills,
      bestCombo: Math.max(combo, 1),
      duration,
      accuracy
    };
    saveData = Sync ? Sync.recordBattle(result) : saveData;
    const title = $("result-title");
    if (title) title.textContent = won ? "战场肃清" : "钢铁折戟";
    const badge = $("result-badge");
    if (badge) {
      badge.textContent = won ? "胜利" : "失败";
      badge.className = "result-badge " + (won ? "win" : "loss");
    }
    const html =
      '<div class="result-stats">' +
        '<div><span>击毁</span><strong>' + kills + " / " + B.enemyTotal + "</strong></div>" +
        '<div><span>战绩</span><strong>' + score + "</strong></div>" +
        '<div><span>最高连击</span><strong>×' + Math.max(combo, 1) + "</strong></div>" +
        '<div><span>命中率</span><strong>' + accuracy + "%</strong></div>" +
        '<div><span>用时</span><strong>' + duration + " 秒</strong></div>" +
      "</div>" +
      '<p class="result-note">' + (won ? "固定炮台已全部清除，装甲、炮线与掩体运用合格。" : "观察固定炮台的射界，用车体正面承伤，再从侧后突破。") + "</p>";
    const body = $("result-body");
    if (body) body.innerHTML = html;
    setOverlay("result-modal", true);
    updateMenuStats();
    if (won) AudioFx.win();
    else AudioFx.lose();
  };

  const applyTimeLock = () => {
    locked = true;
    if (state === "playing") {
      state = "paused";
      setOverlay("pause-modal", false);
    }
    setOverlay("time-lock", true);
  };

  const updateCanvasFrame = () => {
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    const targetWidth = Math.round(rect.width * ratio);
    const targetHeight = Math.round(rect.height * ratio);
    if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
      canvas.width = targetWidth;
      canvas.height = targetHeight;
    }
    const scaleX = targetWidth / VIEW_W;
    const scaleY = targetHeight / VIEW_H;
    ctx.setTransform(scaleX, 0, 0, scaleY, 0, 0);
  };

  const loop = (now) => {
    const rawDt = Math.min(0.04, Math.max(0.001, (now - lastFrame) / 1000));
    lastFrame = now;
    if (state === "playing") {
      const dt = rawDt;
      updatePlayer(dt);
      for (const enemy of enemies) updateEnemy(enemy, dt);
      updateBullets(dt);
      updateEffects(dt);
      if (spawnedEnemies < B.enemyTotal) {
        spawnTimer -= dt;
        if (spawnTimer <= 0 && enemies.length < B.maxActiveEnemies) {
          const spawns = D.cloneSpawns();
          spawnEnemy(spawns[spawnedEnemies % spawns.length]);
          spawnTimer = B.spawnDelay;
        }
      }
      if (player) addTracks(player, dt, "player");
      updateCamera(dt);
      updateHud();
    }
    if (state === "paused" || state === "result" || state === "menu") {
      updateCamera(rawDt);
    }
    updateCanvasFrame();
    render();
    requestAnimationFrame(loop);
  };

  const refreshApp = () => {
    const replace = () => {
      const url = new URL(location.href);
      url.searchParams.set("_t", String(Date.now()));
      location.replace(url.toString());
    };
    if (!("caches" in window)) {
      replace();
      return;
    }
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith("dbtank-")).map((key) => caches.delete(key))))
      .finally(replace);
  };

  const registerSw = () => {
    if (!("serviceWorker" in navigator)) return;
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./service-worker.js?v=3").then((registration) => {
        registration.update().catch(() => {});
        registration.addEventListener("updatefound", () => {
          const installing = registration.installing;
          if (!installing) return;
          installing.addEventListener("statechange", () => {
            if (installing.state === "installed" && navigator.serviceWorker.controller) {
              showToast("🆕 新版本已缓存，点右上角刷新即可进入", 4200);
            }
          });
        });
      }).catch(() => {});
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState !== "visible") return;
        navigator.serviceWorker.getRegistration().then((registration) => {
          if (registration) registration.update().catch(() => {});
        }).catch(() => {});
      });
    });
  };

  const bindInstall = () => {
    const button = $("install-btn");
    window.addEventListener("beforeinstallprompt", (event) => {
      event.preventDefault();
      deferredInstallPrompt = event;
      if (!installDismissed && button) button.classList.remove("hidden");
    });
    window.addEventListener("appinstalled", () => {
      deferredInstallPrompt = null;
      installDismissed = true;
      if (button) button.classList.add("hidden");
      showToast("已安装到桌面");
    });
    if (button) {
      button.addEventListener("click", async () => {
        if (deferredInstallPrompt) {
          deferredInstallPrompt.prompt();
          const choice = await deferredInstallPrompt.userChoice.catch(() => null);
          if (choice && choice.outcome === "accepted") button.classList.add("hidden");
          deferredInstallPrompt = null;
          return;
        }
        const standalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone;
        if (standalone) {
          showToast("当前已经是桌面应用模式");
          return;
        }
        showToast("请在浏览器菜单中选择「添加到主屏幕」", 4200);
      });
    }
  };

  const bindUi = () => {
    $("btn-start")?.addEventListener("click", startBattle);
    $("btn-pause")?.addEventListener("click", () => pauseGame(false));
    $("btn-resume")?.addEventListener("click", resumeGame);
    $("btn-pause-menu")?.addEventListener("click", showMenu);
    $("btn-retry")?.addEventListener("click", startBattle);
    $("btn-result-menu")?.addEventListener("click", showMenu);
    $("btn-refresh")?.addEventListener("click", refreshApp);
    $("btn-mute")?.addEventListener("click", () => {
      muted = !muted;
      const label = muted ? "🔇" : "🔊";
      setText("btn-mute", label);
      saveData = Sync ? Sync.updateSettings({ muted }) : saveData;
      if (!muted) AudioFx.unlock();
      showToast(muted ? "声音已关闭" : "声音已开启", 1500);
    });
    $("btn-lock-close")?.addEventListener("click", () => setOverlay("time-lock", false));
    $("rotate-hint-close")?.addEventListener("click", () => {
      const hint = $("rotate-hint");
      if (hint) hint.hidden = true;
    });
    window.addEventListener("daobox:timeexceeded", applyTimeLock);
    window.addEventListener("daobox:timeupdate", (event) => {
      if (event.detail && event.detail.exceeded) applyTimeLock();
    });
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden" && state === "playing") {
        pauseGame(true);
      }
    });
  };

  const init = () => {
    canvas = $("game");
    if (!canvas) return;
    ctx = canvas.getContext("2d");
    canvas.width = VIEW_W;
    canvas.height = VIEW_H;
    buildTerrain();
    bindInput();
    bindUi();
    bindInstall();
    registerSw();
    setText("app-version", APP_VERSION);
    setText("btn-mute", muted ? "🔇" : "🔊");
    updateCanvasFrame();
    resetBattle();
    state = "menu";
    updateCanvasFrame();
    render();
    updateMenuStats();
    if (Sync) {
      Sync.init({
        dbHome: window.DB_HOME || "https://daobox.app",
        onChange: (next) => {
          saveData = next;
          updateMenuStats();
          updateHud();
        }
      }).then(() => Sync.syncNow("ui-ready")).catch(() => {});
    }
    const hint = $("rotate-hint");
    if (hint && sessionStorage.getItem("dbtank-rotate-hidden") === "1") hint.hidden = true;
    $("rotate-hint-close")?.addEventListener("click", () => {
      try {
        sessionStorage.setItem("dbtank-rotate-hidden", "1");
      } catch (e) {}
    });
    requestAnimationFrame(loop);
  };

  window.__tankTest = {
    get state() {
      return state;
    },
    getSnapshot: () => ({
      state,
      locked,
      player: player ? {
        x: player.x,
        y: player.y,
        angle: player.angle,
        turretAngle: player.turretAngle,
        hp: player.hp,
        ammo: player.ammo,
        reload: player.reload
      } : null,
      enemies: enemies.map((enemy) => ({
        id: enemy.id,
        x: enemy.x,
        y: enemy.y,
        hp: enemy.hp,
        angle: enemy.angle,
        turretAngle: enemy.turretAngle,
        ammo: enemy.ammo,
        reload: enemy.reload,
        shotsFired: enemy.shotsFired,
        fixed: enemy.fixed
      })),
      bullets: bullets.length,
      tracks: tracks.map((track) => ({ owner: track.owner })),
      kills,
      score,
      obstacles: obstacles.map((obstacle) => ({ type: obstacle.type, hp: obstacle.hp, destroyed: obstacle.destroyed }))
    }),
    startBattle,
    pauseGame,
    resumeGame,
    finishBattle,
    armorProfile,
    spawnEnemyAt: (x, y) => {
      const before = nextEnemyId;
      spawnEnemy({ x, y });
      return enemies.find((enemy) => enemy.id === "enemy-" + before) || null;
    },
    setPlayerPosition: (x, y) => {
      if (!player || !tankAtPositionFree(player, x, y)) return false;
      player.x = x;
      player.y = y;
      return true;
    },
    setPlayerHp: (hp) => {
      if (!player) return;
      player.maxHp = Math.max(1, Number(hp) || 1);
      player.hp = player.maxHp;
    },
    aimAt: (x, y) => {
      if (player) player.turretAngle = Math.atan2(y - player.y, x - player.x);
    },
    fire: () => player && tryFire(player),
    damageFirstEnemy: (zoneAngle) => {
      if (!enemies[0]) return;
      bullets.push({
        x: enemies[0].x,
        y: enemies[0].y,
        vx: Math.cos(zoneAngle) * B.bulletSpeed,
        vy: Math.sin(zoneAngle) * B.bulletSpeed,
        owner: player,
        isPlayer: true,
        damage: B.playerDamage,
        alive: false
      });
      const fake = bullets[bullets.length - 1];
      damageTank(enemies[0], { ...fake, x: enemies[0].x, y: enemies[0].y });
      bullets.pop();
    },
    destroyFirstObstacle: () => {
      const target = obstacles.find((obstacle) => obstacle.hp !== null);
      if (!target) return;
      damageObstacle(target, {
        x: target.x + target.w / 2,
        y: target.y + target.h / 2,
        damage: 999
      });
    },
    eliminateAllEnemies: () => {
      if (player) {
        player.hp = 9999;
        player.maxHp = 9999;
      }
      bullets = bullets.filter((bullet) => bullet.isPlayer);
      while (spawnedEnemies < B.enemyTotal) {
        const spawns = D.cloneSpawns();
        spawnEnemy(spawns[spawnedEnemies % spawns.length]);
      }
      while (enemies.length) {
        const target = enemies[0];
        damageTank(target, {
          x: target.x,
          y: target.y,
          vx: Math.cos(target.angle) * B.bulletSpeed,
          vy: Math.sin(target.angle) * B.bulletSpeed,
          owner: player,
          isPlayer: true,
          damage: 999
        });
      }
    }
  };

  document.addEventListener("DOMContentLoaded", init);
})();

