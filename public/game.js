"use strict";

(() => {
  const D = window.TankData;
  const Sync = window.TankSync;
  const B = D.BATTLE;
  const WORLD = D.WORLD;
  const TANK_TYPES = D.TANKS;
  const VIEW_W = 1280;
  const VIEW_H = 720;
  const APP_VERSION = "v0.2.0";
  const FOV = 1.72;
  const HALF_FOV = FOV / 2;
  const FOCAL = (VIEW_W / 2) / Math.tan(HALF_FOV);
  const EYE_HEIGHT = 44;
  const PITCH_LIMIT = 0.2;
  const $ = (id) => document.getElementById(id);
  const TAU = Math.PI * 2;
  const COARSE_POINTER = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
  const MOUSE_SENSITIVITY = 0.00225;
  const STICK_LOOK_SPEED = 2.35;

  let canvas = null;
  let ctx = null;
  let state = "menu";
  let player = null;
  let enemies = [];
  let bullets = [];
  let obstacles = [];
  let particles = [];
  let floats = [];
  let rings = [];
  let nextEnemyId = 1;
  let kills = 0;
  let score = 0;
  let combo = 0;
  let comboTime = 0;
  let battleStartedAt = 0;
  let battleEndedAt = 0;
  let shotsFired = 0;
  let shotsHit = 0;
  let lastFrame = performance.now();
  let locked = false;
  let screenShake = 0;
  let damageFlash = 0;
  let hitMarker = 0;
  let toastTimer = 0;
  let deferredInstallPrompt = null;
  let installDismissed = false;
  let saveData = Sync ? Sync.loadLocal() : null;
  let muted = !!(saveData && saveData.settings && saveData.settings.muted);
  let fireHeld = false;
  let mouseDragging = false;
  let lastPointerX = 0;
  let lastPointerY = 0;
  const keys = new Set();
  const touches = {
    left: { id: null, baseX: 0, baseY: 0, x: 0, y: 0, dx: 0, dy: 0, mag: 0 },
    right: { id: null, baseX: 0, baseY: 0, x: 0, y: 0, dx: 0, dy: 0, mag: 0 }
  };

  // ---------- 工具 ----------
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const lerp = (a, b, t) => a + (b - a) * t;
  const normalizeAngle = (angle) => {
    while (angle > Math.PI) angle -= TAU;
    while (angle < -Math.PI) angle += TAU;
    return angle;
  };
  const angleDelta = (from, to) => normalizeAngle(to - from);
  const rotateToward = (current, target, maxStep) => {
    const delta = angleDelta(current, target);
    if (Math.abs(delta) <= maxStep) return target;
    return normalizeAngle(current + Math.sign(delta) * maxStep);
  };
  const approach = (value, target, step) => {
    if (value < target) return Math.min(value + step, target);
    if (value > target) return Math.max(value - step, target);
    return target;
  };
  const distanceBetween = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const compassDegrees = (angle) => (angle * 180 / Math.PI + 90 + 360) % 360;
  const compassText = (angle) => String(Math.round(compassDegrees(angle)) % 360).padStart(3, "0") + "°";
  const relativeDegrees = (angle) => {
    let degrees = normalizeAngle(angle) * 180 / Math.PI;
    if (degrees < -180) degrees += 360;
    if (degrees > 180) degrees -= 360;
    return degrees;
  };
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

  // ---------- 2.5D 投影 ----------
  const horizonY = () => VIEW_H * 0.5 + Math.tan(player ? player.pitch : 0) * FOCAL;

  const projectWorld = (x, y, z = 0) => {
    if (!player) return null;
    const dx = x - player.x;
    const dy = y - player.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 1) return null;
    const bearing = Math.atan2(dy, dx);
    const relative = angleDelta(player.turretAngle, bearing);
    const forward = dist * Math.cos(relative);
    if (forward <= 4 || Math.abs(relative) > HALF_FOV + 0.035) return null;
    const scale = FOCAL / forward;
    const screenX = VIEW_W / 2 + Math.tan(relative) * FOCAL;
    const groundY = horizonY() + EYE_HEIGHT * scale;
    const screenY = groundY - z * scale;
    return {
      x: screenX,
      y: screenY,
      groundY,
      depth: forward,
      distance: dist,
      scale,
      bearing,
      relative
    };
  };

  const projectedEnemy = (enemy) => {
    const projection = projectWorld(enemy.x, enemy.y, 0);
    if (!projection) return null;
    const width = Math.max(12, enemy.type.hullWidth * 1.55 * projection.scale);
    const height = Math.max(12, 70 * projection.scale);
    return { ...projection, width, height };
  };

  const visibleEnemies = () => enemies.filter((enemy) => {
    const p = projectedEnemy(enemy);
    return p && p.x + p.width / 2 > 0 && p.x - p.width / 2 < VIEW_W;
  });

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
        noise(isPlayer ? 0.19 : 0.13, isPlayer ? 0.38 : 0.2, isPlayer ? 1500 : 980);
        tone(isPlayer ? 220 : 155, 48, 0.22, "square", isPlayer ? 0.2 : 0.12);
        tone(100, 40, 0.3, "triangle", 0.11);
      },
      empty: () => tone(760, 520, 0.06, "square", 0.06),
      reload: () => {
        tone(360, 300, 0.04, "square", 0.05);
        setTimeout(() => tone(460, 390, 0.04, "square", 0.05), 190);
      },
      hit: (zone) => {
        const strong = zone === "rear" ? 1 : 0;
        noise(0.14, 0.22 + strong * 0.08, 1900);
        tone(zone === "rear" ? 180 : 260, 70, 0.22, "square", 0.17);
        if (strong) tone(95, 45, 0.36, "triangle", 0.16);
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

  // ---------- 碰撞 ----------
  const circleRectIntersects = (x, y, radius, rect) => {
    const nx = clamp(x, rect.x, rect.x + rect.w);
    const ny = clamp(y, rect.y, rect.y + rect.h);
    return (x - nx) * (x - nx) + (y - ny) * (y - ny) <= radius * radius;
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
    for (const [origin, direction, min, max] of axes) {
      if (Math.abs(direction) < 0.00001) {
        if (origin < min || origin > max) return null;
        continue;
      }
      let t1 = (min - origin) / direction;
      let t2 = (max - origin) / direction;
      if (t1 > t2) [t1, t2] = [t2, t1];
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return null;
    }
    return tmin;
  };

  const segmentCircleHit = (x1, y1, x2, y2, cx, cy, radius) => {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const fx = x1 - cx;
    const fy = y1 - cy;
    const a = dx * dx + dy * dy;
    if (a < 0.000001) return null;
    const b = 2 * (fx * dx + fy * dy);
    const c = fx * fx + fy * fy - radius * radius;
    const discriminant = b * b - 4 * a * c;
    if (discriminant < 0) return null;
    const root = Math.sqrt(discriminant);
    const t1 = (-b - root) / (2 * a);
    const t2 = (-b + root) / (2 * a);
    if (t1 >= 0 && t1 <= 1) return t1;
    if (t2 >= 0 && t2 <= 1) return t2;
    return null;
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
      if (Math.hypot(x - other.x, y - other.y) < (tank.radius + other.radius) * 0.84) return false;
    }
    return true;
  };

  const movePlayer = (dx, dy) => {
    if (!player) return false;
    if (tankAtPositionFree(player, player.x + dx, player.y + dy)) {
      player.x += dx;
      player.y += dy;
      return true;
    }
    if (Math.abs(dx) > Math.abs(dy) && tankAtPositionFree(player, player.x + dx, player.y)) {
      player.x += dx;
      return true;
    }
    if (tankAtPositionFree(player, player.x, player.y + dy)) {
      player.y += dy;
      return true;
    }
    player.speed *= 0.25;
    return false;
  };

  // ---------- 实体 ----------
  const makePlayer = (spawn) => ({
    type: TANK_TYPES.type99a,
    isPlayer: true,
    x: spawn.x,
    y: spawn.y,
    angle: spawn.angle,
    turretAngle: spawn.angle,
    pitch: 0,
    speed: 0,
    fireCooldown: 0,
    reload: 0,
    reloadDuration: B.playerReload,
    ammo: B.magazineSize,
    shotsFired: 0,
    hp: B.playerHp,
    maxHp: B.playerHp,
    radius: TANK_TYPES.type99a.radius,
    alive: true,
    recoil: 0,
    hitFlash: 0
  });

  const makeEnemy = (spawn, slot) => ({
    type: TANK_TYPES.tiger,
    isPlayer: false,
    fixed: true,
    id: "enemy-" + nextEnemyId++,
    slot,
    x: spawn.x,
    y: spawn.y,
    angle: Math.atan2(WORLD.height / 2 - spawn.y, WORLD.width / 2 - spawn.x),
    turretAngle: 0,
    targetAim: 0,
    aimBias: (Math.random() - 0.5) * B.enemyAimBias,
    fireCooldown: 0,
    reload: 0.75 + slot * 0.16 + Math.random() * 0.28,
    reloadDuration: B.enemyReload,
    ammo: B.magazineSize,
    shotsFired: 0,
    hp: B.enemyHp,
    maxHp: B.enemyHp,
    radius: TANK_TYPES.tiger.radius,
    alive: true,
    recoil: 0,
    hitFlash: 0
  });

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
    nextEnemyId = 1;
    kills = 0;
    score = 0;
    combo = 0;
    comboTime = 0;
    shotsFired = 0;
    shotsHit = 0;
    screenShake = 0;
    damageFlash = 0;
    hitMarker = 0;
    battleEndedAt = 0;
    battleStartedAt = performance.now();
    player = makePlayer(WORLD.playerSpawn);
    const spawns = D.cloneSpawns();
    for (let i = 0; i < B.enemyTotal; i += 1) {
      const enemy = makeEnemy(spawns[i], i);
      enemy.turretAngle = enemy.angle;
      enemy.targetAim = enemy.angle;
      enemies.push(enemy);
    }
    updateMenuStats();
    updateHud();
  };

  // ---------- 特效 ----------
  const addFloat = (x, y, text, color, size = 18) => {
    floats.push({ x, y, z: 46, text, color, size, life: 1.15, maxLife: 1.15 });
  };

  const addRing = (x, y, maxRadius, color, duration = 0.45) => {
    rings.push({ x, y, radius: 7, maxRadius, color, life: duration, maxLife: duration });
  };

  const addBurst = (x, y, color, count, power) => {
    for (let i = 0; i < count; i += 1) {
      const angle = Math.random() * TAU;
      const speed = power * (0.25 + Math.random() * 0.85);
      particles.push({
        x,
        y,
        z: 18 + Math.random() * 48,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        vz: 28 + Math.random() * 100,
        life: 0.3 + Math.random() * 0.65,
        maxLife: 0.95,
        size: 2 + Math.random() * 6,
        color,
        drag: 0.94
      });
    }
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

  // ---------- 发射与伤害 ----------
  const startReload = (tank) => {
    if (!tank || !tank.alive || tank.reload > 0 || tank.ammo >= B.magazineSize) return;
    tank.reload = tank.reloadDuration;
    if (tank.isPlayer) AudioFx.reload();
  };

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

  const tryFire = (tank, forcedAngle = null) => {
    if (!tank || !tank.alive || tank.fireCooldown > 0 || tank.reload > 0) return false;
    if (tank.ammo <= 0) {
      if (tank.isPlayer) AudioFx.empty();
      startReload(tank);
      return false;
    }
    const shotAngle = forcedAngle === null ? tank.turretAngle : forcedAngle;
    const muzzleDistance = tank.type.hullLength * 0.22 + tank.type.barrelLength - tank.recoil;
    const x = tank.x + Math.cos(shotAngle) * muzzleDistance;
    const y = tank.y + Math.sin(shotAngle) * muzzleDistance;
    bullets.push({
      x,
      y,
      px: x,
      py: y,
      vx: Math.cos(shotAngle) * B.bulletSpeed,
      vy: Math.sin(shotAngle) * B.bulletSpeed,
      owner: tank,
      isPlayer: tank.isPlayer,
      damage: tank.isPlayer ? B.playerDamage : B.enemyDamage,
      alive: true,
      life: 2.4
    });
    tank.ammo -= 1;
    tank.shotsFired += 1;
    tank.fireCooldown = B.fireCooldown;
    tank.recoil = 7;
    if (tank.ammo <= 0) tank.reload = tank.reloadDuration;
    if (tank.isPlayer) {
      shotsFired += 1;
      screenShake = Math.max(screenShake, 2);
    }
    AudioFx.shoot(tank.isPlayer);
    addBurst(x, y, tank.isPlayer ? "#ffe58a" : "#ffb15d", 8, 100);
    return true;
  };

  const damageObstacle = (obstacle, bullet) => {
    if (!obstacle || obstacle.destroyed) return;
    if (obstacle.hp === null) {
      addBurst(bullet.x, bullet.y, "#f6d58b", 9, 100);
      AudioFx.hit("front");
      return;
    }
    obstacle.hp -= bullet.damage;
    obstacle.hitFlash = 1;
    addBurst(bullet.x, bullet.y, D.OBSTACLE_TYPES[obstacle.type].edge, 12, 120);
    if (obstacle.hp <= 0) {
      obstacle.destroyed = true;
      addBurst(obstacle.x + obstacle.w / 2, obstacle.y + obstacle.h / 2, "#b57b43", 36, 190);
      addRing(obstacle.x + obstacle.w / 2, obstacle.y + obstacle.h / 2, 60, "rgba(221,179,105,.7)");
      addFloat(obstacle.x + obstacle.w / 2, obstacle.y, "掩体摧毁", "#ffd178", 17);
      screenShake = Math.max(screenShake, 5);
      AudioFx.breakCover();
    } else {
      AudioFx.hit("side");
    }
  };

  const addWreck = (tank) => {
    const meta = D.OBSTACLE_TYPES.wreck;
    obstacles.push({
      x: tank.x - 32,
      y: tank.y - 38,
      w: 64,
      h: 76,
      type: "wreck",
      id: "wreck-" + Math.random().toString(36).slice(2),
      hp: null,
      maxHp: null,
      destroyed: false,
      blocks: true,
      hitFlash: 0,
      meta
    });
  };

  const destroyTank = (tank) => {
    if (!tank || !tank.alive) return;
    tank.alive = false;
    addWreck(tank);
    addBurst(tank.x, tank.y, "#ffb347", 50, 280);
    addBurst(tank.x, tank.y, "#333a31", 28, 150);
    addRing(tank.x, tank.y, 100, "rgba(255,183,86,.8)", 0.7);
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
    addFloat(tank.x, tank.y, "+" + points + (combo > 1 ? "  ×" + combo : ""), "#f7e59a", 22);
    if (kills >= B.enemyTotal && enemies.length === 0) {
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
      addBurst(bullet.x, bullet.y, "#fff2b2", 16, 160);
      addRing(bullet.x, bullet.y, 44, "rgba(255,239,176,.75)", 0.38);
      addFloat(target.x, target.y, "跳弹", "#fff0a6", 20);
      AudioFx.ricochet();
      target.hitFlash = 0.8;
      if (bullet.isPlayer) hitMarker = 0.22;
      return;
    }
    const damage = Math.round(bullet.damage * armor.multiplier);
    target.hp = Math.max(0, target.hp - damage);
    target.hitFlash = 1;
    if (bullet.isPlayer) {
      shotsHit += 1;
      hitMarker = 0.3;
    }
    if (target.isPlayer) damageFlash = Math.max(damageFlash, 0.7);
    addBurst(bullet.x, bullet.y, armor.color, 15, 160);
    addFloat(target.x, target.y, armor.label + " -" + damage, armor.color, 18);
    screenShake = Math.max(screenShake, target.isPlayer ? 8 : 4);
    AudioFx.hit(armor.zone);
    if (target.hp <= 0) destroyTank(target);
  };

  // ---------- 更新 ----------
  const updatePlayer = (dt) => {
    if (!player || !player.alive) return;
    let throttle = 0;
    let steer = 0;
    if (touches.left.id !== null) {
      throttle = -touches.left.dy;
      steer = touches.left.dx;
    } else {
      if (keys.has("w") || keys.has("arrowup")) throttle += 1;
      if (keys.has("s") || keys.has("arrowdown")) throttle -= 1;
      if (keys.has("d") || keys.has("arrowright")) steer += 1;
      if (keys.has("a") || keys.has("arrowleft")) steer -= 1;
    }
    if (touches.right.id !== null) {
      player.turretAngle = normalizeAngle(player.turretAngle + touches.right.dx * STICK_LOOK_SPEED * dt);
      player.pitch = clamp(player.pitch - touches.right.dy * 0.72 * dt, -PITCH_LIMIT, PITCH_LIMIT);
    }

    const targetSpeed = throttle * (throttle >= 0 ? player.type.maxForward : player.type.maxReverse);
    player.speed = approach(
      player.speed,
      targetSpeed,
      (throttle !== 0 ? player.type.acceleration : player.type.brake) * dt
    );
    const turnSpeed = player.type.hullTurnRate * (0.58 + 0.42 * clamp(Math.abs(player.speed) / 70, 0, 1));
    player.angle = normalizeAngle(player.angle + steer * turnSpeed * dt);
    movePlayer(Math.cos(player.angle) * player.speed * dt, Math.sin(player.angle) * player.speed * dt);
    updateWeaponTimers(player, dt);
    if (fireHeld) firePlayer();
  };

  const updateEnemy = (enemy, dt) => {
    if (!enemy || !enemy.alive || !player || !player.alive) return;
    const targetAngle = Math.atan2(player.y - enemy.y, player.x - enemy.x);
    enemy.targetAim = targetAngle + enemy.aimBias;
    enemy.turretAngle = rotateToward(enemy.turretAngle, enemy.targetAim, enemy.type.turretTurnRate * dt);
    updateWeaponTimers(enemy, dt);
    const dist = distanceBetween(enemy, player);
    // 命中由真实弹道与掩体碰撞决定，不额外做“是否看得见玩家”的开火筛选。
    if (dist <= B.enemyRange && Math.abs(angleDelta(enemy.turretAngle, targetAngle)) < 0.055) {
      tryFire(enemy);
    }
  };

  const updateBullets = (dt) => {
    for (const bullet of bullets) {
      if (!bullet.alive) continue;
      bullet.life -= dt;
      if (bullet.life <= 0) {
        bullet.alive = false;
        continue;
      }
      bullet.px = bullet.x;
      bullet.py = bullet.y;
      bullet.x += bullet.vx * dt;
      bullet.y += bullet.vy * dt;
      if (bullet.x < -20 || bullet.y < -20 || bullet.x > WORLD.width + 20 || bullet.y > WORLD.height + 20) {
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
      for (const tank of [player, ...enemies]) {
        if (!tank || !tank.alive || tank === bullet.owner) continue;
        const t = segmentCircleHit(bullet.px, bullet.py, bullet.x, bullet.y, tank.x, tank.y, tank.radius);
        if (t !== null && t < nearestT) {
          nearestT = t;
          hitType = bullet.owner && bullet.owner.isPlayer === tank.isPlayer ? "friendly-tank" : "tank";
          hitTarget = tank;
        }
      }
      if (hitType) {
        bullet.x = lerp(bullet.px, bullet.x, nearestT);
        bullet.y = lerp(bullet.py, bullet.y, nearestT);
        bullet.alive = false;
        if (hitType === "obstacle") damageObstacle(hitTarget, bullet);
        else if (hitType === "tank") damageTank(hitTarget, bullet);
        else {
          addBurst(bullet.x, bullet.y, "#d9d0ad", 8, 90);
          AudioFx.hit("front");
        }
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
      particle.vz -= 170 * dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.z = Math.max(1, particle.z + particle.vz * dt);
    }
    particles = particles.filter((particle) => particle.life > 0);
    for (const item of floats) {
      item.life -= dt;
      item.z += 18 * dt;
    }
    floats = floats.filter((item) => item.life > 0);
    for (const ring of rings) {
      ring.life -= dt;
      ring.radius = lerp(7, ring.maxRadius, 1 - ring.life / ring.maxLife);
    }
    rings = rings.filter((ring) => ring.life > 0);
    for (const obstacle of obstacles) obstacle.hitFlash = Math.max(0, obstacle.hitFlash - dt * 3.5);
    screenShake = Math.max(0, screenShake - dt * 28);
    damageFlash = Math.max(0, damageFlash - dt * 2);
    hitMarker = Math.max(0, hitMarker - dt * 3);
    if (comboTime > 0) {
      comboTime = Math.max(0, comboTime - dt);
      if (comboTime === 0) combo = 0;
    }
  };

  // ---------- 瞄准 ----------
  const enemyScreenBox = (enemy) => {
    const p = projectedEnemy(enemy);
    if (!p) return null;
    return {
      x1: p.x - p.width / 2,
      x2: p.x + p.width / 2,
      y1: p.y - p.height,
      y2: p.y,
      projection: p
    };
  };

  const aimedEnemy = () => {
    const aimX = VIEW_W / 2;
    const aimY = VIEW_H / 2;
    let best = null;
    for (const enemy of enemies) {
      const box = enemyScreenBox(enemy);
      if (!box) continue;
      if (aimX >= box.x1 - 10 && aimX <= box.x2 + 10 && aimY >= box.y1 - 12 && aimY <= box.y2 + 12) {
        if (!best || box.projection.distance < best.box.projection.distance) best = { enemy, box };
      }
    }
    return best;
  };

  const firePlayer = () => {
    if (!player || state !== "playing" || locked) return false;
    const target = aimedEnemy();
    const angle = target
      ? Math.atan2(target.enemy.y - player.y, target.enemy.x - player.x)
      : player.turretAngle;
    return tryFire(player, angle);
  };

  // ---------- 输入 ----------
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

  const beginStick = (side, event) => {
    const rect = canvas.getBoundingClientRect();
    const sx = (event.clientX - rect.left) / rect.width * VIEW_W;
    const sy = (event.clientY - rect.top) / rect.height * VIEW_H;
    const stick = touches[side];
    const centerX = side === "left" ? 176 : VIEW_W - 176;
    const centerY = VIEW_H - 118;
    const nearDefault = Math.hypot(sx - centerX, sy - centerY) < 120;
    stick.id = event.pointerId;
    stick.baseX = nearDefault ? centerX : sx;
    stick.baseY = nearDefault ? centerY : sy;
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
      if (event.pointerType === "mouse" || event.pointerType === "pen") {
        lastPointerX = event.clientX;
        lastPointerY = event.clientY;
        mouseDragging = true;
        if (event.button === 0) {
          fireHeld = true;
          firePlayer();
        }
        if (event.pointerType === "mouse" && document.pointerLockElement !== canvas) {
          const pending = canvas.requestPointerLock && canvas.requestPointerLock();
          if (pending && pending.catch) pending.catch(() => {});
        }
        event.preventDefault();
        return;
      }
      event.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width * VIEW_W;
      beginStick(x < VIEW_W / 2 ? "left" : "right", event);
    }, { passive: false });

    canvas.addEventListener("pointermove", (event) => {
      if (event.pointerType === "touch") {
        if (touches.left.id === event.pointerId) updateStick(touches.left, event);
        if (touches.right.id === event.pointerId) updateStick(touches.right, event);
        return;
      }
      if (state !== "playing") return;
      if (document.pointerLockElement === canvas) {
        player.turretAngle = normalizeAngle(player.turretAngle + event.movementX * MOUSE_SENSITIVITY);
        player.pitch = clamp(player.pitch - event.movementY * MOUSE_SENSITIVITY * 0.72, -PITCH_LIMIT, PITCH_LIMIT);
      } else if (mouseDragging) {
        const dx = event.clientX - lastPointerX;
        const dy = event.clientY - lastPointerY;
        player.turretAngle = normalizeAngle(player.turretAngle + dx * MOUSE_SENSITIVITY);
        player.pitch = clamp(player.pitch - dy * MOUSE_SENSITIVITY * 0.72, -PITCH_LIMIT, PITCH_LIMIT);
        lastPointerX = event.clientX;
        lastPointerY = event.clientY;
      }
    }, { passive: false });

    const endPointer = (event) => {
      if (event.pointerType === "mouse" || event.pointerType === "pen") {
        mouseDragging = false;
        if (event.type === "pointerup" || event.type === "pointercancel") fireHeld = false;
      }
      for (const side of ["left", "right"]) {
        const stick = touches[side];
        if (stick.id === event.pointerId) {
          stick.id = null;
          stick.dx = 0;
          stick.dy = 0;
          stick.mag = 0;
        }
      }
    };
    canvas.addEventListener("pointerup", endPointer);
    canvas.addEventListener("pointercancel", endPointer);
    window.addEventListener("pointerup", () => {
      mouseDragging = false;
      fireHeld = false;
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
      if (key === " " && state === "playing" && !locked) firePlayer();
      if (key === "escape" && (state === "playing" || state === "paused")) togglePause();
    });
    window.addEventListener("keyup", (event) => {
      keys.delete(event.key.toLowerCase());
    });
    window.addEventListener("blur", () => {
      keys.clear();
      fireHeld = false;
      mouseDragging = false;
      if (state === "playing") pauseGame(true);
    });
    window.addEventListener("resize", updateCanvasFrame);
  };

  // ---------- 场景绘制 ----------
  const drawBackdrop = () => {
    const horizon = horizonY();
    const sky = ctx.createLinearGradient(0, 0, 0, Math.max(1, horizon));
    sky.addColorStop(0, "#8ba7b3");
    sky.addColorStop(0.62, "#c8c7ad");
    sky.addColorStop(1, "#e4cf9f");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, VIEW_W, Math.max(0, horizon));

    const ground = ctx.createLinearGradient(0, horizon, 0, VIEW_H);
    ground.addColorStop(0, "#7b844c");
    ground.addColorStop(0.35, "#596a3c");
    ground.addColorStop(1, "#2d4028");
    ctx.fillStyle = ground;
    ctx.fillRect(0, Math.max(0, horizon), VIEW_W, VIEW_H - Math.max(0, horizon));

    for (let i = 0; i < 24; i += 1) {
      const angle = i / 24 * TAU;
      const relative = angleDelta(player.turretAngle, angle);
      if (Math.abs(relative) > HALF_FOV + 0.2) continue;
      const x = VIEW_W / 2 + Math.tan(relative) * FOCAL;
      const width = 65 + (i % 5) * 16;
      const height = 25 + (i % 4) * 12;
      ctx.fillStyle = "rgba(47,63,42,.42)";
      ctx.beginPath();
      ctx.moveTo(x - width / 2, horizon + 2);
      ctx.lineTo(x, horizon - height);
      ctx.lineTo(x + width / 2, horizon + 2);
      ctx.fill();
    }

    ctx.strokeStyle = "rgba(224,215,165,.2)";
    ctx.lineWidth = 1;
    for (let i = -8; i <= 8; i += 1) {
      ctx.beginPath();
      ctx.moveTo(VIEW_W / 2 + i * 18, horizon);
      ctx.lineTo(VIEW_W / 2 + i * 120, VIEW_H);
      ctx.stroke();
    }
    for (let i = 1; i <= 7; i += 1) {
      const y = horizon + Math.pow(i / 7, 1.8) * (VIEW_H - horizon);
      ctx.strokeStyle = "rgba(227,218,170," + (0.05 + i * 0.015) + ")";
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(VIEW_W, y);
      ctx.stroke();
    }
  };

  const drawObstacle = (obstacle, projection) => {
    const meta = D.OBSTACLE_TYPES[obstacle.type];
    const width = clamp(Math.max(obstacle.w, obstacle.h) * projection.scale, 12, VIEW_W * 1.4);
    const height = clamp(meta.height * projection.scale, 8, VIEW_H * 1.6);
    const x = projection.x - width / 2;
    const y = projection.groundY - height;
    ctx.save();
    ctx.shadowColor = "rgba(10,15,9,.35)";
    ctx.shadowBlur = 10 * projection.scale;
    ctx.fillStyle = obstacle.hitFlash > 0 ? "#efe5b3" : meta.fill;
    roundedRect(x, y, width, height, obstacle.type === "sandbag" ? 6 : 3);
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.strokeStyle = meta.edge;
    ctx.lineWidth = Math.max(1, 2 * projection.scale);
    ctx.stroke();
    if (obstacle.type === "wood") {
      ctx.strokeStyle = meta.pattern;
      ctx.lineWidth = Math.max(1, 3 * projection.scale);
      for (let i = 1; i <= 4; i += 1) {
        const yy = y + height * i / 5;
        ctx.beginPath();
        ctx.moveTo(x + 2, yy);
        ctx.lineTo(x + width - 2, yy);
        ctx.stroke();
      }
    } else if (obstacle.type === "sandbag") {
      ctx.strokeStyle = meta.pattern;
      ctx.lineWidth = Math.max(1, 2 * projection.scale);
      const cols = Math.max(2, Math.floor(width / (26 * projection.scale + 8)));
      const rows = Math.max(1, Math.floor(height / (20 * projection.scale + 6)));
      for (let row = 0; row < rows; row += 1) {
        for (let col = 0; col < cols; col += 1) {
          const bx = x + 3 + col * width / cols;
          const by = y + 3 + row * height / rows;
          roundedRect(bx, by, width / cols - 4, height / rows - 4, 5);
          ctx.stroke();
        }
      }
    } else if (obstacle.type === "concrete") {
      ctx.strokeStyle = meta.pattern;
      ctx.lineWidth = Math.max(1, 2 * projection.scale);
      ctx.beginPath();
      ctx.moveTo(x + width * 0.25, y);
      ctx.lineTo(x + width * 0.38, y + height * 0.45);
      ctx.lineTo(x + width * 0.3, y + height);
      ctx.moveTo(x + width * 0.72, y);
      ctx.lineTo(x + width * 0.62, y + height * 0.55);
      ctx.stroke();
    } else if (obstacle.type === "wreck") {
      ctx.fillStyle = meta.pattern;
      roundedRect(x + width * 0.12, y + height * 0.22, width * 0.76, height * 0.58, 8);
      ctx.fill();
      ctx.strokeStyle = "#76543a";
      ctx.lineWidth = Math.max(2, 7 * projection.scale);
      ctx.beginPath();
      ctx.moveTo(projection.x, projection.groundY - height * 0.55);
      ctx.lineTo(projection.x + width * 0.42, projection.groundY - height * 0.65);
      ctx.stroke();
    }
    if (obstacle.hp !== null && obstacle.maxHp && obstacle.hp < obstacle.maxHp) {
      const p = clamp(obstacle.hp / obstacle.maxHp, 0, 1);
      ctx.fillStyle = "rgba(16,20,13,.72)";
      ctx.fillRect(x, y - 8, width, 5);
      ctx.fillStyle = p > 0.45 ? "#d4b66a" : "#d56b4d";
      ctx.fillRect(x, y - 8, width * p, 5);
    }
    ctx.restore();
  };

  const drawEnemy = (enemy, projection) => {
    const scale = projection.scale;
    const width = clamp(enemy.type.hullWidth * 1.65 * scale, 12, VIEW_W);
    const height = clamp(70 * scale, 10, VIEW_H);
    const cx = projection.x;
    const baseY = projection.groundY;
    const top = baseY - height;
    ctx.save();
    ctx.globalAlpha = clamp(1.4 - projection.depth / 2100, 0.46, 1);
    ctx.fillStyle = "rgba(16,22,13,.38)";
    ctx.beginPath();
    ctx.ellipse(cx, baseY + height * 0.05, width * 0.58, height * 0.14, 0, 0, TAU);
    ctx.fill();

    const colors = enemy.type.colors;
    ctx.fillStyle = colors.track;
    roundedRect(cx - width * 0.56, baseY - height * 0.33, width * 0.16, height * 0.35, 3);
    ctx.fill();
    roundedRect(cx + width * 0.4, baseY - height * 0.33, width * 0.16, height * 0.35, 3);
    ctx.fill();
    ctx.fillStyle = enemy.hitFlash > 0 ? "#f6e4ae" : colors.body;
    ctx.beginPath();
    ctx.moveTo(cx - width * 0.42, baseY - height * 0.14);
    ctx.lineTo(cx - width * 0.3, top + height * 0.35);
    ctx.lineTo(cx + width * 0.3, top + height * 0.35);
    ctx.lineTo(cx + width * 0.42, baseY - height * 0.14);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = colors.bodyDark;
    ctx.lineWidth = Math.max(1, scale * 2.2);
    ctx.stroke();
    ctx.fillStyle = colors.bodyLight;
    ctx.beginPath();
    ctx.ellipse(cx, top + height * 0.3, width * 0.22, height * 0.15, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = colors.accent;
    ctx.lineWidth = Math.max(1, scale);
    ctx.stroke();

    const muzzleWorldX = enemy.x + Math.cos(enemy.turretAngle) * enemy.type.barrelLength;
    const muzzleWorldY = enemy.y + Math.sin(enemy.turretAngle) * enemy.type.barrelLength;
    const muzzle = projectWorld(muzzleWorldX, muzzleWorldY, 43);
    if (muzzle) {
      ctx.strokeStyle = colors.barrel;
      ctx.lineWidth = Math.max(2, 7 * scale);
      ctx.beginPath();
      ctx.moveTo(cx, top + height * 0.3);
      ctx.lineTo(muzzle.x, muzzle.y);
      ctx.stroke();
      ctx.fillStyle = "#1b1d18";
      ctx.beginPath();
      ctx.arc(muzzle.x, muzzle.y, Math.max(2, 4 * scale), 0, TAU);
      ctx.fill();
    }

    ctx.fillStyle = "rgba(231,185,96,.86)";
    ctx.beginPath();
    ctx.arc(cx, top - 12, 5, 0, TAU);
    ctx.fill();
    if (enemy.hp < enemy.maxHp) {
      const p = enemy.hp / enemy.maxHp;
      ctx.fillStyle = "rgba(10,14,9,.72)";
      ctx.fillRect(cx - width * 0.42, top - 25, width * 0.84, 6);
      ctx.fillStyle = p > 0.5 ? "#d9c66b" : "#e07354";
      ctx.fillRect(cx - width * 0.42, top - 25, width * 0.84 * p, 6);
    }
    ctx.restore();
  };

  const drawWorldEffects = () => {
    for (const particle of particles) {
      const p = projectWorld(particle.x, particle.y, particle.z);
      if (!p) continue;
      const radius = clamp(particle.size * p.scale, 1, 11);
      ctx.globalAlpha = clamp(particle.life / particle.maxLife, 0, 0.75);
      ctx.fillStyle = particle.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, radius, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    for (const ring of rings) {
      const p = projectWorld(ring.x, ring.y, 4);
      if (!p) continue;
      ctx.globalAlpha = clamp(ring.life / ring.maxLife, 0, 1);
      ctx.strokeStyle = ring.color;
      ctx.lineWidth = Math.max(1, 3 * p.scale);
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, ring.radius * p.scale, ring.radius * p.scale * 0.24, 0, 0, TAU);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    for (const item of floats) {
      const p = projectWorld(item.x, item.y, item.z);
      if (!p) continue;
      ctx.globalAlpha = clamp(item.life / item.maxLife, 0, 1);
      ctx.fillStyle = "rgba(10,15,9,.7)";
      const fontSize = clamp(item.size * p.scale, 12, 28);
      ctx.font = "700 " + fontSize + "px -apple-system,'PingFang SC','Microsoft YaHei',sans-serif";
      const width = ctx.measureText(item.text).width;
      roundedRect(p.x - width / 2 - 7, p.y - fontSize - 5, width + 14, fontSize + 10, 6);
      ctx.fill();
      ctx.fillStyle = item.color;
      ctx.textAlign = "center";
      ctx.fillText(item.text, p.x, p.y);
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = "left";
  };

  const drawBullets = () => {
    for (const bullet of bullets) {
      const p = projectWorld(bullet.x, bullet.y, 27);
      if (!p) continue;
      const previous = projectWorld(bullet.px, bullet.py, 27);
      if (previous) {
        ctx.strokeStyle = bullet.isPlayer ? "rgba(244,255,188,.9)" : "rgba(255,150,90,.92)";
        ctx.lineWidth = clamp(3.5 * p.scale, 1.5, 7);
        ctx.beginPath();
        ctx.moveTo(previous.x, previous.y);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
      }
      ctx.fillStyle = bullet.isPlayer ? "#f6ffc7" : "#ffad63";
      ctx.beginPath();
      ctx.arc(p.x, p.y, clamp(3 * p.scale, 1.5, 8), 0, TAU);
      ctx.fill();
    }
  };

  const drawFirstPersonCannon = () => {
    if (!player) return;
    const recoil = player.recoil;
    const cx = VIEW_W / 2 + 16;
    const gunTop = VIEW_H - 262 + recoil * 3;
    ctx.fillStyle = "#263226";
    ctx.beginPath();
    ctx.moveTo(cx - 126, VIEW_H);
    ctx.lineTo(cx - 48, VIEW_H - 126);
    ctx.lineTo(cx + 55, VIEW_H - 126);
    ctx.lineTo(cx + 134, VIEW_H);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(201,224,143,.35)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = "#151d16";
    roundedRect(cx - 18, gunTop, 36, VIEW_H - gunTop + 8, 7);
    ctx.fill();
    ctx.fillStyle = "#41563d";
    roundedRect(cx - 13, gunTop + 4, 26, VIEW_H - gunTop - 4, 5);
    ctx.fill();
    ctx.fillStyle = "#0d120e";
    roundedRect(cx - 25, gunTop - 10, 50, 22, 4);
    ctx.fill();
    ctx.strokeStyle = "rgba(218,235,158,.46)";
    ctx.lineWidth = 1.5;
    roundedRect(cx - 25, gunTop - 10, 50, 22, 4);
    ctx.stroke();
    ctx.fillStyle = "rgba(219,235,160,.45)";
    ctx.fillRect(cx - 8, gunTop + 42, 3, 105);
  };

  const drawCompass = () => {
    const x = 76;
    const y = 16;
    const w = VIEW_W - 152;
    const h = 46;
    ctx.fillStyle = "rgba(9,14,8,.58)";
    roundedRect(x, y, w, h, 10);
    ctx.fill();
    ctx.strokeStyle = "rgba(221,235,176,.18)";
    ctx.stroke();
    const heading = compassDegrees(player.turretAngle);
    ctx.fillStyle = "#e9efbd";
    ctx.font = "700 12px -apple-system,'PingFang SC',sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(compassText(player.turretAngle), VIEW_W / 2, y + 18);
    const cardinals = [{ deg: 0, label: "N" }, { deg: 90, label: "E" }, { deg: 180, label: "S" }, { deg: 270, label: "W" }];
    for (const item of cardinals) {
      let rel = ((item.deg - heading + 540) % 360) - 180;
      const sx = VIEW_W / 2 + rel / 180 * (w / 2 - 18);
      ctx.strokeStyle = "rgba(228,238,193,.24)";
      ctx.beginPath();
      ctx.moveTo(sx, y + 23);
      ctx.lineTo(sx, y + 35);
      ctx.stroke();
      ctx.fillStyle = "rgba(225,233,200,.7)";
      ctx.font = "700 9px -apple-system,sans-serif";
      ctx.fillText(item.label, sx, y + 43);
    }
    for (const enemy of enemies) {
      const bearing = compassDegrees(Math.atan2(enemy.y - player.y, enemy.x - player.x));
      const rel = ((bearing - heading + 540) % 360) - 180;
      const sx = VIEW_W / 2 + rel / 180 * (w / 2 - 12);
      ctx.fillStyle = rel > -HALF_FOV * 180 / Math.PI && rel < HALF_FOV * 180 / Math.PI ? "#ef7660" : "#b99066";
      ctx.beginPath();
      ctx.moveTo(sx, y + 25);
      ctx.lineTo(sx - 4, y + 33);
      ctx.lineTo(sx + 4, y + 33);
      ctx.closePath();
      ctx.fill();
    }
    ctx.textAlign = "left";
  };

  const drawReticle = () => {
    const target = aimedEnemy();
    const cx = VIEW_W / 2;
    const cy = VIEW_H / 2;
    const color = target ? "#dff28e" : "rgba(243,239,210,.84)";
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, 13, 0, TAU);
    ctx.moveTo(cx - 25, cy);
    ctx.lineTo(cx - 8, cy);
    ctx.moveTo(cx + 8, cy);
    ctx.lineTo(cx + 25, cy);
    ctx.moveTo(cx, cy - 25);
    ctx.lineTo(cx, cy - 8);
    ctx.moveTo(cx, cy + 8);
    ctx.lineTo(cx, cy + 25);
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(cx, cy, 2, 0, TAU);
    ctx.fill();
    if (target) {
      const p = target.box.projection;
      ctx.fillStyle = "rgba(10,16,9,.7)";
      roundedRect(cx - 88, cy + 33, 176, 28, 7);
      ctx.fill();
      ctx.fillStyle = "#e8f0bd";
      ctx.font = "700 12px -apple-system,'PingFang SC',sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("虎式固定炮台 · " + Math.round(p.distance / 10) + " m", cx, cy + 51);
      ctx.textAlign = "left";
    }
    if (hitMarker > 0) {
      ctx.globalAlpha = clamp(hitMarker * 4, 0, 1);
      ctx.strokeStyle = "#fff1a1";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(cx - 16, cy - 16);
      ctx.lineTo(cx - 6, cy - 6);
      ctx.moveTo(cx + 16, cy - 16);
      ctx.lineTo(cx + 6, cy - 6);
      ctx.moveTo(cx - 16, cy + 16);
      ctx.lineTo(cx - 6, cy + 6);
      ctx.moveTo(cx + 16, cy + 16);
      ctx.lineTo(cx + 6, cy + 6);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  };

  const drawJoystick = (stick) => {
    if (stick.id === null) return;
    ctx.fillStyle = "rgba(10,17,8,.3)";
    ctx.strokeStyle = "rgba(230,241,183,.46)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(stick.baseX, stick.baseY, 64, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "rgba(222,240,166,.42)";
    ctx.beginPath();
    ctx.arc(stick.baseX + stick.dx * 52, stick.baseY + stick.dy * 52, 23, 0, TAU);
    ctx.fill();
  };

  const render = () => {
    if (!ctx || !player) return;
    const scaleX = canvas.width / VIEW_W;
    const scaleY = canvas.height / VIEW_H;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const shakeX = screenShake > 0 ? (Math.random() - 0.5) * screenShake : 0;
    const shakeY = screenShake > 0 ? (Math.random() - 0.5) * screenShake : 0;
    ctx.setTransform(scaleX, 0, 0, scaleY, shakeX * scaleX, shakeY * scaleY);
    drawBackdrop();

    const drawables = [];
    for (const obstacle of obstacles) {
      if (obstacle.destroyed) continue;
      const p = projectWorld(obstacle.x + obstacle.w / 2, obstacle.y + obstacle.h / 2, 0);
      if (p) drawables.push({ kind: "obstacle", depth: p.depth, object: obstacle, projection: p });
    }
    for (const enemy of enemies) {
      const p = projectedEnemy(enemy);
      if (p) drawables.push({ kind: "enemy", depth: p.depth, object: enemy, projection: p });
    }
    drawables.sort((a, b) => b.depth - a.depth);
    for (const item of drawables) {
      if (item.kind === "obstacle") drawObstacle(item.object, item.projection);
      else drawEnemy(item.object, item.projection);
    }
    drawBullets();
    drawWorldEffects();
    drawFirstPersonCannon();
    drawCompass();
    drawReticle();
    drawJoystick(touches.left);
    drawJoystick(touches.right);

    const vignette = ctx.createRadialGradient(VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.25, VIEW_W / 2, VIEW_H / 2, VIEW_W * 0.68);
    vignette.addColorStop(0, "rgba(6,10,6,0)");
    vignette.addColorStop(1, "rgba(6,10,6,.42)");
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
    setText("hud-enemies", String(enemies.length));
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
      const relative = angleDelta(player.angle, player.turretAngle);
      turret.style.transform = "rotate(" + relative + "rad)";
      turret.title = "炮塔相对车体 " + Math.round(relative * 180 / Math.PI) + "°";
    }
    setText("hud-hull-bearing", compassText(player.angle));
    setText("hud-turret-bearing", compassText(player.turretAngle));
    setText("hud-relative", Math.round(relativeDegrees(angleDelta(player.angle, player.turretAngle))) + "°");
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

  const updateMobileControls = () => {
    const fire = $("mobile-fire");
    if (!fire) return;
    fire.classList.toggle("hidden", state !== "playing" || locked);
  };

  const showMenu = () => {
    state = "menu";
    keys.clear();
    fireHeld = false;
    setOverlay("menu", true);
    setOverlay("pause-modal", false);
    setOverlay("result-modal", false);
    updateMobileControls();
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
    if (!COARSE_POINTER && canvas.requestPointerLock) {
      const pending = canvas.requestPointerLock();
      if (pending && pending.catch) pending.catch(() => {});
    }
    updateMobileControls();
    lastFrame = performance.now();
  };

  const pauseGame = (automatic = false) => {
    if (state !== "playing" || locked) return;
    state = "paused";
    fireHeld = false;
    keys.clear();
    if (document.pointerLockElement === canvas && document.exitPointerLock) document.exitPointerLock();
    setOverlay("pause-modal", true);
    const info = $("pause-info");
    if (info) info.textContent = automatic ? "页面切到后台，第一人称炮塔视角已冻结。" : "战场已冻结，敌军装填和弹道都会暂停。";
    updateMobileControls();
  };

  const resumeGame = () => {
    if (state !== "paused" || locked) return;
    state = "playing";
    setOverlay("pause-modal", false);
    if (!COARSE_POINTER && canvas.requestPointerLock) {
      const pending = canvas.requestPointerLock();
      if (pending && pending.catch) pending.catch(() => {});
    }
    lastFrame = performance.now();
    updateMobileControls();
  };

  const togglePause = () => {
    if (state === "playing") pauseGame(false);
    else if (state === "paused") resumeGame();
  };

  const finishBattle = (won) => {
    if (state !== "playing") return;
    state = "result";
    battleEndedAt = performance.now();
    fireHeld = false;
    keys.clear();
    if (document.pointerLockElement === canvas && document.exitPointerLock) document.exitPointerLock();
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
    setText("result-title", won ? "合围突破" : "炮塔陷落");
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
      '<p class="result-note">' + (won ? "十座固定炮台全部清除，你在合围中找到了最后一条机动路线。" : "固定炮台不会追击。用履带换位、用掩体挡炮，再寻找侧后装甲窗口。") + "</p>";
    const body = $("result-body");
    if (body) body.innerHTML = html;
    setOverlay("result-modal", true);
    updateMobileControls();
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
    updateMobileControls();
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
  };

  const loop = (now) => {
    const dt = Math.min(0.04, Math.max(0.001, (now - lastFrame) / 1000));
    lastFrame = now;
    if (state === "playing") {
      updatePlayer(dt);
      for (const enemy of enemies) updateEnemy(enemy, dt);
      updateBullets(dt);
      updateEffects(dt);
      updateHud();
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
      navigator.serviceWorker.register("./service-worker.js?v=4").then((registration) => {
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
    if (!button) return;
    button.addEventListener("click", async () => {
      if (deferredInstallPrompt) {
        deferredInstallPrompt.prompt();
        const choice = await deferredInstallPrompt.userChoice.catch(() => null);
        if (choice && choice.outcome === "accepted") button.classList.add("hidden");
        deferredInstallPrompt = null;
        return;
      }
      const standalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone;
      showToast(standalone ? "当前已经是桌面应用模式" : "请在浏览器菜单中选择「添加到主屏幕」", 4200);
    });
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
      setText("btn-mute", muted ? "🔇" : "🔊");
      saveData = Sync ? Sync.updateSettings({ muted }) : saveData;
      if (!muted) AudioFx.unlock();
      showToast(muted ? "声音已关闭" : "声音已开启", 1500);
    });
    const mobileFire = $("mobile-fire");
    if (mobileFire) {
      mobileFire.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        event.stopPropagation();
        fireHeld = true;
        firePlayer();
      });
      const release = (event) => {
        event.preventDefault();
        event.stopPropagation();
        fireHeld = false;
      };
      mobileFire.addEventListener("pointerup", release);
      mobileFire.addEventListener("pointercancel", release);
      mobileFire.addEventListener("pointerleave", release);
    }
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
      if (document.visibilityState === "hidden" && state === "playing") pauseGame(true);
    });
    document.addEventListener("pointerlockchange", () => {
      if (document.pointerLockElement !== canvas && state === "playing" && !COARSE_POINTER) {
        showToast("点击画面锁定鼠标，继续环视炮塔", 2200);
      }
    });
  };

  const init = () => {
    canvas = $("game");
    if (!canvas) return;
    ctx = canvas.getContext("2d");
    canvas.width = VIEW_W;
    canvas.height = VIEW_H;
    bindInput();
    bindUi();
    bindInstall();
    registerSw();
    setText("app-version", APP_VERSION);
    setText("btn-mute", muted ? "🔇" : "🔊");
    resetBattle();
    state = "menu";
    updateCanvasFrame();
    render();
    updateMenuStats();
    updateMobileControls();
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
        pitch: player.pitch,
        hp: player.hp,
        ammo: player.ammo,
        reload: player.reload
      } : null,
      enemies: enemies.map((enemy) => ({
        id: enemy.id,
        x: enemy.x,
        y: enemy.y,
        angle: enemy.angle,
        turretAngle: enemy.turretAngle,
        hp: enemy.hp,
        ammo: enemy.ammo,
        reload: enemy.reload,
        shotsFired: enemy.shotsFired,
        fixed: enemy.fixed
      })),
      visibleEnemyIds: visibleEnemies().map((enemy) => enemy.id),
      enemyCount: enemies.length,
      bullets: bullets.length,
      kills,
      score,
      obstacles: obstacles.map((obstacle) => ({ type: obstacle.type, hp: obstacle.hp, destroyed: obstacle.destroyed }))
    }),
    startBattle,
    pauseGame,
    resumeGame,
    finishBattle,
    armorProfile,
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
    setViewYaw: (angle) => {
      if (player) player.turretAngle = normalizeAngle(Number(angle) || 0);
    },
    setHullYaw: (angle) => {
      if (player) player.angle = normalizeAngle(Number(angle) || 0);
    },
    aimAt: (x, y) => {
      if (player) player.turretAngle = Math.atan2(y - player.y, x - player.x);
    },
    fire: () => firePlayer(),
    projectEnemy: (id) => {
      const enemy = enemies.find((item) => item.id === id);
      const p = enemy ? projectedEnemy(enemy) : null;
      return p ? { x: p.x, y: p.y, width: p.width, height: p.height, depth: p.depth, scale: p.scale } : null;
    },
    visibleEnemyIds: () => visibleEnemies().map((enemy) => enemy.id),
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

