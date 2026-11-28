"use strict";

(() => {
  const D = window.TankData;
  const Sync = window.TankSync;
  const B = D.BATTLE;
  const WORLD = D.WORLD;
  const TANK_TYPES = D.TANKS;
  const LEVELS = D.LEVELS;
  const VIEW_W = 1280;
  const VIEW_H = 720;
  const APP_VERSION = "v0.5.8";
  const FOV = 1.72;
  const HALF_FOV = FOV / 2;
  const BASE_FOCAL = (VIEW_W / 2) / Math.tan(HALF_FOV);
  const AIM_ZOOM = 3.2;
  const AIM_MOUSE_SCALE = 0.48;
  const PITCH_LIMIT = 0.12;
  const EYE_HEIGHT = 44;
  const $ = (id) => document.getElementById(id);
  const TAU = Math.PI * 2;
  const COARSE_POINTER = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
  const MOUSE_SENSITIVITY = 0.00225;
  const STICK_LOOK_SPEED = 2.35;
  const MINIMAP = {
    x: 14,
    y: 70,
    width: 148,
    height: 154,
    radius: 60,
    worldRadius: 1450
  };
  const OBSTACLE_WIDTH_FACTOR = {
    concrete: 0.72,
    wood: 0.78,
    sandbag: 0.82,
    earth: 0.84,
    wreck: 0.76
  };
  const OBSTACLE_HEIGHT_FACTOR = {
    concrete: 0.52,
    wood: 0.92,
    sandbag: 0.88,
    earth: 0.82,
    wreck: 0.92
  };

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
  let levelIndex = 0;
  let lastBattleWon = false;
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
  let cockpitMuzzleFlash = 0;
  let shotFeedback = null;
  let hullBobPhase = 0;
  let hullBobX = 0;
  let hullBobY = 0;
  let hullTurnSignal = 0;
  let toastTimer = 0;
  let deferredInstallPrompt = null;
  let installDismissed = false;
  let selectedBackdrop = "europe";
  let backdropImages = new Map();
  let saveData = Sync ? Sync.loadLocal() : null;
  let muted = !!(saveData && saveData.settings && saveData.settings.muted);
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
  const currentLevel = () => LEVELS[levelIndex] || LEVELS[0];
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
  const pointSegmentDistance = (px, py, x1, y1, x2, y2) => {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lengthSq = dx * dx + dy * dy;
    if (lengthSq < 0.000001) return Math.hypot(px - x1, py - y1);
    const t = clamp(((px - x1) * dx + (py - y1) * dy) / lengthSq, 0, 1);
    return Math.hypot(px - (x1 + dx * t), py - (y1 + dy * t));
  };
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
  const currentFocal = () => BASE_FOCAL * (player && player.aiming ? AIM_ZOOM : 1);
  const currentHalfFov = () => HALF_FOV / (player && player.aiming ? AIM_ZOOM : 1);
  const horizonY = () => VIEW_H * 0.5 + Math.tan(player ? player.pitch : 0) * currentFocal();

  const projectWorld = (x, y, z = 0) => {
    if (!player) return null;
    const dx = x - player.x;
    const dy = y - player.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 1) return null;
    const bearing = Math.atan2(dy, dx);
    const relative = angleDelta(player.turretAngle, bearing);
    const forward = dist * Math.cos(relative);
    if (forward <= 4 || Math.abs(relative) > currentHalfFov() + 0.035) return null;
    const focal = currentFocal();
    const scale = focal / forward;
    const screenX = VIEW_W / 2 + Math.tan(relative) * focal;
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
    let engine = null;
    let engineSample = null;
    let master = null;
    const sampleBuffers = new Map();
    const sampleLoading = new Map();
    const sampleUnavailable = new Set();
    let sampleErrors = 0;
    const SOUND_FILES = {
      cannon: "assets/audio/tank-cannon.mp3",
      ricochet: "assets/audio/tank-ricochet.mp3",
      engine: "assets/audio/tank-engine-loop.mp3",
      armorHit: "assets/audio/tank-armor-hit.mp3",
      explosion: "assets/audio/tank-explosion.mp3"
    };
    const events = {
      playerShots: 0,
      enemyShots: 0,
      nearMisses: 0,
      ricochets: 0,
      hits: 0,
      sampleShots: 0,
      fallbackShots: 0
    };
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
    const ensureMaster = (ac) => {
      if (!ac) return null;
      if (!master) {
        master = ac.createGain();
        const compressor = ac.createDynamicsCompressor();
        master.gain.value = 0.9;
        compressor.threshold.value = -16;
        compressor.knee.value = 18;
        compressor.ratio.value = 5;
        compressor.attack.value = 0.004;
        compressor.release.value = 0.24;
        master.connect(compressor).connect(ac.destination);
      }
      return master;
    };
    const loadSample = (name) => {
      const ac = get();
      if (!ac || !SOUND_FILES[name]) return Promise.resolve(null);
      if (sampleBuffers.has(name)) return Promise.resolve(sampleBuffers.get(name));
      if (sampleUnavailable.has(name)) return Promise.resolve(null);
      if (sampleLoading.has(name)) return sampleLoading.get(name);
      const pending = fetch(SOUND_FILES[name], { cache: "force-cache" })
        .then((response) => {
          if (!response.ok) throw new Error("sample load failed");
          return response.arrayBuffer();
        })
        .then((data) => ac.decodeAudioData(data))
        .then((buffer) => {
          sampleBuffers.set(name, buffer);
          return buffer;
        })
        .catch(() => {
          sampleUnavailable.add(name);
          sampleErrors += 1;
          return null;
        })
        .finally(() => sampleLoading.delete(name));
      sampleLoading.set(name, pending);
      return pending;
    };
    const playSample = (name, volume, playbackRate = 1, pan = 0, cutoff = 4800, delay = 0) => {
      const ac = get();
      const buffer = sampleBuffers.get(name);
      if (!ac || !buffer || muted) return false;
      const source = ac.createBufferSource();
      const gain = ac.createGain();
      const filter = ac.createBiquadFilter();
      const stereo = ac.createStereoPanner ? ac.createStereoPanner() : null;
      source.buffer = buffer;
      source.playbackRate.value = playbackRate;
      filter.type = "lowpass";
      filter.frequency.value = cutoff;
      gain.gain.value = volume;
      source.connect(filter).connect(gain);
      if (stereo) {
        stereo.pan.value = clamp(pan, -1, 1);
        gain.connect(stereo).connect(ensureMaster(ac));
      } else {
        gain.connect(ensureMaster(ac));
      }
      source.start(ac.currentTime + delay);
      return true;
    };
    const ensureEngine = () => {
      const ac = get();
      if (!ac) return null;
      if (!engine) {
        const low = ac.createOscillator();
        const high = ac.createOscillator();
        const filter = ac.createBiquadFilter();
        const gain = ac.createGain();
        low.type = "sawtooth";
        high.type = "triangle";
        low.frequency.value = 42;
        high.frequency.value = 68;
        filter.type = "lowpass";
        filter.frequency.value = 190;
        gain.gain.value = 0;
        low.connect(filter);
        high.connect(filter);
        filter.connect(gain).connect(ensureMaster(ac));
        low.start();
        high.start();
        engine = { ac, low, high, filter, gain };
      }
      return engine;
    };
    const ensureEngineSample = () => {
      const ac = get();
      const buffer = sampleBuffers.get("engine");
      if (!ac || !buffer) return null;
      if (!engineSample) {
        const source = ac.createBufferSource();
        const filter = ac.createBiquadFilter();
        const gain = ac.createGain();
        source.buffer = buffer;
        source.loop = true;
        filter.type = "lowpass";
        filter.frequency.value = 720;
        gain.gain.value = 0;
        source.connect(filter).connect(gain).connect(ensureMaster(ac));
        source.start();
        engineSample = { ac, source, filter, gain };
      }
      return engineSample;
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
      oscillator.connect(gain).connect(ensureMaster(ac));
      oscillator.start(start);
      oscillator.stop(start + duration + 0.02);
    };
    const noise = (duration, volume, cutoff, pan = 0) => {
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
      const stereo = ac.createStereoPanner ? ac.createStereoPanner() : null;
      source.buffer = buffer;
      filter.type = "lowpass";
      filter.frequency.value = cutoff;
      gain.gain.value = volume;
      source.connect(filter).connect(gain);
      if (stereo) {
        stereo.pan.value = clamp(pan, -1, 1);
        gain.connect(stereo).connect(ensureMaster(ac));
      } else {
        gain.connect(ensureMaster(ac));
      }
      source.start();
    };
    return {
      unlock: () => {
        const ac = get();
        if (ac) {
          ensureEngine();
          loadSample("ricochet");
          loadSample("cannon");
          loadSample("engine");
          loadSample("armorHit");
          loadSample("explosion");
        }
        return ac;
      },
      setEngine: (active, speedRatio = 0, turnRatio = 0, throttleRatio = 0) => {
        if (muted || !active) {
          if (engine) {
            engine.gain.gain.setTargetAtTime(0.0001, engine.ac.currentTime, 0.08);
          }
          if (engineSample) {
            engineSample.gain.gain.setTargetAtTime(0.0001, engineSample.ac.currentTime, 0.08);
          }
          return;
        }
        const intensity = clamp(Math.max(speedRatio, turnRatio, throttleRatio * 0.82), 0, 1);
        const sampleNodes = ensureEngineSample();
        if (sampleNodes) {
          const now = sampleNodes.ac.currentTime;
          sampleNodes.gain.gain.setTargetAtTime(0.014 + intensity * 0.085, now, 0.08);
          sampleNodes.source.playbackRate.setTargetAtTime(0.82 + intensity * 0.26, now, 0.12);
          sampleNodes.filter.frequency.setTargetAtTime(620 + intensity * 900, now, 0.12);
          if (engine) engine.gain.gain.setTargetAtTime(0.0001, engine.ac.currentTime, 0.08);
          return;
        }
        const nodes = ensureEngine();
        if (!nodes) return;
        const now = nodes.ac.currentTime;
        nodes.gain.gain.setTargetAtTime(0.012 + intensity * 0.042, now, 0.1);
        nodes.low.frequency.setTargetAtTime(40 + intensity * 26, now, 0.12);
        nodes.high.frequency.setTargetAtTime(64 + intensity * 43, now, 0.12);
        nodes.filter.frequency.setTargetAtTime(170 + intensity * 180, now, 0.14);
      },
      info: () => ({
        muted,
        state: audio ? audio.state : "not-created",
        engineActive: !!(
          audio &&
          audio.state === "running" &&
          ((engine && engine.gain.gain.value > 0) || (engineSample && engineSample.gain.gain.value > 0))
        ),
        engineMode: engineSample ? "sample" : (engine ? "synth" : "none"),
        engineGain: engineSample ? engineSample.gain.gain.value : (engine ? engine.gain.gain.value : 0),
        cannonSampleLoaded: sampleBuffers.has("cannon"),
        ricochetSampleLoaded: sampleBuffers.has("ricochet"),
        engineSampleLoaded: sampleBuffers.has("engine"),
        armorHitSampleLoaded: sampleBuffers.has("armorHit"),
        explosionSampleLoaded: sampleBuffers.has("explosion"),
        sampleErrors,
        events: { ...events }
      }),
      click: () => tone(520, 760, 0.07, "triangle", 0.08),
      shoot: (isPlayer, distance = 0, pan = 0) => {
        const ac = get();
        if (!ac || muted) return;
        if (isPlayer) events.playerShots += 1;
        else events.enemyShots += 1;
        const attenuation = isPlayer ? 1 : clamp(1 - distance / 2200, 0.42, 1);
        const played = playSample(
          "cannon",
          (isPlayer ? 0.92 : 0.54) * attenuation,
          isPlayer ? 0.78 : 0.72 + attenuation * 0.1,
          pan,
          isPlayer ? 6200 : 1500 + attenuation * 1600
        );
        if (played) {
          events.sampleShots += 1;
          playSample(
            "explosion",
            (isPlayer ? 0.11 : 0.07) * attenuation,
            isPlayer ? 0.92 : 1.02,
            pan,
            isPlayer ? 1800 : 900,
            0.025
          );
        } else {
          events.fallbackShots += 1;
          loadSample("cannon");
          noise(isPlayer ? 0.42 : 0.3, (isPlayer ? 0.42 : 0.24) * attenuation, isPlayer ? 520 : 420, pan);
          tone(isPlayer ? 72 : 64, 28, 0.42, "triangle", (isPlayer ? 0.12 : 0.08) * attenuation);
        }
      },
      whoosh: () => {
        const ac = get();
        if (!ac || muted) return;
        events.nearMisses += 1;
        noise(0.24, 0.2, 3400);
        tone(920, 150, 0.26, "sawtooth", 0.075);
      },
      empty: () => tone(760, 520, 0.06, "square", 0.06),
      reload: () => {
        tone(360, 300, 0.04, "square", 0.05);
        setTimeout(() => tone(460, 390, 0.04, "square", 0.05), 190);
      },
      hit: (zone) => {
        const ac = get();
        if (!ac || muted) return;
        events.hits += 1;
        const strong = zone === "rear" ? 1 : 0;
        playSample("armorHit", 0.62 + strong * 0.12, 0.92 + Math.random() * 0.1, 0, 7200);
        noise(0.12, 0.13 + strong * 0.05, 1650);
        tone(zone === "rear" ? 150 : 205, 58, 0.2, "triangle", 0.1);
        if (strong) tone(95, 45, 0.36, "triangle", 0.16);
      },
      ricochet: () => {
        const ac = get();
        if (!ac || muted) return;
        events.ricochets += 1;
        if (playSample("ricochet", 0.72, 0.96 + Math.random() * 0.08, 0, 11000)) return;
        tone(1450, 720, 0.18, "sawtooth", 0.1);
        noise(0.08, 0.08, 3000);
      },
      explode: (large) => {
        playSample("explosion", large ? 0.92 : 0.52, large ? 0.92 : 1.05, 0, 5200);
        noise(large ? 0.52 : 0.28, large ? 0.22 : 0.12, large ? 620 : 850);
        tone(large ? 92 : 135, 34, large ? 0.58 : 0.3, "triangle", large ? 0.16 : 0.08);
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
    aiming: false,
    speed: 0,
    strafeSpeed: 0,
    throttleInput: 0,
    steerInput: 0,
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
    hitFlash: 0,
    muzzleFlash: 0,
    burning: false,
    burnStartedAt: 0
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
    reload: 2.8 + slot * 0.45 + Math.random() * 0.5,
    reloadDuration: B.enemyReload,
    ammo: B.magazineSize,
    shotsFired: 0,
    hp: B.enemyHp,
    maxHp: B.enemyHp,
    radius: TANK_TYPES.tiger.radius,
    alive: true,
    recoil: 0,
    hitFlash: 0,
    muzzleFlash: 0
  });

  const resetBattle = () => {
    const level = currentLevel();
    obstacles = D.cloneObstacles(levelIndex).map((obstacle, index) => {
      const meta = D.OBSTACLE_TYPES[obstacle.type];
      return {
        ...obstacle,
        id: index,
        meta,
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
    cockpitMuzzleFlash = 0;
    shotFeedback = null;
    hullBobPhase = 0;
    hullBobX = 0;
    hullBobY = 0;
    hullTurnSignal = 0;
    battleEndedAt = 0;
    battleStartedAt = performance.now();
    player = makePlayer(WORLD.playerSpawn);
    const spawns = D.cloneSpawns(levelIndex);
    for (let i = 0; i < level.enemyTotal; i += 1) {
      const enemy = makeEnemy(spawns[i], i);
      enemy.turretAngle = enemy.angle;
      enemy.targetAim = enemy.angle;
      enemies.push(enemy);
    }
    updateMenuStats();
    updateLevelUi();
    updateHud();
  };

  // ---------- 特效 ----------
  const showShotFeedback = (text, color = "#e8efc5", duration = 1.2) => {
    shotFeedback = { text, color, life: duration, maxLife: duration };
  };

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

  const addImpactExplosion = (x, y, large = false) => {
    addBurst(x, y, large ? "#ffb347" : "#f7c56d", large ? 30 : 16, large ? 230 : 150);
    addBurst(x, y, "rgba(55,54,48,.82)", large ? 18 : 9, large ? 130 : 82);
    addRing(x, y, large ? 72 : 38, "rgba(255,196,108,.72)", large ? 0.58 : 0.34);
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
    tank.muzzleFlash = Math.max(0, tank.muzzleFlash - dt * 3.8);
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
    const shotAngle = forcedAngle === null
      ? normalizeAngle(tank.turretAngle + (tank.isPlayer ? 0 : (Math.random() * 2 - 1) * B.enemySpread))
      : forcedAngle;
    const muzzleDistance = tank.type.hullLength * 0.22 + tank.type.barrelLength - tank.recoil;
    const x = tank.x + Math.cos(shotAngle) * muzzleDistance;
    const y = tank.y + Math.sin(shotAngle) * muzzleDistance;
    bullets.push({
      x,
      y,
      px: x,
      py: y,
      z: EYE_HEIGHT,
      pz: EYE_HEIGHT,
      vz: tank.isPlayer ? Math.tan(tank.pitch) * B.bulletSpeed : 0,
      vx: Math.cos(shotAngle) * B.bulletSpeed,
      vy: Math.sin(shotAngle) * B.bulletSpeed,
      owner: tank,
      isPlayer: tank.isPlayer,
      damage: tank.isPlayer ? B.playerDamage : B.enemyDamage,
      alive: true,
      life: 2.4,
      rangeLeft: tank.isPlayer ? B.playerRange : B.enemyRange,
      nearMissPlayed: false
    });
    tank.ammo -= 1;
    tank.shotsFired += 1;
    tank.fireCooldown = B.fireCooldown;
    tank.recoil = 12;
    tank.muzzleFlash = 1;
    if (tank.ammo <= 0) tank.reload = tank.reloadDuration;
    if (tank.isPlayer) {
      shotsFired += 1;
      screenShake = Math.max(screenShake, 6);
      cockpitMuzzleFlash = 1;
    }
    const enemyBearing = player ? Math.atan2(player.y - tank.y, player.x - tank.x) : 0;
    const shotPan = tank.isPlayer
      ? 0
      : clamp(Math.sin(angleDelta(player ? player.turretAngle : 0, enemyBearing)), -1, 1);
    AudioFx.shoot(tank.isPlayer, tank.isPlayer ? 0 : distanceBetween(tank, player), shotPan);
    addBurst(x, y, tank.isPlayer ? "#ffe08a" : "#ffb15d", 12, 145);
    addBurst(x, y, "rgba(73,70,62,.72)", 9, 90);
    return true;
  };

  const damageObstacle = (obstacle, bullet) => {
    if (!obstacle || obstacle.destroyed) return;
    const meta = obstacle.meta || D.OBSTACLE_TYPES[obstacle.type];
    // 残骸是永久实体：后续炮弹只能被它挡住，不能销毁或从画面移除。
    if (obstacle.type === "wreck") {
      addImpactExplosion(bullet.x, bullet.y);
      AudioFx.hit("front");
      if (bullet.isPlayer) showShotFeedback("坦克残骸挡住炮弹", "#ffd178");
      return;
    }
    if (obstacle.hp === null) {
      addImpactExplosion(bullet.x, bullet.y);
      addFloat(bullet.x, bullet.y, "无法破坏", "#d8c7a2", 15);
      AudioFx.hit("front");
      if (bullet.isPlayer) showShotFeedback((meta ? meta.label : "硬掩体") + "挡住炮弹", "#ffd178");
      return;
    }
    obstacle.hp -= bullet.damage;
    obstacle.hitFlash = 1;
    addImpactExplosion(bullet.x, bullet.y);
    addFloat(bullet.x, bullet.y, "-" + Math.round(bullet.damage), "#f0cc81", 16);
    if (obstacle.hp <= 0) {
      obstacle.destroyed = true;
      addBurst(obstacle.x + obstacle.w / 2, obstacle.y + obstacle.h / 2, "#b57b43", 36, 190);
      addRing(obstacle.x + obstacle.w / 2, obstacle.y + obstacle.h / 2, 60, "rgba(221,179,105,.7)");
      addFloat(obstacle.x + obstacle.w / 2, obstacle.y, "掩体摧毁", "#ffd178", 17);
      screenShake = Math.max(screenShake, 5);
      AudioFx.breakCover();
      if (bullet.isPlayer) showShotFeedback((meta ? meta.label : "掩体") + "已摧毁", "#f2d283");
    } else {
      AudioFx.hit("side");
      if (bullet.isPlayer) {
        const remaining = Math.max(1, Math.ceil(obstacle.hp / Math.max(1, bullet.damage)));
        showShotFeedback(
          (meta ? meta.label : "掩体") + "挡住炮弹 · 约再 " + remaining + " 炮",
          "#ffd178"
        );
      }
    }
  };

  const addWreck = (tank) => {
    const meta = D.OBSTACLE_TYPES.wreck;
    obstacles.push({
      x: tank.x - 36,
      y: tank.y - 42,
      w: 72,
      h: 84,
      type: "wreck",
      artVariant: ["front", "side", "rear", "alt"][kills % 4],
      id: "wreck-" + Math.random().toString(36).slice(2),
      sourceId: tank.id || "player",
      hp: null,
      maxHp: null,
      destroyed: false,
      blocks: true,
      permanent: true,
      hitFlash: 0,
      meta,
      burningUntil: performance.now() + (tank.isPlayer ? 0 : 9000)
    });
  };

  const destroyTank = (tank) => {
    if (!tank || !tank.alive) return;
    tank.alive = false;
    addWreck(tank);
    addImpactExplosion(tank.x, tank.y, true);
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
    addFloat(tank.x, tank.y, "残骸留场", "#ffd08a", 19);
    kills += 1;
    combo = comboTime > 0 ? combo + 1 : 1;
    comboTime = B.comboWindow;
    const points = (110 + (combo - 1) * 28) * Math.min(combo, 8);
    score += points;
    addFloat(tank.x, tank.y, "+" + points + (combo > 1 ? "  ×" + combo : ""), "#f7e59a", 22);
    if (kills >= currentLevel().enemyTotal && enemies.length === 0) {
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
    if (armor.zone === "front" && !bullet.isPlayer && Math.random() < B.frontRicochetChance) {
      addBurst(bullet.x, bullet.y, "#fff2b2", 16, 160);
      addRing(bullet.x, bullet.y, 44, "rgba(255,239,176,.75)", 0.38);
      addFloat(target.x, target.y, "跳弹", "#fff0a6", 20);
      AudioFx.ricochet();
      target.hitFlash = 0.8;
      if (bullet.isPlayer) {
        hitMarker = 0.22;
        showShotFeedback("跳弹 · " + armor.label, "#fff0a6");
      }
      return;
    }
    const damage = Math.round(bullet.damage * armor.multiplier);
    target.hp = Math.max(0, target.hp - damage);
    target.hitFlash = 1;
    const ignited = !target.isPlayer && target.hp > 0 && !target.burning;
    if (ignited) {
      target.burning = true;
      target.burnStartedAt = performance.now();
      addFloat(target.x, target.y, "目标起火", "#ff9a53", 20);
    }
    if (bullet.isPlayer) {
      shotsHit += 1;
      hitMarker = 0.3;
      showShotFeedback(
        target.hp <= 0
          ? "摧毁 · " + armor.label + " -" + damage
          : "命中 · " + armor.label + " -" + damage + (ignited ? " · 目标起火" : ""),
        armor.color
      );
    }
    if (target.isPlayer) damageFlash = Math.max(damageFlash, 0.7);
    addImpactExplosion(bullet.x, bullet.y);
    addFloat(target.x, target.y, armor.label + " -" + damage, armor.color, 18);
    screenShake = Math.max(screenShake, target.isPlayer ? 16 : 5);
    AudioFx.hit(armor.zone);
    if (target.hp <= 0) destroyTank(target);
  };

  // ---------- 更新 ----------
  const updatePlayer = (dt) => {
    if (!player || !player.alive) return;
    let throttle = 0;
    let steer = 0;
    let strafe = 0;
    if (touches.left.id !== null) {
      throttle = -touches.left.dy;
      steer = touches.left.dx;
    } else {
      if (keys.has("w") || keys.has("arrowup")) throttle += 1;
      if (keys.has("s") || keys.has("arrowdown")) throttle -= 1;
      if (keys.has("d") || keys.has("arrowright")) steer += 1;
      if (keys.has("a") || keys.has("arrowleft")) steer -= 1;
      if (keys.has("e")) strafe += 1;
      if (keys.has("q")) strafe -= 1;
    }
    if (touches.right.id !== null) {
      const lookScale = player.aiming ? AIM_MOUSE_SCALE : 1;
      player.turretAngle = normalizeAngle(player.turretAngle + touches.right.dx * STICK_LOOK_SPEED * lookScale * dt);
      player.pitch = clamp(player.pitch - touches.right.dy * 0.72 * dt, -PITCH_LIMIT, PITCH_LIMIT);
    }
    player.throttleInput = throttle;
    player.steerInput = steer;

    const targetSpeed = throttle * (throttle >= 0 ? player.type.maxForward : player.type.maxReverse);
    player.speed = approach(
      player.speed,
      targetSpeed,
      (throttle !== 0 ? player.type.acceleration : player.type.brake) * dt
    );
    player.strafeSpeed = approach(
      player.strafeSpeed,
      strafe * player.type.maxStrafe,
      (strafe !== 0 ? player.type.strafeAcceleration : player.type.brake) * dt
    );
    const turnSpeed = player.type.hullTurnRate * (0.58 + 0.42 * clamp(Math.abs(player.speed) / 70, 0, 1));
    player.angle = normalizeAngle(player.angle + steer * turnSpeed * dt);
    const forwardX = Math.cos(player.angle) * player.speed * dt;
    const forwardY = Math.sin(player.angle) * player.speed * dt;
    const rightX = -Math.sin(player.angle) * player.strafeSpeed * dt;
    const rightY = Math.cos(player.angle) * player.strafeSpeed * dt;
    movePlayer(forwardX + rightX, forwardY + rightY);
    hullTurnSignal = Math.abs(steer) > 0.08 ? 1 : Math.max(0, hullTurnSignal - dt * 4);
    const motionStrength = clamp(
      Math.abs(player.speed) / player.type.maxForward +
      Math.abs(player.strafeSpeed) / player.type.maxStrafe * 0.55 +
      Math.abs(steer) * 0.32,
      0,
      1
    );
    hullBobPhase += dt * (2.2 + motionStrength * 12);
    hullBobX = Math.sin(hullBobPhase * 1.7) * 2.6 * motionStrength + steer * 0.9 * motionStrength;
    hullBobY = Math.sin(hullBobPhase * 3.15) * 3.4 * motionStrength;
    updateWeaponTimers(player, dt);
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
      bullet.rangeLeft -= Math.hypot(bullet.vx, bullet.vy) * dt;
      if (bullet.life <= 0 || bullet.rangeLeft <= 0) {
        bullet.alive = false;
        if (bullet.isPlayer) showShotFeedback("炮弹飞过 · 未命中", "#eadba7");
        continue;
      }
      bullet.px = bullet.x;
      bullet.py = bullet.y;
      bullet.pz = bullet.z;
      bullet.x += bullet.vx * dt;
      bullet.y += bullet.vy * dt;
      bullet.z += bullet.vz * dt;
      if (bullet.x < -20 || bullet.y < -20 || bullet.x > WORLD.width + 20 || bullet.y > WORLD.height + 20) {
        bullet.alive = false;
        if (bullet.isPlayer) showShotFeedback("炮弹飞出战场 · 未命中", "#eadba7");
        continue;
      }
      if (bullet.z <= 0) {
        bullet.alive = false;
        addBurst(bullet.x, bullet.y, "#b59b69", 14, 110);
        AudioFx.hit("front");
        if (bullet.isPlayer) showShotFeedback("炮弹打进地面 · 未命中", "#e5c98b");
        continue;
      }
      let nearestT = 1;
      let hitType = null;
      let hitTarget = null;
      const playerPassDistance = (!bullet.isPlayer && player && player.alive)
        ? pointSegmentDistance(player.x, player.y, bullet.px, bullet.py, bullet.x, bullet.y)
        : Infinity;
      for (const obstacle of obstacles) {
        if (obstacle.destroyed || !obstacle.blocks) continue;
        const t = segmentRectHit(bullet.px, bullet.py, bullet.x, bullet.y, obstacle);
        const impactZ = lerp(bullet.pz, bullet.z, t === null ? 0 : t);
        const obstacleBaseHeight = obstacle.meta ? obstacle.meta.height : 70;
        const obstacleHeight = obstacleBaseHeight * (OBSTACLE_HEIGHT_FACTOR[obstacle.type] || 0.9);
        if (t !== null && t < nearestT && impactZ >= 0 && impactZ <= obstacleHeight) {
          nearestT = t;
          hitType = "obstacle";
          hitTarget = obstacle;
        }
      }
      for (const tank of [player, ...enemies]) {
        if (!tank || !tank.alive || tank === bullet.owner) continue;
        const t = segmentCircleHit(bullet.px, bullet.py, bullet.x, bullet.y, tank.x, tank.y, tank.radius);
        const impactZ = lerp(bullet.pz, bullet.z, t === null ? 0 : t);
        if (t !== null && t < nearestT && impactZ >= 0 && impactZ <= 72) {
          nearestT = t;
          hitType = bullet.owner && bullet.owner.isPlayer === tank.isPlayer ? "friendly-tank" : "tank";
          hitTarget = tank;
        }
      }
      if (hitType) {
        bullet.x = lerp(bullet.px, bullet.x, nearestT);
        bullet.y = lerp(bullet.py, bullet.y, nearestT);
        bullet.z = lerp(bullet.pz, bullet.z, nearestT);
        bullet.alive = false;
        if (hitType === "obstacle") damageObstacle(hitTarget, bullet);
        else if (hitType === "tank") damageTank(hitTarget, bullet);
        else {
          addBurst(bullet.x, bullet.y, "#d9d0ad", 8, 90);
          AudioFx.hit("front");
          if (bullet.isPlayer) showShotFeedback("友军车体挡住炮弹", "#ffd178");
        }
      } else if (
        !bullet.isPlayer &&
        !bullet.nearMissPlayed &&
        playerPassDistance < player.radius + 34
      ) {
        bullet.nearMissPlayed = true;
        AudioFx.whoosh();
        screenShake = Math.max(screenShake, 1.8);
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
    cockpitMuzzleFlash = Math.max(0, cockpitMuzzleFlash - dt * 6);
    if (shotFeedback) {
      shotFeedback.life = Math.max(0, shotFeedback.life - dt);
      if (shotFeedback.life === 0) shotFeedback = null;
    }
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
    return tryFire(player);
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
          firePlayer();
        } else if (event.button === 2) {
          player.aiming = true;
          updateHud();
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
      const lookScale = player.aiming ? AIM_MOUSE_SCALE : 1;
      if (document.pointerLockElement === canvas) {
        player.turretAngle = normalizeAngle(player.turretAngle + event.movementX * MOUSE_SENSITIVITY * lookScale);
        player.pitch = clamp(
          player.pitch - event.movementY * MOUSE_SENSITIVITY * 0.72 * lookScale,
          -PITCH_LIMIT,
          PITCH_LIMIT
        );
      } else if (mouseDragging) {
        const dx = event.clientX - lastPointerX;
        const dy = event.clientY - lastPointerY;
        player.turretAngle = normalizeAngle(player.turretAngle + dx * MOUSE_SENSITIVITY * lookScale);
        player.pitch = clamp(
          player.pitch - dy * MOUSE_SENSITIVITY * 0.72 * lookScale,
          -PITCH_LIMIT,
          PITCH_LIMIT
        );
        lastPointerX = event.clientX;
        lastPointerY = event.clientY;
      }
    }, { passive: false });

    const endPointer = (event) => {
      if (event.pointerType === "mouse" || event.pointerType === "pen") {
        mouseDragging = false;
        if (event.button === 2 && player) player.aiming = false;
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
    window.addEventListener("pointerup", (event) => {
      mouseDragging = false;
      if (event.button === 2 && player) player.aiming = false;
    });
    canvas.addEventListener("contextmenu", (event) => event.preventDefault());

    window.addEventListener("keydown", (event) => {
      const key = event.key.toLowerCase();
      if (["w", "a", "s", "d", "q", "e", "r", " ", "arrowup", "arrowdown", "arrowleft", "arrowright", "escape"].includes(key)) {
        if (state === "playing" || key === "escape") event.preventDefault();
      }
      AudioFx.unlock();
      keys.add(key);
      if (key === "r" && state === "playing" && !locked) startReload(player);
      if (key === " " && !event.repeat && state === "playing" && !locked) firePlayer();
      if (key === "escape" && (state === "playing" || state === "paused")) togglePause();
    });
    window.addEventListener("keyup", (event) => {
      keys.delete(event.key.toLowerCase());
    });
    window.addEventListener("blur", () => {
      keys.clear();
      mouseDragging = false;
      if (player) player.aiming = false;
      if (state === "playing") pauseGame(true);
    });
    window.addEventListener("resize", updateCanvasFrame);
  };

  // ---------- 场景绘制 ----------
  const drawBackdrop = () => {
    const background = backdropImage(selectedBackdrop);
    if (background) {
      const imageHeight = VIEW_H + 32;
      const imageWidth = imageHeight * background.naturalWidth / background.naturalHeight;
      const period = imageWidth * 2;
      const yawNorm = ((player.turretAngle + Math.PI) % TAU + TAU) % TAU;
      const offset = -(yawNorm / TAU) * period;
      // 背景地平线与世界地面共用同一俯仰位移，避免上下瞄准时坦克脱离地面。
      const pitchShift = Math.tan(player.pitch) * currentFocal();
      ctx.fillStyle = "#8ca0a0";
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, VIEW_W, VIEW_H);
      ctx.clip();
      for (let i = -2; i <= 3; i += 1) {
        const x = offset + i * period;
        ctx.drawImage(background, x, -18 + pitchShift, imageWidth, imageHeight);
        ctx.save();
        ctx.translate(x + imageWidth * 2, -18 + pitchShift);
        ctx.scale(-1, 1);
        ctx.drawImage(background, 0, 0, imageWidth, imageHeight);
        ctx.restore();
      }
      ctx.restore();
      const atmospheric = ctx.createLinearGradient(0, 0, 0, VIEW_H);
      atmospheric.addColorStop(0, "rgba(48,62,58,.12)");
      atmospheric.addColorStop(0.62, "rgba(84,75,50,.04)");
      atmospheric.addColorStop(1, "rgba(13,20,12,.22)");
      ctx.fillStyle = atmospheric;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      return;
    }
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
      if (Math.abs(relative) > currentHalfFov() + 0.2) continue;
      const x = VIEW_W / 2 + Math.tan(relative) * currentFocal();
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

  const obstaclePattern = (obstacle, salt) => {
    let value = ((obstacle.id || 0) * 1103515245 + (salt || 0) * 12345) >>> 0;
    return () => {
      value = (value * 1664525 + 1013904223) >>> 0;
      return value / 4294967296;
    };
  };

  const drawConcreteBarrier = (obstacle, x, y, width, height, scale) => {
    const rand = obstaclePattern(obstacle, 11);
    const segments = width > 190 ? 3 : width > 95 ? 2 : 1;
    const segmentWidth = width / segments;
    for (let i = 0; i < segments; i += 1) {
      const left = x + i * segmentWidth + segmentWidth * 0.04;
      const right = x + (i + 1) * segmentWidth - segmentWidth * 0.04;
      const top = y + height * (0.22 + (i % 2) * 0.04);
      const base = projectionGround(obstacle, 0);
      ctx.fillStyle = "#777a73";
      ctx.beginPath();
      ctx.moveTo(left + segmentWidth * 0.16, top);
      ctx.lineTo(right - segmentWidth * 0.16, top);
      ctx.lineTo(right, base);
      ctx.lineTo(left, base);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "#b7b6aa";
      ctx.lineWidth = Math.max(1, 1.5 * scale);
      ctx.stroke();

      ctx.fillStyle = "rgba(224,222,207,.58)";
      ctx.beginPath();
      ctx.moveTo(left + segmentWidth * 0.16, top);
      ctx.lineTo(right - segmentWidth * 0.16, top);
      ctx.lineTo(right - segmentWidth * 0.23, y);
      ctx.lineTo(left + segmentWidth * 0.23, y);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "#585b56";
      ctx.lineWidth = Math.max(1, scale);
      ctx.beginPath();
      ctx.moveTo(left + segmentWidth * 0.16, top);
      ctx.lineTo(left + segmentWidth * 0.23, y);
      ctx.moveTo(right - segmentWidth * 0.16, top);
      ctx.lineTo(right - segmentWidth * 0.23, y);
      ctx.stroke();

      const stripeY = base - height * 0.24;
      ctx.save();
      ctx.beginPath();
      ctx.rect(left + 2, stripeY, Math.max(4, right - left - 4), Math.max(3, height * 0.12));
      ctx.clip();
      ctx.fillStyle = "#d7b84f";
      ctx.fillRect(left, stripeY, right - left, Math.max(3, height * 0.12));
      ctx.strokeStyle = "#3c3b32";
      ctx.lineWidth = Math.max(2, 4 * scale);
      for (let sx = left - 20; sx < right + 20; sx += Math.max(10, 20 * scale)) {
        ctx.beginPath();
        ctx.moveTo(sx, stripeY + height * 0.13);
        ctx.lineTo(sx + height * 0.13, stripeY);
        ctx.stroke();
      }
      ctx.restore();

      ctx.strokeStyle = "#4f524d";
      ctx.lineWidth = Math.max(1, 1.5 * scale);
      ctx.beginPath();
      ctx.moveTo(left + segmentWidth * 0.52, top + height * 0.1);
      ctx.lineTo(left + segmentWidth * 0.42, top + height * 0.34);
      ctx.lineTo(left + segmentWidth * 0.56, top + height * 0.52);
      if (rand() > 0.45) {
        ctx.moveTo(right - segmentWidth * 0.3, top + height * 0.18);
        ctx.lineTo(right - segmentWidth * 0.38, top + height * 0.42);
      }
      ctx.stroke();

      ctx.strokeStyle = "rgba(76,72,61,.85)";
      ctx.lineWidth = Math.max(1, 1.2 * scale);
      ctx.beginPath();
      ctx.moveTo(left + segmentWidth * 0.25, y);
      ctx.lineTo(left + segmentWidth * 0.18, y - 7 * scale);
      ctx.moveTo(right - segmentWidth * 0.22, y);
      ctx.lineTo(right - segmentWidth * 0.15, y - 7 * scale);
      ctx.stroke();
    }
  };

  const drawSandbagWall = (obstacle, x, y, width, height, scale) => {
    const rand = obstaclePattern(obstacle, 23);
    const bagHeight = clamp(21 * scale, 10, 36);
    const bagWidth = clamp(bagHeight * 1.7, 20, 62);
    const rows = Math.max(1, Math.ceil(height / bagHeight));
    const cols = Math.max(2, Math.ceil(width / bagWidth));
    const damage = obstacle.maxHp ? 1 - clamp(obstacle.hp / obstacle.maxHp, 0, 1) : 0;
    ctx.save();
    for (let row = rows - 1; row >= 0; row -= 1) {
      const offset = row % 2 === 0 ? -bagWidth * 0.18 : bagWidth * 0.18;
      for (let col = -1; col <= cols; col += 1) {
        if (damage > 0.18 && rand() < damage * 0.48) continue;
        const bx = x + col * bagWidth + offset;
        const by = y + row * bagHeight;
        if (bx > x + width || bx + bagWidth < x) continue;
        const gradient = ctx.createLinearGradient(0, by, 0, by + bagHeight);
        gradient.addColorStop(0, "#c5a86a");
        gradient.addColorStop(0.35, "#a98a4f");
        gradient.addColorStop(1, "#735d36");
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.ellipse(bx + bagWidth * 0.48, by + bagHeight * 0.5, bagWidth * 0.5, bagHeight * 0.52, 0, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = "rgba(83,61,31,.78)";
        ctx.lineWidth = Math.max(1, 1.1 * scale);
        ctx.stroke();
        ctx.strokeStyle = "rgba(241,220,164,.5)";
        ctx.beginPath();
        ctx.arc(bx + bagWidth * 0.48, by + bagHeight * 0.35, bagWidth * 0.32, Math.PI * 1.08, Math.PI * 1.82);
        ctx.stroke();
        ctx.strokeStyle = "#6f5530";
        ctx.beginPath();
        ctx.moveTo(bx + bagWidth * 0.46, by + bagHeight * 0.16);
        ctx.lineTo(bx + bagWidth * 0.52, by + bagHeight * 0.78);
        ctx.stroke();
        ctx.fillStyle = "#5c4728";
        ctx.beginPath();
        ctx.arc(bx + bagWidth * 0.25, by + bagHeight * 0.43, Math.max(1, scale), 0, TAU);
        ctx.arc(bx + bagWidth * 0.7, by + bagHeight * 0.43, Math.max(1, scale), 0, TAU);
        ctx.fill();
      }
    }
    if (damage > 0.45) {
      ctx.fillStyle = "rgba(20,23,16,.56)";
      ctx.beginPath();
      ctx.ellipse(x + width * 0.62, y + height * 0.52, width * 0.1, height * 0.18, 0.2, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  };

  const drawWoodBarricade = (obstacle, x, y, width, height, scale) => {
    const rand = obstaclePattern(obstacle, 37);
    const damage = obstacle.maxHp ? 1 - clamp(obstacle.hp / obstacle.maxHp, 0, 1) : 0;
    const logs = width > height * 1.45 ? 3 : 2;
    const logHeight = height / logs;
    for (let row = 0; row < logs; row += 1) {
      const ly = y + row * logHeight + 1;
      const gradient = ctx.createLinearGradient(0, ly, 0, ly + logHeight);
      gradient.addColorStop(0, "#b07a43");
      gradient.addColorStop(0.4, "#8b582e");
      gradient.addColorStop(1, "#56351c");
      ctx.fillStyle = gradient;
      roundedRect(x + 3, ly, width - 6, Math.max(5, logHeight - 3), logHeight * 0.34);
      ctx.fill();
      ctx.strokeStyle = "#4f2e17";
      ctx.lineWidth = Math.max(1, 1.2 * scale);
      ctx.stroke();
      ctx.strokeStyle = "rgba(232,184,116,.46)";
      ctx.lineWidth = Math.max(1, 1.4 * scale);
      for (let grain = 0; grain < 3; grain += 1) {
        const gy = ly + logHeight * (0.28 + grain * 0.2);
        ctx.beginPath();
        ctx.moveTo(x + width * 0.08, gy);
        ctx.bezierCurveTo(
          x + width * (0.35 + rand() * 0.1),
          gy - logHeight * 0.08,
          x + width * (0.62 + rand() * 0.08),
          gy + logHeight * 0.08,
          x + width * 0.92,
          gy
        );
        ctx.stroke();
      }
      ctx.fillStyle = "#c08a52";
      ctx.beginPath();
      ctx.ellipse(x + 5, ly + logHeight * 0.46, Math.max(3, 5 * scale), Math.max(2, logHeight * 0.23), 0, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = "#6a4122";
      ctx.beginPath();
      ctx.ellipse(x + 5, ly + logHeight * 0.46, Math.max(1.5, 2.8 * scale), Math.max(1, logHeight * 0.12), 0, 0, TAU);
      ctx.stroke();
    }
    ctx.strokeStyle = "#5d351b";
    ctx.lineWidth = Math.max(2, 4 * scale);
    ctx.beginPath();
    ctx.moveTo(x + width * 0.14, y + height * 0.05);
    ctx.lineTo(x + width * 0.83, y + height * 0.92);
    ctx.moveTo(x + width * 0.86, y + height * 0.08);
    ctx.lineTo(x + width * 0.18, y + height * 0.9);
    ctx.stroke();
    if (damage > 0.35) {
      ctx.fillStyle = "rgba(27,20,12,.64)";
      ctx.beginPath();
      ctx.ellipse(x + width * 0.67, y + height * 0.52, width * 0.09, height * 0.18, -0.3, 0, TAU);
      ctx.fill();
    }
  };

  const drawEarthMound = (obstacle, x, y, width, height, scale) => {
    const rand = obstaclePattern(obstacle, 53);
    const damage = obstacle.maxHp ? 1 - clamp(obstacle.hp / obstacle.maxHp, 0, 1) : 0;
    const peakDrop = damage > 0.55 ? height * 0.18 : 0;
    const gradient = ctx.createLinearGradient(0, y, 0, y + height);
    gradient.addColorStop(0, "#b38b55");
    gradient.addColorStop(0.35, "#8c683d");
    gradient.addColorStop(1, "#563b23");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.moveTo(x, y + height);
    ctx.lineTo(x + width * 0.08, y + height * 0.62);
    ctx.bezierCurveTo(
      x + width * 0.24,
      y + height * 0.16 + peakDrop,
      x + width * 0.44,
      y + height * 0.04 + peakDrop,
      x + width * 0.58,
      y + height * 0.22 + peakDrop
    );
    ctx.bezierCurveTo(
      x + width * 0.78,
      y + height * 0.12,
      x + width * 0.93,
      y + height * 0.55,
      x + width,
      y + height
    );
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#c0a168", ctx.lineWidth = Math.max(1, 1.2 * scale);
    ctx.stroke();
    ctx.strokeStyle = "rgba(238,210,145,.44)";
    ctx.beginPath();
    ctx.moveTo(x + width * 0.14, y + height * 0.7);
    ctx.bezierCurveTo(x + width * 0.4, y + height * 0.45, x + width * 0.66, y + height * 0.45, x + width * 0.9, y + height * 0.7);
    ctx.stroke();
    ctx.fillStyle = "#5e7135";
    for (let i = 0; i < 14; i += 1) {
      const gx = x + width * (0.08 + rand() * 0.84);
      const gy = y + height * (0.16 + rand() * 0.24);
      ctx.beginPath();
      ctx.moveTo(gx, gy + 4 * scale);
      ctx.lineTo(gx - 2 * scale, gy - 5 * scale);
      ctx.lineTo(gx + 2 * scale, gy - 4 * scale);
      ctx.fill();
    }
    for (let i = 0; i < 18; i += 1) {
      const px = x + width * (0.12 + rand() * 0.76);
      const py = y + height * (0.42 + rand() * 0.48);
      ctx.fillStyle = rand() > 0.5 ? "#d0a769" : "#45311f";
      ctx.beginPath();
      ctx.arc(px, py, Math.max(1, scale * (0.8 + rand() * 1.4)), 0, TAU);
      ctx.fill();
    }
  };

  const drawWreck = (obstacle, x, y, width, height, scale) => {
    const rand = obstaclePattern(obstacle, 71);
    ctx.fillStyle = "rgba(12,14,11,.44)";
    ctx.beginPath();
    ctx.ellipse(x + width * 0.5, y + height * 0.96, width * 0.54, height * 0.12, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "#1f211d";
    ctx.beginPath();
    ctx.moveTo(x + width * 0.16, y + height * 0.42);
    ctx.lineTo(x + width * 0.31, y + height * 0.2);
    ctx.lineTo(x + width * 0.73, y + height * 0.22);
    ctx.lineTo(x + width * 0.9, y + height * 0.5);
    ctx.lineTo(x + width * 0.74, y + height * 0.78);
    ctx.lineTo(x + width * 0.22, y + height * 0.76);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#5d4d37";
    ctx.lineWidth = Math.max(1, 2 * scale);
    ctx.stroke();
    ctx.strokeStyle = "#080a08";
    ctx.lineWidth = Math.max(4, 9 * scale);
    ctx.beginPath();
    ctx.moveTo(x, y + height * 0.72);
    ctx.lineTo(x + width * 0.2, y + height * 0.56);
    ctx.moveTo(x + width * 0.8, y + height * 0.58);
    ctx.lineTo(x + width, y + height * 0.78);
    ctx.stroke();
    ctx.strokeStyle = "#4a3d2e";
    ctx.lineWidth = Math.max(2, 5 * scale);
    ctx.beginPath();
    ctx.moveTo(x + width * 0.21, y + height * 0.63);
    ctx.lineTo(x + width * 0.77, y + height * 0.37);
    ctx.stroke();
    ctx.fillStyle = "#31140e";
    ctx.beginPath();
    ctx.arc(x + width * 0.64, y + height * 0.39, Math.max(2, 5 * scale), 0, TAU);
    ctx.fill();
    for (let i = 0; i < 12; i += 1) {
      ctx.fillStyle = "#71533b";
      ctx.beginPath();
      ctx.arc(x + width * (0.13 + rand() * 0.74), y + height * (0.42 + rand() * 0.46), Math.max(1, scale), 0, TAU);
      ctx.fill();
    }
    ctx.strokeStyle = "rgba(110,118,107,.24)";
    ctx.lineWidth = Math.max(2, 7 * scale);
    ctx.beginPath();
    ctx.moveTo(x + width * 0.58, y + height * 0.28);
    ctx.bezierCurveTo(x + width * 0.65, y - height * 0.1, x + width * 0.7, y + height * 0.08, x + width * 0.74, y - height * 0.18);
    ctx.stroke();
  };

  const projectionGround = (obstacle, offset) => {
    const p = projectWorld(obstacle.x + obstacle.w / 2, obstacle.y + obstacle.h / 2, offset);
    return p ? p.groundY : VIEW_H;
  };

  const coverImages = new Map();
  const tankImages = new Map();
  const cockpitImages = new Map();

  const tankImage = (artId, view) => {
    const art = D.TANK_ART && D.TANK_ART[artId];
    const src = art && art[view];
    if (!src) return null;
    const key = artId + ":" + view;
    let image = tankImages.get(key);
    if (!image) {
      image = new Image();
      image.decoding = "async";
      image.src = src;
      tankImages.set(key, image);
    }
    return image.complete && image.naturalWidth ? image : null;
  };

  const backdropImage = (backdropId) => {
    const item = D.BACKDROPS && D.BACKDROPS[backdropId];
    if (!item) return null;
    let image = backdropImages.get(backdropId);
    if (!image) {
      image = new Image();
      image.decoding = "async";
      image.src = item.src;
      backdropImages.set(backdropId, image);
    }
    return image.complete && image.naturalWidth ? image : null;
  };

  const cockpitImage = () => {
    const art = D.COCKPIT_ART && D.COCKPIT_ART[player.type.artId];
    if (!art || !art.gunner) return null;
    let image = cockpitImages.get(player.type.artId);
    if (!image) {
      image = new Image();
      image.decoding = "async";
      image.src = art.gunner;
      cockpitImages.set(player.type.artId, image);
    }
    return image.complete && image.naturalWidth ? image : null;
  };

  const cockpitLayout = (image, art) => {
    const fitScale = Math.max(VIEW_W / image.naturalWidth, VIEW_H / image.naturalHeight);
    const scale = (art.screenScale || 1) * (player.aiming ? (art.aimScale || 1) : 1);
    const width = image.naturalWidth * fitScale * scale;
    const height = image.naturalHeight * fitScale * scale;
    return {
      x: (VIEW_W - width) / 2,
      y: 0,
      width,
      height
    };
  };

  const coverImage = (obstacle) => {
    const art = D.COVER_ART && D.COVER_ART[obstacle.type];
    if (!art) return null;
    const damaged = obstacle.hp !== null && obstacle.maxHp && obstacle.hp <= obstacle.maxHp * 0.55;
    const variant = obstacle.artVariant && art.variants ? art.variants[obstacle.artVariant] : "";
    const src = damaged && art.damaged ? art.damaged : (variant || art.normal);
    if (!src) return null;
    const key = obstacle.type + ":" + src;
    let image = coverImages.get(key);
    if (!image) {
      image = new Image();
      image.decoding = "async";
      image.src = src;
      coverImages.set(key, image);
    }
    return image.complete && image.naturalWidth ? image : null;
  };

  const drawBurningFx = (cx, top, width, height, seed = 0, intensity = 1) => {
    const time = performance.now() / 1000 + seed;
    const flameX = cx + Math.sin(time * 6.3) * width * 0.06;
    const flameY = top + height * 0.42;
    const radius = Math.max(7, width * 0.13);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < 3; i += 1) {
      const sway = Math.sin(time * (7.4 + i) + i * 1.9) * radius * 0.32;
      const flicker = 0.72 + Math.sin(time * (9 + i * 1.3)) * 0.2;
      const glow = ctx.createRadialGradient(
        flameX + sway,
        flameY - i * radius * 0.25,
        1,
        flameX + sway,
        flameY - i * radius * 0.25,
        radius * flicker
      );
      glow.addColorStop(0, "rgba(255,246,176," + (0.86 * intensity) + ")");
      glow.addColorStop(0.32, "rgba(255,145,42," + (0.7 * intensity) + ")");
      glow.addColorStop(1, "rgba(182,45,17,0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(flameX + sway, flameY - i * radius * 0.25, radius * flicker, 0, TAU);
      ctx.fill();
    }
    ctx.restore();

    ctx.save();
    for (let i = 0; i < 4; i += 1) {
      const rise = radius * (1.4 + i * 0.75);
      const drift = Math.sin(time * 1.8 + i * 1.4 + seed) * radius * 0.32;
      const smokeRadius = radius * (0.32 + i * 0.16);
      ctx.globalAlpha = (0.3 - i * 0.045) * intensity;
      ctx.fillStyle = i < 2 ? "#3c3328" : "#696356";
      ctx.beginPath();
      ctx.arc(flameX + drift, flameY - rise, smokeRadius, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  };

  const drawContactShadow = (cx, baseY, width, height, intensity = 1) => {
    const shadowWidth = Math.max(22, width * 0.9);
    const shadowHeight = Math.max(7, height * 0.18);
    ctx.save();
    ctx.globalCompositeOperation = "multiply";
    ctx.globalAlpha = 0.7 * intensity;
    ctx.fillStyle = "#4b412b";
    ctx.beginPath();
    ctx.moveTo(cx - width * 0.4, baseY - height * 0.04);
    ctx.lineTo(cx + width * 0.4, baseY - height * 0.04);
    ctx.lineTo(cx + width * 0.56, baseY + height * 0.09);
    ctx.lineTo(cx - width * 0.56, baseY + height * 0.09);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.translate(cx, baseY + 2);
    ctx.scale(1, shadowHeight / shadowWidth);
    const shadow = ctx.createRadialGradient(0, 0, 1, 0, 0, shadowWidth * 0.56);
    shadow.addColorStop(0, "rgba(5,8,5," + (0.96 * intensity) + ")");
    shadow.addColorStop(0.48, "rgba(14,17,11," + (0.72 * intensity) + ")");
    shadow.addColorStop(0.82, "rgba(48,44,28," + (0.28 * intensity) + ")");
    shadow.addColorStop(1, "rgba(48,44,28,0)");
    ctx.fillStyle = shadow;
    ctx.beginPath();
    ctx.arc(0, 0, shadowWidth * 0.56, 0, TAU);
    ctx.fill();
    ctx.restore();
  };

  const drawCastShadow = (cx, baseY, width, height, intensity = 1) => {
    ctx.save();
    ctx.globalCompositeOperation = "multiply";
    ctx.fillStyle = "rgba(17,20,13," + (0.42 * intensity) + ")";
    ctx.beginPath();
    ctx.moveTo(cx - width * 0.38, baseY - 1);
    ctx.lineTo(cx + width * 0.34, baseY + height * 0.02);
    ctx.quadraticCurveTo(
      cx + width * 0.72,
      baseY + height * 0.26,
      cx + width * 0.3,
      baseY + height * 0.42
    );
    ctx.lineTo(cx - width * 0.56, baseY + height * 0.2);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  };

  const drawObstacle = (obstacle, projection) => {
    const meta = D.OBSTACLE_TYPES[obstacle.type];
    const widthFactor = OBSTACLE_WIDTH_FACTOR[obstacle.type] || 0.78;
    const heightFactor = OBSTACLE_HEIGHT_FACTOR[obstacle.type] || 0.9;
    const width = clamp(Math.max(obstacle.w, obstacle.h) * projection.scale * widthFactor, 12, 340);
    const height = clamp(meta.height * projection.scale * heightFactor, 8, 300);
    const sprite = coverImage(obstacle);
    const spriteWidth = sprite
      ? clamp(height * (sprite.naturalWidth / sprite.naturalHeight), 12, 420)
      : width;
    const sink = Math.max(3, height * 0.16);
    const baseY = projection.groundY + sink;
    const x = projection.x - width / 2;
    const y = baseY - height;
    ctx.save();
    drawCastShadow(projection.x, projection.groundY + 1, spriteWidth, height, 0.8);
    drawContactShadow(projection.x, projection.groundY + 2, spriteWidth, height, 0.92);
    if (sprite) {
      ctx.drawImage(sprite, projection.x - spriteWidth / 2, y, spriteWidth, height);
    } else if (obstacle.type === "concrete") drawConcreteBarrier(obstacle, x, y, width, height, projection.scale);
    else if (obstacle.type === "sandbag") drawSandbagWall(obstacle, x, y, width, height, projection.scale);
    else if (obstacle.type === "wood") drawWoodBarricade(obstacle, x, y, width, height, projection.scale);
    else if (obstacle.type === "earth") drawEarthMound(obstacle, x, y, width, height, projection.scale);
    else if (obstacle.type === "wreck") drawWreck(obstacle, x, y, width, height, projection.scale);
    const contact = ctx.createLinearGradient(0, baseY - height * 0.2, 0, baseY + 4);
    contact.addColorStop(0, "rgba(33,30,20,0)");
    contact.addColorStop(0.7, "rgba(37,32,20,.18)");
    contact.addColorStop(1, "rgba(20,18,12,.5)");
    ctx.fillStyle = contact;
    ctx.fillRect(projection.x - spriteWidth * 0.5, baseY - height * 0.2, spriteWidth, height * 0.2 + 5);
    if (sprite && obstacle.hp !== null && obstacle.maxHp && obstacle.hp < obstacle.maxHp) {
      const damage = 1 - clamp(obstacle.hp / obstacle.maxHp, 0, 1);
      ctx.strokeStyle = "rgba(37,28,17," + (0.35 + damage * 0.4) + ")";
      ctx.lineWidth = Math.max(1, 1.2 * projection.scale);
      for (let i = 0; i < 4; i += 1) {
        const crackX = projection.x + (i - 1.5) * spriteWidth * 0.14;
        const crackY = y + height * (0.38 + (i % 2) * 0.12);
        ctx.beginPath();
        ctx.moveTo(crackX, crackY);
        ctx.lineTo(crackX + spriteWidth * 0.04, crackY + height * 0.12);
        ctx.lineTo(crackX - spriteWidth * 0.025, crackY + height * 0.24);
        ctx.stroke();
      }
      if (damage > 0.55) {
        ctx.globalAlpha = Math.min(0.42, damage * 0.48);
        ctx.fillStyle = "#2f2518";
        ctx.beginPath();
        ctx.ellipse(
          projection.x + spriteWidth * 0.12,
          y + height * 0.62,
          spriteWidth * 0.13,
          height * 0.2,
          -0.25,
          0,
          TAU
        );
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
    if (obstacle.type === "wreck" && obstacle.burningUntil > performance.now()) {
      const remaining = clamp((obstacle.burningUntil - performance.now()) / 9000, 0, 1);
      const burnWidth = sprite ? clamp(height * (sprite.naturalWidth / sprite.naturalHeight), 12, 420) : width;
      drawBurningFx(projection.x, y + height * 0.1, burnWidth, height, obstacle.id.length, remaining);
    }
    if (obstacle.type === "wreck" && projection.depth < 1100) {
      ctx.fillStyle = "rgba(11,15,10,.76)";
      roundedRect(projection.x - 42, y - 24, 84, 18, 5);
      ctx.fill();
      ctx.fillStyle = "#e7cf9a";
      ctx.font = "700 10px -apple-system,'PingFang SC',sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("烧毁残骸", projection.x, y - 11);
      ctx.textAlign = "left";
    }
    if (obstacle.hitFlash > 0) {
      ctx.globalAlpha = obstacle.hitFlash * 0.34;
      ctx.fillStyle = "#fff0b0";
      const flashWidth = sprite ? clamp(height * (sprite.naturalWidth / sprite.naturalHeight), 12, 420) : width;
      roundedRect(projection.x - flashWidth / 2, y, flashWidth, height, 4);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    if (obstacle.hp !== null && obstacle.maxHp && obstacle.hp < obstacle.maxHp) {
      const p = clamp(obstacle.hp / obstacle.maxHp, 0, 1);
      const barWidth = sprite ? clamp(height * (sprite.naturalWidth / sprite.naturalHeight), 12, 420) : width;
      const barX = projection.x - barWidth / 2;
      ctx.fillStyle = "rgba(16,20,13,.72)";
      ctx.fillRect(barX, y - 8, barWidth, 5);
      ctx.fillStyle = p > 0.45 ? "#d4b66a" : "#d56b4d";
      ctx.fillRect(barX, y - 8, barWidth * p, 5);
    }
    ctx.restore();
  };

  const drawTankGrounding = (cx, baseY, width, height, alpha = 1) => {
    drawCastShadow(cx, baseY + 1, width * 1.12, height, alpha * 0.9);
    drawContactShadow(cx, baseY + 2, width * 1.18, height, alpha);

    ctx.save();
    ctx.globalAlpha = alpha * 0.9;
    ctx.fillStyle = "rgba(8,11,8,.78)";
    ctx.beginPath();
    ctx.ellipse(cx - width * 0.27, baseY + 1, width * 0.23, Math.max(3, height * 0.045), 0, 0, TAU);
    ctx.ellipse(cx + width * 0.27, baseY + 1, width * 0.23, Math.max(3, height * 0.045), 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  };

  const drawVectorEnemy = (enemy, projection) => {
    const scale = projection.scale;
    const width = clamp(enemy.type.hullWidth * 1.65 * scale, 12, VIEW_W);
    const height = clamp(70 * scale, 10, VIEW_H);
    const cx = projection.x;
    const baseY = projection.groundY;
    const top = baseY - height;
    ctx.save();
    const alpha = clamp(1.25 - projection.depth / 2300, 0.52, 1);
    ctx.globalAlpha = alpha;
    drawTankGrounding(cx, baseY, width, height, alpha);

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
    if (enemy.burning) {
      const age = clamp((performance.now() - enemy.burnStartedAt) / 600, 0, 1);
      drawBurningFx(cx, top, width, height, enemy.id.length, age);
    }
    ctx.restore();
  };

  const enemySpriteViewFor = (enemy, playerX, playerY) => {
    const towardPlayer = Math.atan2(playerY - enemy.y, playerX - enemy.x);
    const relative = angleDelta(enemy.angle, towardPlayer);
    const absolute = Math.abs(relative);
    let view = "side";
    if (absolute < Math.PI / 3) view = "front";
    else if (absolute > Math.PI * 0.66) view = "rear";
    return { view, mirror: relative > 0 };
  };

  const enemySpriteView = (enemy) => {
    if (!player) return { view: "front", mirror: false };
    return enemySpriteViewFor(enemy, player.x, player.y);
  };

  const drawEnemy = (enemy, projection) => {
    const selection = enemySpriteView(enemy);
    const sprite = tankImage(enemy.type.artId, selection.view);
    if (!sprite) {
      drawVectorEnemy(enemy, projection);
      return;
    }
    const height = clamp(70 * projection.scale, 14, VIEW_H * 0.72);
    const width = clamp(height * sprite.naturalWidth / sprite.naturalHeight, 12, VIEW_W * 0.7);
    const cx = projection.x;
    const baseY = projection.groundY;
    const atmospheric = clamp((projection.depth - 220) / 520, 0, 1);
    ctx.save();
    const alpha = clamp(1.2 - projection.depth / 2600, 0.6, 1);
    ctx.globalAlpha = alpha;
    drawTankGrounding(cx, baseY, width, height, alpha);
    ctx.imageSmoothingQuality = "high";
    if ("filter" in ctx) {
      ctx.filter = "brightness(" + (1 - atmospheric * 0.16).toFixed(2) + ") " +
        "saturate(" + (1 - atmospheric * 0.24).toFixed(2) + ") " +
        "contrast(" + (1 - atmospheric * 0.07).toFixed(2) + ")";
    }
    const sink = Math.max(4, height * 0.16);
    if (selection.mirror) {
      ctx.translate(cx, baseY);
      ctx.scale(-1, 1);
      ctx.drawImage(sprite, -width / 2, -height + sink, width, height);
    } else {
      ctx.drawImage(sprite, cx - width / 2, baseY - height + sink, width, height);
    }
    ctx.restore();

    const contact = ctx.createLinearGradient(0, baseY - height * 0.22, 0, baseY + 6);
    contact.addColorStop(0, "rgba(15,15,11,0)");
    contact.addColorStop(0.72, "rgba(15,15,11,.24)");
    contact.addColorStop(1, "rgba(10,12,9,.56)");
    ctx.fillStyle = contact;
    ctx.fillRect(cx - width * 0.44, baseY - height * 0.22, width * 0.88, height * 0.22 + 6);

    const muzzleWorldX = enemy.x + Math.cos(enemy.turretAngle) * enemy.type.barrelLength;
    const muzzleWorldY = enemy.y + Math.sin(enemy.turretAngle) * enemy.type.barrelLength;
    const muzzle = projectWorld(muzzleWorldX, muzzleWorldY, 43);
    if (muzzle) {
      ctx.strokeStyle = "rgba(36,38,30,.86)";
      ctx.lineWidth = clamp(8 * projection.scale, 2, 8);
      ctx.beginPath();
      ctx.moveTo(cx, baseY - height * 0.66);
      ctx.lineTo(muzzle.x, muzzle.y);
      ctx.stroke();
      ctx.strokeStyle = "rgba(225,208,151,.64)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cx, baseY - height * 0.68);
      ctx.lineTo(muzzle.x, muzzle.y - 1);
      ctx.stroke();
      ctx.fillStyle = "#171a15";
      ctx.beginPath();
      ctx.arc(muzzle.x, muzzle.y, clamp(4 * projection.scale, 2, 6), 0, TAU);
      ctx.fill();
      if (enemy.muzzleFlash > 0) {
        const alpha = clamp(enemy.muzzleFlash, 0, 1);
        const radius = clamp(18 * projection.scale, 8, 28);
        const glow = ctx.createRadialGradient(muzzle.x, muzzle.y, 1, muzzle.x, muzzle.y, radius);
        glow.addColorStop(0, "rgba(255,248,197," + alpha + ")");
        glow.addColorStop(0.28, "rgba(255,180,62," + alpha * 0.9 + ")");
        glow.addColorStop(1, "rgba(255,96,27,0)");
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(muzzle.x, muzzle.y, radius, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = "rgba(255,220,123," + alpha + ")";
        ctx.lineWidth = 1.5;
        for (let i = 0; i < 6; i += 1) {
          const angle = i / 6 * TAU;
          ctx.beginPath();
          ctx.moveTo(muzzle.x + Math.cos(angle) * 4, muzzle.y + Math.sin(angle) * 4);
          ctx.lineTo(muzzle.x + Math.cos(angle) * radius * 0.72, muzzle.y + Math.sin(angle) * radius * 0.72);
          ctx.stroke();
        }
      }
    }
    if (enemy.hitFlash > 0) {
      ctx.fillStyle = "rgba(255,239,174," + clamp(enemy.hitFlash * 0.35, 0, 0.35) + ")";
      ctx.fillRect(cx - width / 2, baseY - height, width, height);
    }
    if (enemy.burning) {
      const age = clamp((performance.now() - enemy.burnStartedAt) / 600, 0, 1);
      drawBurningFx(cx, baseY - height, width, height, enemy.id.length, age);
    }
    ctx.fillStyle = "rgba(231,185,96,.9)";
    ctx.beginPath();
    ctx.arc(cx, baseY - height - 12, 5, 0, TAU);
    ctx.fill();
    if (enemy.hp < enemy.maxHp) {
      const p = enemy.hp / enemy.maxHp;
      ctx.fillStyle = "rgba(10,14,9,.74)";
      ctx.fillRect(cx - width * 0.44, baseY - height - 25, width * 0.88, 6);
      ctx.fillStyle = p > 0.5 ? "#d9c66b" : "#e07354";
      ctx.fillRect(cx - width * 0.44, baseY - height - 25, width * 0.88 * p, 6);
    }
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
  };

  const drawFloats = () => {
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
      // 弹丸按真实俯仰高度投影，弹体朝向使用屏幕轨迹角，不能拿世界水平角硬转。
      const p = projectWorld(bullet.x, bullet.y, bullet.z);
      if (!p) continue;
      const previous = projectWorld(bullet.px, bullet.py, bullet.pz);
      if (previous) {
        const trailTone = bullet.isPlayer ? "214,190,132" : "189,139,84";
        for (let i = 1; i <= 3; i += 1) {
          const t = i * 0.16;
          const px = lerp(previous.x, p.x, 1 - t);
          const py = lerp(previous.y, p.y, 1 - t);
          ctx.fillStyle = "rgba(" + trailTone + "," + (0.16 - i * 0.035) + ")";
          ctx.beginPath();
          ctx.arc(px, py, clamp((2.4 + i) * p.scale, 1, 8), 0, TAU);
          ctx.fill();
        }
        ctx.strokeStyle = "rgba(" + trailTone + ",.32)";
        ctx.lineWidth = clamp(2.2 * p.scale, 1, 4);
        ctx.beginPath();
        ctx.moveTo(lerp(previous.x, p.x, 0.45), lerp(previous.y, p.y, 0.45));
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
      }
      const shellLength = clamp(25 * Math.sqrt(p.scale), 34, 88);
      const shellHeight = clamp(shellLength * 0.16, 4, 10);
      const angle = previous
        ? Math.atan2(p.y - previous.y, p.x - previous.x)
        : Math.atan2(bullet.vy, bullet.vx);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(angle);

      ctx.globalCompositeOperation = "lighter";
      const tracer = ctx.createLinearGradient(-shellLength * 2.15, 0, shellLength * 0.55, 0);
      tracer.addColorStop(0, "rgba(255,165,58,0)");
      tracer.addColorStop(0.48, bullet.isPlayer ? "rgba(255,204,104,.52)" : "rgba(255,133,55,.45)");
      tracer.addColorStop(0.82, "rgba(255,226,139,.28)");
      tracer.addColorStop(1, "rgba(255,236,174,.02)");
      ctx.fillStyle = tracer;
      ctx.beginPath();
      ctx.moveTo(-shellLength * 2.15, -shellHeight * 0.18);
      ctx.lineTo(shellLength * 0.55, -shellHeight * 0.24);
      ctx.lineTo(shellLength * 0.55, shellHeight * 0.24);
      ctx.lineTo(-shellLength * 2.15, shellHeight * 0.18);
      ctx.fill();

      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = bullet.isPlayer ? "#3c4743" : "#493d31";
      ctx.beginPath();
      ctx.moveTo(-shellLength * 0.5, -shellHeight * 1.55);
      ctx.lineTo(-shellLength * 0.3, -shellHeight * 0.55);
      ctx.lineTo(shellLength * 0.3, -shellHeight * 0.55);
      ctx.lineTo(shellLength * 0.5, 0);
      ctx.lineTo(shellLength * 0.3, shellHeight * 0.55);
      ctx.lineTo(-shellLength * 0.3, shellHeight * 0.55);
      ctx.lineTo(-shellLength * 0.5, shellHeight * 1.55);
      ctx.closePath();
      ctx.fill();

      const body = ctx.createLinearGradient(0, -shellHeight, 0, shellHeight);
      body.addColorStop(0, bullet.isPlayer ? "#c4ccc1" : "#c4aa7d");
      body.addColorStop(0.38, bullet.isPlayer ? "#7d8b80" : "#8d7352");
      body.addColorStop(1, bullet.isPlayer ? "#38443f" : "#47382a");
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.moveTo(shellLength * 0.5, 0);
      ctx.quadraticCurveTo(shellLength * 0.3, -shellHeight, -shellLength * 0.1, -shellHeight * 0.72);
      ctx.lineTo(-shellLength * 0.42, -shellHeight * 0.55);
      ctx.lineTo(-shellLength * 0.42, shellHeight * 0.55);
      ctx.lineTo(-shellLength * 0.1, shellHeight * 0.72);
      ctx.quadraticCurveTo(shellLength * 0.3, shellHeight, shellLength * 0.5, 0);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = bullet.isPlayer ? "#dba562" : "#f08d50";
      ctx.beginPath();
      ctx.moveTo(shellLength * 0.54, 0);
      ctx.lineTo(shellLength * 0.19, -shellHeight * 0.62);
      ctx.lineTo(shellLength * 0.1, shellHeight * 0.62);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = "rgba(255,248,210,.72)";
      ctx.lineWidth = Math.max(0.8, shellHeight * 0.18);
      ctx.beginPath();
      ctx.moveTo(-shellLength * 0.3, -shellHeight * 0.5);
      ctx.lineTo(shellLength * 0.27, -shellHeight * 0.18);
      ctx.stroke();

      ctx.strokeStyle = "rgba(255,250,214,.9)";
      ctx.lineWidth = Math.max(0.8, shellHeight * 0.22);
      ctx.beginPath();
      ctx.moveTo(-shellLength * 1.55, 0);
      ctx.lineTo(shellLength * 0.34, 0);
      ctx.stroke();

      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = bullet.isPlayer ? "rgba(255,225,128,.9)" : "rgba(255,145,63,.9)";
      ctx.beginPath();
      ctx.arc(-shellLength * 0.42, 0, Math.max(1.5, shellHeight * 0.55), 0, TAU);
      ctx.fill();
      ctx.restore();
    }
  };

  const drawWreckSmokeOverlay = () => {
    const now = performance.now();
    for (const obstacle of obstacles) {
      if (obstacle.type !== "wreck") continue;
      const p = projectWorld(obstacle.x + obstacle.w / 2, obstacle.y + obstacle.h / 2, 8);
      if (!p) continue;
      const scale = clamp(p.scale, 0.25, 3.2);
      const baseX = p.x;
      const baseY = p.groundY - 34 * scale;
      if (obstacle.burningUntil > now) {
        const remaining = clamp((obstacle.burningUntil - now) / 9000, 0, 1);
        for (let i = 0; i < 6; i += 1) {
          const phase = now / 1000 * 0.42 + i * 0.72 + obstacle.id.length * 0.13;
          const rise = i * 16 * scale + (phase % 1) * 12 * scale;
          const drift = Math.sin(phase * 1.7) * 7 * scale;
          const radius = (6 + i * 2.6) * scale;
          ctx.globalAlpha = remaining * (0.36 - i * 0.034);
          ctx.fillStyle = i < 2 ? "#27241f" : "#aaa69a";
          ctx.beginPath();
          ctx.arc(baseX + drift, baseY - rise, radius, 0, TAU);
          ctx.fill();
        }
      }
      if (p.depth < 1100) {
        ctx.globalAlpha = 0.92;
        ctx.fillStyle = "rgba(12,15,11,.82)";
        roundedRect(p.x - 44, baseY - 80 * scale, 88, 20, 5);
        ctx.fill();
        ctx.fillStyle = "#f0d39c";
        ctx.font = "700 10px -apple-system,'PingFang SC',sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("烧毁残骸", p.x, baseY - 66 * scale);
        ctx.textAlign = "left";
      }
    }
    ctx.globalAlpha = 1;
  };

  const drawFallbackCockpit = () => {
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

  const drawCockpitOverlay = () => {
    if (!player) return;
    const art = D.COCKPIT_ART && D.COCKPIT_ART[player.type.artId];
    const image = cockpitImage();
    if (!art || !image) {
      drawFallbackCockpit();
      return;
    }
    const frame = cockpitLayout(image, art);
    const { x, y, width, height } = frame;
    ctx.drawImage(image, x, y, width, height);

    if (cockpitMuzzleFlash > 0) {
      const mx = x + width * art.muzzleX;
      const my = y + height * art.muzzleY;
      const alpha = clamp(cockpitMuzzleFlash, 0, 1);
      const glow = ctx.createRadialGradient(mx, my, 2, mx, my, 36);
      glow.addColorStop(0, "rgba(255,250,205," + alpha + ")");
      glow.addColorStop(0.25, "rgba(255,190,80," + alpha * 0.9 + ")");
      glow.addColorStop(1, "rgba(255,110,35,0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(mx, my, 38, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,230,145," + alpha + ")";
      ctx.lineWidth = 2;
      for (let i = 0; i < 8; i += 1) {
        const angle = i / 8 * TAU;
        ctx.beginPath();
        ctx.moveTo(mx + Math.cos(angle) * 8, my + Math.sin(angle) * 8);
        ctx.lineTo(mx + Math.cos(angle) * (20 + alpha * 12), my + Math.sin(angle) * (20 + alpha * 12));
        ctx.stroke();
      }
    }
  };

  const drawAimOverlay = () => {
    if (!player || !player.aiming) return;
    const left = 176;
    const right = VIEW_W - 176;
    const top = 94;
    const bottom = VIEW_H - 112;
    ctx.save();
    const edge = ctx.createLinearGradient(0, 0, VIEW_W, 0);
    edge.addColorStop(0, "rgba(5,9,5,.22)");
    edge.addColorStop(0.17, "rgba(5,9,5,0)");
    edge.addColorStop(0.83, "rgba(5,9,5,0)");
    edge.addColorStop(1, "rgba(5,9,5,.22)");
    ctx.fillStyle = edge;
    ctx.fillRect(0, 62, VIEW_W, VIEW_H - 62);
    ctx.strokeStyle = "rgba(218,235,158,.66)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(left, top);
    ctx.lineTo(left, bottom);
    ctx.moveTo(right, top);
    ctx.lineTo(right, bottom);
    ctx.moveTo(left, top);
    ctx.lineTo(left + 42, top);
    ctx.moveTo(right, top);
    ctx.lineTo(right - 42, top);
    ctx.stroke();
    ctx.fillStyle = "rgba(9,15,8,.72)";
    roundedRect(VIEW_W / 2 - 76, 74, 152, 25, 7);
    ctx.fill();
    ctx.fillStyle = "#e3edac";
    ctx.font = "700 11px -apple-system,'PingFang SC',sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("炮长镜  " + AIM_ZOOM.toFixed(1) + "×", VIEW_W / 2, 91);
    ctx.textAlign = "left";
    ctx.restore();
  };

  const minimapPoint = (worldX, worldY) => {
    const cx = MINIMAP.x + MINIMAP.width / 2;
    const cy = MINIMAP.y + 78;
    const dx = worldX - player.x;
    const dy = worldY - player.y;
    const right = -dx * Math.sin(player.turretAngle) + dy * Math.cos(player.turretAngle);
    const forward = dx * Math.cos(player.turretAngle) + dy * Math.sin(player.turretAngle);
    const distance = Math.hypot(right, forward);
    const clampScale = distance > MINIMAP.worldRadius ? MINIMAP.worldRadius / distance : 1;
    return {
      x: cx + right * clampScale / MINIMAP.worldRadius * MINIMAP.radius,
      y: cy - forward * clampScale / MINIMAP.worldRadius * MINIMAP.radius,
      distance,
      inside: distance <= MINIMAP.worldRadius
    };
  };

  const drawMinimap = () => {
    if (!player) return;
    const cx = MINIMAP.x + MINIMAP.width / 2;
    const cy = MINIMAP.y + 78;
    ctx.save();
    ctx.fillStyle = "rgba(8,14,9,.84)";
    roundedRect(MINIMAP.x, MINIMAP.y, MINIMAP.width, MINIMAP.height, 14);
    ctx.fill();
    ctx.strokeStyle = "rgba(213,231,155,.32)";
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = "#dce8b4";
    ctx.font = "700 10px -apple-system,'PingFang SC',sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("战术雷达", MINIMAP.x + 10, MINIMAP.y + 16);
    ctx.fillStyle = "rgba(205,220,168,.62)";
    ctx.textAlign = "right";
    ctx.fillText("1500m", MINIMAP.x + MINIMAP.width - 10, MINIMAP.y + 16);

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, MINIMAP.radius, 0, TAU);
    ctx.clip();
    const radarGlow = ctx.createRadialGradient(cx, cy, 4, cx, cy, MINIMAP.radius);
    radarGlow.addColorStop(0, "rgba(78,104,57,.26)");
    radarGlow.addColorStop(1, "rgba(7,14,8,.2)");
    ctx.fillStyle = radarGlow;
    ctx.fillRect(cx - MINIMAP.radius, cy - MINIMAP.radius, MINIMAP.radius * 2, MINIMAP.radius * 2);

    ctx.strokeStyle = "rgba(210,227,165,.15)";
    ctx.lineWidth = 1;
    for (const factor of [1 / 3, 2 / 3, 1]) {
      ctx.beginPath();
      ctx.arc(cx, cy, MINIMAP.radius * factor, 0, TAU);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(cx - MINIMAP.radius, cy);
    ctx.lineTo(cx + MINIMAP.radius, cy);
    ctx.moveTo(cx, cy - MINIMAP.radius);
    ctx.lineTo(cx, cy + MINIMAP.radius);
    ctx.stroke();

    ctx.fillStyle = "rgba(128,139,116,.5)";
    for (const obstacle of obstacles) {
      if (obstacle.destroyed || !obstacle.blocks) continue;
      const point = minimapPoint(obstacle.x + obstacle.w / 2, obstacle.y + obstacle.h / 2);
      if (!point.inside) continue;
      const size = obstacle.type === "concrete" ? 3 : 2;
      ctx.fillStyle = obstacle.type === "wreck" ? "rgba(212,116,66,.92)" : "rgba(128,139,116,.5)";
      ctx.fillRect(point.x - size / 2, point.y - size / 2, size, size);
    }

    for (const enemy of enemies) {
      const point = minimapPoint(enemy.x, enemy.y);
      const relative = angleDelta(player.turretAngle, enemy.angle);
      const radius = point.inside && point.distance <= B.enemyRange ? 4.5 : 3;
      ctx.save();
      ctx.translate(point.x, point.y);
      ctx.rotate(relative);
      ctx.fillStyle = point.distance <= B.enemyRange ? "#ee7457" : "#8f8069";
      ctx.beginPath();
      ctx.moveTo(0, -radius);
      ctx.lineTo(radius * 0.75, radius * 0.72);
      ctx.lineTo(-radius * 0.75, radius * 0.72);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      if (enemy.burning) {
        ctx.strokeStyle = "rgba(255,151,66,.92)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(point.x, point.y, 6.5 + Math.sin(performance.now() / 140) * 1.2, 0, TAU);
        ctx.stroke();
      }
      if (enemy.muzzleFlash > 0) {
        ctx.strokeStyle = "rgba(255,190,85," + clamp(enemy.muzzleFlash, 0, 1) + ")";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(point.x, point.y, 7, 0, TAU);
        ctx.stroke();
      }
    }
    ctx.restore();

    ctx.strokeStyle = "rgba(226,239,179,.42)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, MINIMAP.radius, 0, TAU);
    ctx.stroke();

    const hullRelative = angleDelta(player.turretAngle, player.angle);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(hullRelative);
    ctx.fillStyle = "#d8c66f";
    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.lineTo(5.5, 5);
    ctx.lineTo(-5.5, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = "#e6f59a";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy + 2);
    ctx.lineTo(cx, cy - 10);
    ctx.stroke();

    ctx.fillStyle = "rgba(222,236,183,.72)";
    ctx.font = "700 9px -apple-system,'PingFang SC',sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("前", cx, cy - MINIMAP.radius + 11);
    ctx.fillText("后", cx, cy + MINIMAP.radius - 4);
    ctx.textAlign = "right";
    ctx.fillText("左", cx - MINIMAP.radius + 9, cy + 3);
    ctx.textAlign = "left";
    ctx.fillText("右", cx + MINIMAP.radius - 9, cy + 3);
    ctx.textAlign = "left";
    ctx.restore();
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
      const visibleHalf = currentHalfFov() * 180 / Math.PI;
      ctx.fillStyle = rel > -visibleHalf && rel < visibleHalf ? "#ef7660" : "#b99066";
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
      ctx.fillText(
        "虎式固定炮台" + (target.enemy.burning ? " · 起火" : "") + " · " + Math.round(p.distance) + " m",
        cx,
        cy + 51
      );
      ctx.textAlign = "left";
    }
    if (shotFeedback) {
      const alpha = clamp(shotFeedback.life / Math.min(0.32, shotFeedback.maxLife), 0, 1);
      ctx.globalAlpha = alpha;
      ctx.font = "700 12px -apple-system,'PingFang SC',sans-serif";
      const width = Math.max(150, ctx.measureText(shotFeedback.text).width + 28);
      ctx.fillStyle = "rgba(10,16,9,.78)";
      roundedRect(cx - width / 2, cy + 70, width, 28, 7);
      ctx.fill();
      ctx.fillStyle = shotFeedback.color;
      ctx.textAlign = "center";
      ctx.fillText(shotFeedback.text, cx, cy + 88);
      ctx.textAlign = "left";
      ctx.globalAlpha = 1;
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

  const drawJoystick = (stick, idle = false) => {
    if (!stick || (stick.id === null && !idle)) return;
    ctx.save();
    ctx.globalAlpha = idle ? 0.56 : 1;
    ctx.fillStyle = idle ? "rgba(10,17,8,.2)" : "rgba(10,17,8,.3)";
    ctx.strokeStyle = idle ? "rgba(230,241,183,.34)" : "rgba(230,241,183,.46)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(stick.baseX, stick.baseY, 64, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = idle ? "rgba(222,240,166,.24)" : "rgba(222,240,166,.42)";
    ctx.beginPath();
    ctx.arc(stick.baseX + stick.dx * 52, stick.baseY + stick.dy * 52, 23, 0, TAU);
    ctx.fill();
    if (idle) {
      ctx.fillStyle = "rgba(231,240,195,.7)";
      ctx.font = "700 11px -apple-system,'PingFang SC',sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("驾驶", stick.baseX, stick.baseY + 4);
      ctx.textAlign = "left";
    }
    ctx.restore();
  };

  const render = () => {
    if (!ctx || !player) return;
    const scaleX = canvas.width / VIEW_W;
    const scaleY = canvas.height / VIEW_H;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const shakeX = screenShake > 0 ? (Math.random() - 0.5) * screenShake : 0;
    const shakeY = screenShake > 0 ? (Math.random() - 0.5) * screenShake : 0;
    const chassisX = shakeX + hullBobX;
    const chassisY = shakeY + hullBobY + (player.recoil / 12) * 3.5;
    ctx.setTransform(scaleX, 0, 0, scaleY, chassisX * scaleX, chassisY * scaleY);
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
    drawWreckSmokeOverlay();
    drawBullets();
    drawWorldEffects();
    drawCockpitOverlay();
    drawFloats();
    ctx.setTransform(scaleX, 0, 0, scaleY, 0, 0);
    drawAimOverlay();
    drawCompass();
    drawMinimap();
    drawReticle();
    if (COARSE_POINTER || touches.left.id !== null) {
      const idleStick = touches.left.id === null
        ? { id: null, baseX: 176, baseY: VIEW_H - 118, dx: 0, dy: 0 }
        : touches.left;
      drawJoystick(idleStick, touches.left.id === null);
    }
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
    setText("hud-stage", currentLevel().label);
    setText("hud-score", String(score));
    setText("hud-combo", combo > 1 ? "×" + combo : "—");
    setText("hud-ammo", player.reload > 0 ? "装填 " + player.reload.toFixed(1) + "s" : "待发");
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
    setText("hud-pitch", Math.round(player.pitch * 180 / Math.PI) + "°");
    const motionElement = $("hud-motion");
    if (motionElement) {
      const speedPercent = Math.round(clamp(Math.abs(player.speed) / player.type.maxForward, 0, 1) * 100);
      const strafePercent = Math.round(clamp(Math.abs(player.strafeSpeed) / player.type.maxStrafe, 0, 1) * 100);
      const movingForward = Math.abs(player.speed) > 2.5;
      const strafing = Math.abs(player.strafeSpeed) > 2.5;
      const motionText = movingForward
        ? (player.speed > 0 ? "前进 " : "倒车 ") + speedPercent + "%"
        : (strafing ? (player.strafeSpeed > 0 ? "右移 " : "左移 ") + strafePercent + "%"
          : (hullTurnSignal > 0.08 ? "车体转向" : "静止"));
      motionElement.textContent = motionText;
      motionElement.classList.toggle("moving", movingForward || strafing || hullTurnSignal > 0.08);
    }
    AudioFx.setEngine(
      state === "playing" && !locked,
      Math.abs(player.speed) / player.type.maxForward,
      Math.max(Math.abs(player.strafeSpeed) / player.type.maxStrafe, hullTurnSignal * 0.55),
      Math.abs(player.throttleInput || 0)
    );
    setText("hud-zoom", player.aiming ? AIM_ZOOM.toFixed(1) + "×" : "1×");
    const syncLabel = $("sync-status");
    if (syncLabel) {
      if (typeof navigator !== "undefined" && navigator.onLine === false) syncLabel.textContent = "离线 · 本机存档";
      else if (Sync && Sync.loggedIn) syncLabel.textContent = "云同步已开启";
      else syncLabel.textContent = "本机存档 · 登录后云同步";
    }
  };

  const renderLevelSelect = () => {
    const host = $("level-select");
    if (!host) return;
    host.innerHTML = LEVELS.map((level, index) =>
      '<button class="level-chip' + (index === levelIndex ? " active" : "") +
      '" type="button" data-level="' + index + '">' +
        "<strong>" + level.label + " · " + level.title + "</strong>" +
        "<span>" + level.hint + "</span>" +
      "</button>"
    ).join("");
    host.querySelectorAll("[data-level]").forEach((button) => {
      button.addEventListener("click", () => selectLevel(Number(button.dataset.level)));
    });
  };

  const updateLevelUi = () => {
    const level = currentLevel();
    renderLevelSelect();
    setText("menu-level-title", level.title);
    setText("menu-level-intro", level.intro);
    setText("menu-enemy-count", String(level.enemyTotal));
    setText("btn-start-label", "开始" + level.label);
    setText("btn-start-note", level.title + " · " + level.enemyTotal + " 辆");
    setText("hud-stage", level.label);
  };

  const selectLevel = (index) => {
    if (!Number.isInteger(index) || !LEVELS[index]) return;
    levelIndex = index;
    if (state === "menu") resetBattle();
    else updateLevelUi();
    updateHud();
  };

  const updateMenuStats = () => {
    const data = Sync ? Sync.loadLocal() : saveData;
    if (!data) return;
    saveData = data;
    setText("menu-best", String(data.stats.bestScore || 0));
    setText("menu-kills", String(data.stats.totalKills || 0));
    setText("menu-wins", String(data.stats.wins || 0));
  };

  const preloadArtAssets = () => {
    for (const [tankId, views] of Object.entries(D.TANK_ART || {})) {
      for (const view of ["front", "side", "rear"]) tankImage(tankId, view);
    }
    for (const [type, art] of Object.entries(D.COVER_ART || {})) {
      if (art.normal) {
        const image = new Image();
        image.src = art.normal;
        coverImages.set(type + ":" + art.normal, image);
      }
      if (art.variants) {
        for (const src of Object.values(art.variants)) {
          const image = new Image();
          image.src = src;
          coverImages.set(type + ":" + src, image);
        }
      }
    }
    for (const id of Object.keys(D.BACKDROPS || {})) backdropImage(id);
    for (const [id, art] of Object.entries(D.COCKPIT_ART || {})) {
      if (!art.gunner) continue;
      const image = new Image();
      image.src = art.gunner;
      cockpitImages.set(id, image);
    }
  };

  const renderGallery = () => {
    const grid = $("tank-gallery-grid");
    if (grid) {
      grid.innerHTML = (D.TANK_CATALOG || []).map((tank) =>
        '<article class="tank-card">' +
          '<img src="' + tank.art + '" alt="' + tank.name + '" loading="lazy">' +
          '<div class="tank-card-copy"><strong>' + tank.name + "</strong><b>" + tank.status + "</b><span>" + tank.role + "</span></div>" +
        "</article>"
      ).join("");
    }
    const options = $("backdrop-options");
    if (options) {
      options.innerHTML = Object.entries(D.BACKDROPS || {}).map(([id, item]) =>
        '<button class="backdrop-chip' + (id === selectedBackdrop ? " active" : "") +
        '" type="button" data-backdrop="' + id + '">' + item.label + "</button>"
      ).join("");
      options.querySelectorAll("[data-backdrop]").forEach((button) => {
        button.addEventListener("click", () => {
          selectedBackdrop = button.dataset.backdrop || "europe";
          try {
            localStorage.setItem("dbtank-backdrop-v1", selectedBackdrop);
          } catch (e) {}
          backdropImage(selectedBackdrop);
          renderGallery();
        });
      });
    }
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
    const aim = $("mobile-aim");
    const hidden = state !== "playing" || locked;
    if (fire) fire.classList.toggle("hidden", hidden);
    if (aim) {
      aim.classList.toggle("hidden", hidden);
      aim.classList.toggle("active", !!(player && player.aiming));
      aim.textContent = player && player.aiming ? "收镜" : "瞄准";
      aim.setAttribute("aria-pressed", player && player.aiming ? "true" : "false");
    }
  };

  const showMenu = () => {
    state = "menu";
    lastBattleWon = false;
    keys.clear();
    AudioFx.setEngine(false);
    if (player) player.aiming = false;
    setOverlay("menu", true);
    setOverlay("pause-modal", false);
    setOverlay("result-modal", false);
    setOverlay("gallery-modal", false);
    updateMobileControls();
    updateMenuStats();
    updateHud();
    updateLevelUi();
  };

  const startBattle = (targetLevel = levelIndex) => {
    if (locked) {
      setOverlay("time-lock", true);
      return;
    }
    if (window.DaoBox && window.DaoBox.timeExceeded) {
      if (window.DaoBox.showQuotaModal) window.DaoBox.showQuotaModal(window.DaoBox.timeInfo);
      setOverlay("time-lock", true);
      return;
    }
    if (Number.isInteger(targetLevel) && LEVELS[targetLevel]) levelIndex = targetLevel;
    AudioFx.unlock();
    AudioFx.click();
    resetBattle();
    lastBattleWon = false;
    state = "playing";
    setOverlay("menu", false);
    setOverlay("pause-modal", false);
    setOverlay("result-modal", false);
    setOverlay("time-lock", false);
    setOverlay("gallery-modal", false);
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
    AudioFx.setEngine(false);
    keys.clear();
    if (player) player.aiming = false;
    if (document.pointerLockElement === canvas && document.exitPointerLock) document.exitPointerLock();
    setOverlay("pause-modal", true);
    const info = $("pause-info");
    const level = currentLevel();
    if (info) {
      info.textContent = automatic
        ? "页面切到后台，第一人称炮塔视角已冻结。"
        : level.label + " · " + level.title + "。战场已冻结，随时可以重新开始本关。";
    }
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
    lastBattleWon = won;
    state = "result";
    AudioFx.setEngine(false);
    battleEndedAt = performance.now();
    keys.clear();
    if (player) player.aiming = false;
    if (document.pointerLockElement === canvas && document.exitPointerLock) document.exitPointerLock();
    const duration = Math.max(1, Math.round((battleEndedAt - battleStartedAt) / 1000));
    const accuracy = shotsFired ? Math.round(shotsHit / shotsFired * 100) : 0;
    const result = {
      won,
      level: levelIndex + 1,
      score,
      kills,
      bestCombo: Math.max(combo, 1),
      duration,
      accuracy
    };
    saveData = Sync ? Sync.recordBattle(result) : saveData;
    const level = currentLevel();
    const hasNext = won && levelIndex < LEVELS.length - 1;
    setText("result-title", won ? (hasNext ? level.title + " 突破" : "战役完成") : "炮塔陷落");
    const badge = $("result-badge");
    if (badge) {
      badge.textContent = won ? "胜利" : "失败";
      badge.className = "result-badge " + (won ? "win" : "loss");
    }
    const html =
      '<div class="result-stats">' +
        '<div><span>击毁</span><strong>' + kills + " / " + level.enemyTotal + "</strong></div>" +
        '<div><span>战绩</span><strong>' + score + "</strong></div>" +
        '<div><span>最高连击</span><strong>×' + Math.max(combo, 1) + "</strong></div>" +
        '<div><span>命中率</span><strong>' + accuracy + "%</strong></div>" +
        '<div><span>用时</span><strong>' + duration + " 秒</strong></div>" +
      "</div>" +
      '<p class="result-note">' + (
        won
          ? (hasNext ? "本关敌军已清除。进入下一关后敌军和工事都会增加。" : "三关敌军全部清除，钢铁代差战役已完成。")
          : "固定炮台不会追击。可以重新开始本关，或用履带换位、掩体挡炮再寻找侧后装甲窗口。"
      ) + "</p>";
    const body = $("result-body");
    if (body) body.innerHTML = html;
    const nextButton = $("btn-next-level");
    if (nextButton) nextButton.classList.toggle("hidden", !hasNext);
    setText("btn-retry", won ? "再打本关" : "重新开始本关");
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
      AudioFx.setEngine(false);
      setOverlay("pause-modal", false);
    }
    if (player) player.aiming = false;
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
      navigator.serviceWorker.register("./service-worker.js?v=20").then((registration) => {
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
    $("btn-start")?.addEventListener("click", () => startBattle());
    $("btn-pause")?.addEventListener("click", () => pauseGame(false));
    $("btn-resume")?.addEventListener("click", resumeGame);
    $("btn-restart-level")?.addEventListener("click", () => startBattle(levelIndex));
    $("btn-pause-menu")?.addEventListener("click", showMenu);
    $("btn-retry")?.addEventListener("click", () => startBattle(levelIndex));
    $("btn-next-level")?.addEventListener("click", () => startBattle(levelIndex + 1));
    $("btn-result-menu")?.addEventListener("click", showMenu);
    $("btn-gallery")?.addEventListener("click", () => {
      renderGallery();
      setOverlay("gallery-modal", true);
    });
    $("btn-gallery-close")?.addEventListener("click", () => setOverlay("gallery-modal", false));
    $("btn-refresh")?.addEventListener("click", refreshApp);
    $("btn-mute")?.addEventListener("click", () => {
      muted = !muted;
      setText("btn-mute", muted ? "🔇" : "🔊");
      const muteButton = $("btn-mute");
      if (muteButton) {
        muteButton.setAttribute("aria-pressed", muted ? "true" : "false");
        muteButton.title = muted ? "声音已关闭" : "声音已开启";
      }
      saveData = Sync ? Sync.updateSettings({ muted }) : saveData;
      if (!muted) AudioFx.unlock();
      else AudioFx.setEngine(false);
      showToast(muted ? "声音已关闭" : "声音已开启", 1500);
    });
    const mobileFire = $("mobile-fire");
    if (mobileFire) {
      mobileFire.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        event.stopPropagation();
        firePlayer();
      });
      const release = (event) => {
        event.preventDefault();
        event.stopPropagation();
      };
      mobileFire.addEventListener("pointerup", release);
      mobileFire.addEventListener("pointercancel", release);
      mobileFire.addEventListener("pointerleave", release);
    }
    $("mobile-aim")?.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (!player || state !== "playing" || locked) return;
      player.aiming = !player.aiming;
      updateMobileControls();
      updateHud();
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
      if (document.visibilityState === "hidden" && state === "playing") pauseGame(true);
      if (document.visibilityState === "visible" && !muted) AudioFx.unlock();
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
    try {
      const storedBackdrop = localStorage.getItem("dbtank-backdrop-v1");
      if (storedBackdrop && D.BACKDROPS[storedBackdrop]) selectedBackdrop = storedBackdrop;
    } catch (e) {}
    preloadArtAssets();
    renderGallery();
    setText("app-version", APP_VERSION);
    setText("btn-mute", muted ? "🔇" : "🔊");
    const muteButton = $("btn-mute");
    if (muteButton) {
      muteButton.setAttribute("aria-pressed", muted ? "true" : "false");
      muteButton.title = muted ? "声音已关闭" : "声音已开启";
    }
    setText("bearing-help", COARSE_POINTER
      ? "左摇杆驾驶 · 右摇杆环视 · 左上战术雷达"
      : "W 前进 · S 倒车 · A/D 左右转 · Q/E 横移 · 鼠标环视");
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
      level: {
        index: levelIndex,
        label: currentLevel().label,
        title: currentLevel().title,
        enemyTotal: currentLevel().enemyTotal,
        obstacleTotal: obstacles.length
      },
      player: player ? {
        x: player.x,
        y: player.y,
        angle: player.angle,
        turretAngle: player.turretAngle,
        pitch: player.pitch,
        speed: player.speed,
        strafeSpeed: player.strafeSpeed,
        hullTurnSignal,
        aiming: player.aiming,
        zoom: player.aiming ? AIM_ZOOM : 1,
        hp: player.hp,
        ammo: player.ammo,
        reload: player.reload,
        shotsFired: player.shotsFired,
        muzzleFlash: player.muzzleFlash
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
        muzzleFlash: enemy.muzzleFlash,
        fixed: enemy.fixed,
        burning: enemy.burning
      })),
      visibleEnemyIds: visibleEnemies().map((enemy) => enemy.id),
      threatCompassCount: enemies.length,
      enemyRange: B.enemyRange,
      playerRange: B.playerRange,
      playerReload: B.playerReload,
      enemyReload: B.enemyReload,
      difficulty: {
        label: "新手",
        playerHp: B.playerHp,
        playerDamage: B.playerDamage,
        enemyDamage: B.enemyDamage,
        enemySpread: B.enemySpread
      },
      enemyCount: enemies.length,
      bullets: bullets.length,
      cockpitMuzzleFlash,
      shotFeedback: shotFeedback ? { ...shotFeedback } : null,
      audio: AudioFx.info(),
      backdrop: selectedBackdrop,
      backdropReady: !!backdropImage(selectedBackdrop),
      cockpitReady: !!cockpitImage(),
      enemyDistanceMin: enemies.length ? Math.min(...enemies.map((enemy) => distanceBetween(enemy, player))) : 0,
      enemyDistanceMax: enemies.length ? Math.max(...enemies.map((enemy) => distanceBetween(enemy, player))) : 0,
      kills,
      score,
      obstacles: obstacles.map((obstacle) => ({
        type: obstacle.type,
        hp: obstacle.hp,
        destroyed: obstacle.destroyed,
        sourceId: obstacle.sourceId || null,
        burning: obstacle.burningUntil > performance.now()
      }))
    }),
    startBattle,
    selectLevel,
    restartLevel: () => startBattle(levelIndex),
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
    setViewPitch: (angle) => {
      if (player) player.pitch = clamp(Number(angle) || 0, -PITCH_LIMIT, PITCH_LIMIT);
    },
    setAiming: (value) => {
      if (!player) return;
      player.aiming = !!value;
      updateMobileControls();
      updateHud();
    },
    setHullYaw: (angle) => {
      if (player) player.angle = normalizeAngle(Number(angle) || 0);
    },
    aimAt: (x, y) => {
      if (player) player.turretAngle = Math.atan2(y - player.y, x - player.x);
    },
    fire: () => firePlayer(),
    playNearMissSound: () => {
      AudioFx.whoosh();
      return AudioFx.info();
    },
    playRicochetSound: () => {
      AudioFx.ricochet();
      return AudioFx.info();
    },
    projectEnemy: (id) => {
      const enemy = enemies.find((item) => item.id === id);
      const p = enemy ? projectedEnemy(enemy) : null;
      return p ? {
        x: p.x,
        y: p.y,
        width: p.width,
        height: p.height,
        groundY: p.groundY,
        depth: p.depth,
        scale: p.scale
      } : null;
    },
    projectEyePoint: (x, y) => {
      const p = projectWorld(x, y, EYE_HEIGHT);
      return p ? { x: p.x, y: p.y, depth: p.depth, scale: p.scale } : null;
    },
    projectAimRayPoint: (distance) => {
      if (!player) return null;
      const z = EYE_HEIGHT + Math.tan(player.pitch) * distance;
      const p = projectWorld(
        player.x + Math.cos(player.turretAngle) * distance,
        player.y + Math.sin(player.turretAngle) * distance,
        z
      );
      return p ? { x: p.x, y: p.y, z, depth: p.depth, scale: p.scale } : null;
    },
    minimapInfo: () => ({
      visible: !!player,
      enemyCount: enemies.length,
      enemies: enemies.map((enemy) => {
        const point = minimapPoint(enemy.x, enemy.y);
        return {
          id: enemy.id,
          x: point.x,
          y: point.y,
          distance: point.distance,
          inside: point.inside
        };
      })
    }),
    movementHud: () => ({
      text: document.getElementById("hud-motion")?.textContent || "",
      active: !!document.getElementById("hud-motion")?.classList.contains("moving"),
      leftStickVisible: COARSE_POINTER && state === "playing" && !locked,
      leftStickBase: {
        x: 176,
        y: VIEW_H - 118
      },
      chassisBobX: hullBobX,
      chassisBobY: hullBobY
    }),
    enemySpriteView: (id) => {
      const enemy = enemies.find((item) => item.id === id);
      return enemy ? enemySpriteView(enemy) : null;
    },
    enemySpriteReady: (id) => {
      const enemy = enemies.find((item) => item.id === id);
      if (!enemy) return false;
      const selection = enemySpriteView(enemy);
      return !!tankImage(enemy.type.artId, selection.view);
    },
    cockpitInfo: () => {
      const art = player && D.COCKPIT_ART && D.COCKPIT_ART[player.type.artId];
      const image = cockpitImage();
      if (!art || !image) return { ready: false, source: art ? art.gunner : "" };
      const frame = cockpitLayout(image, art);
      const sourceX = clamp((VIEW_W / 2 - frame.x) / frame.width, 0, 1);
      const sourceY = clamp((VIEW_H / 2 - frame.y) / frame.height, 0, 1);
      const sample = document.createElement("canvas");
      sample.width = image.naturalWidth;
      sample.height = image.naturalHeight;
      const sampleCtx = sample.getContext("2d");
      sampleCtx.drawImage(image, 0, 0);
      const reticleAlpha = sampleCtx.getImageData(
        Math.min(image.naturalWidth - 1, Math.round(sourceX * image.naturalWidth)),
        Math.min(image.naturalHeight - 1, Math.round(sourceY * image.naturalHeight)),
        1,
        1
      ).data[3];
      return {
        ready: true,
        source: art.gunner,
        width: image.naturalWidth,
        height: image.naturalHeight,
        reticleAlpha,
        centerClear: reticleAlpha === 0,
        muzzleX: frame.x + frame.width * art.muzzleX,
        muzzleY: frame.y + frame.height * art.muzzleY,
        aimScale: player.aiming ? art.aimScale : 1
      };
    },
    enemySpriteViewAt: (id, x, y) => {
      const enemy = enemies.find((item) => item.id === id);
      return enemy ? enemySpriteViewFor(enemy, x, y) : null;
    },
    clearShotEnemyIds: () => enemies.filter((enemy) => {
      if (!player || !enemy.alive || distanceBetween(player, enemy) > B.playerRange) return false;
      const targetDistance = distanceBetween(player, enemy);
      const targetZ = EYE_HEIGHT + Math.tan(player.pitch) * targetDistance;
      if (targetZ < 0 || targetZ > 72) return false;
      const obstacleBlocked = obstacles.some((obstacle) => {
        if (obstacle.destroyed || !obstacle.blocks) return false;
        const t = segmentRectHit(player.x, player.y, enemy.x, enemy.y, obstacle);
        if (t === null) return false;
        const rayZ = EYE_HEIGHT + Math.tan(player.pitch) * targetDistance * t;
        const obstacleBaseHeight = obstacle.meta ? obstacle.meta.height : 70;
        const obstacleHeight = obstacleBaseHeight * (OBSTACLE_HEIGHT_FACTOR[obstacle.type] || 0.9);
        return rayZ >= 0 && rayZ <= obstacleHeight;
      });
      if (obstacleBlocked) return false;
      return !enemies.some((other) =>
        other !== enemy &&
        other.alive &&
        segmentCircleHit(player.x, player.y, enemy.x, enemy.y, other.x, other.y, other.radius) !== null
      );
    }).map((enemy) => enemy.id),
    enemyInRange: (id) => {
      const enemy = enemies.find((item) => item.id === id);
      return !!(enemy && player && distanceBetween(enemy, player) <= B.enemyRange);
    },
    shotClearanceForTest: (id) => {
      const enemy = enemies.find((item) => item.id === id);
      if (!enemy || !player) return null;
      const targetDistance = distanceBetween(player, enemy);
      const targetZ = EYE_HEIGHT + Math.tan(player.pitch) * targetDistance;
      return {
        targetZ,
        blockers: obstacles.map((obstacle) => {
          if (obstacle.destroyed || !obstacle.blocks) return null;
          const t = segmentRectHit(player.x, player.y, enemy.x, enemy.y, obstacle);
          if (t === null) return null;
          const rayZ = EYE_HEIGHT + Math.tan(player.pitch) * targetDistance * t;
          const obstacleBaseHeight = obstacle.meta ? obstacle.meta.height : 70;
          const height = obstacleBaseHeight * (OBSTACLE_HEIGHT_FACTOR[obstacle.type] || 0.9);
          return { type: obstacle.type, t, rayZ, height, blocked: rayZ >= 0 && rayZ <= height };
        }).filter(Boolean)
      };
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
    damageObstacleOfType: (type, damage = B.playerDamage) => {
      const target = obstacles.find((obstacle) =>
        obstacle.type === type &&
        obstacle.hp !== null &&
        !obstacle.destroyed
      );
      if (!target) return null;
      const before = target.hp;
      damageObstacle(target, {
        x: target.x + target.w / 2,
        y: target.y + target.h / 2,
        damage,
        isPlayer: true
      });
      return {
        type,
        before,
        after: target.hp,
        destroyed: target.destroyed,
        feedback: shotFeedback ? shotFeedback.text : ""
      };
    },
    hitFirstWreckForTest: () => {
      const before = obstacles.filter((obstacle) => obstacle.type === "wreck");
      const target = before[0];
      if (!target) return { before: 0, after: 0, destroyed: false, feedback: "" };
      damageObstacle(target, {
        x: target.x + target.w / 2,
        y: target.y + target.h / 2,
        damage: B.playerDamage,
        isPlayer: true
      });
      return {
        before: before.length,
        after: obstacles.filter((obstacle) => obstacle.type === "wreck").length,
        destroyed: target.destroyed,
        feedback: shotFeedback ? shotFeedback.text : ""
      };
    },
    damageEnemyForTest: (id, damage = 45) => {
      const target = enemies.find((enemy) => enemy.id === id);
      if (!target) return null;
      damageTank(target, {
        x: target.x,
        y: target.y,
        vx: Math.cos(target.angle) * B.bulletSpeed,
        vy: Math.sin(target.angle) * B.bulletSpeed,
        owner: player,
        isPlayer: true,
        damage
      });
      const remaining = enemies.find((enemy) => enemy.id === id);
      return {
        alive: !!remaining,
        burning: !!(remaining && remaining.burning),
        hp: remaining ? remaining.hp : 0,
        feedback: shotFeedback ? shotFeedback.text : "",
        wrecks: obstacles.filter((obstacle) => obstacle.type === "wreck" && obstacle.sourceId === id).length
      };
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

