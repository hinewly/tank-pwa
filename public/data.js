"use strict";

// 游戏数值集中在此，后续平衡只改参数，不把魔数散进渲染与 AI。
window.TankData = (() => {
  const BATTLE = {
    enemyTotal: 10,
    initialEnemies: 6,
    spawnDelay: 2.4,
    maxActiveEnemies: 8,
    playerHp: 100,
    enemyHp: 92,
    playerDamage: 42,
    enemyDamage: 30,
    magazineSize: 5,
    playerReload: 2.25,
    enemyReload: 3.05,
    fireCooldown: 0.16,
    bulletSpeed: 980,
    battleSoftCap: 480,
    comboWindow: 5.2,
    frontMultiplier: 0.65,
    sideMultiplier: 1,
    rearMultiplier: 1.45,
    frontRicochetChance: 0.12
  };

  const TANKS = {
    type99a: {
      id: "type99a",
      label: "99A 主战坦克",
      side: "cn",
      hullLength: 62,
      hullWidth: 42,
      turretLength: 23,
      barrelLength: 44,
      radius: 27,
      maxForward: 148,
      maxReverse: 76,
      acceleration: 210,
      brake: 280,
      hullTurnRate: 1.72,
      turretTurnRate: 2.15,
      colors: {
        body: "#405d3f",
        bodyDark: "#253d2a",
        bodyLight: "#6f8759",
        track: "#1d2720",
        trackLine: "#536548",
        accent: "#b7c884",
        barrel: "#2b3529"
      }
    },
    tiger: {
      id: "tiger",
      label: "虎式重型坦克",
      side: "enemy",
      hullLength: 66,
      hullWidth: 46,
      turretLength: 24,
      barrelLength: 46,
      radius: 29,
      maxForward: 112,
      maxReverse: 58,
      acceleration: 150,
      brake: 220,
      hullTurnRate: 1.35,
      turretTurnRate: 1.48,
      colors: {
        body: "#8b7149",
        bodyDark: "#57452c",
        bodyLight: "#b79a64",
        track: "#242522",
        trackLine: "#655d4d",
        accent: "#d6bd80",
        barrel: "#30302b"
      }
    }
  };

  const WORLD = {
    width: 2200,
    height: 1500,
    playerSpawn: { x: 360, y: 750, angle: 0 }
  };

  // 一张手工布置的草地战场：中央混凝土削弱直射，两翼留有绕后路线。
  const OBSTACLES = [
    { x: 690, y: 250, w: 64, h: 150, type: "concrete" },
    { x: 690, y: 1100, w: 64, h: 150, type: "concrete" },
    { x: 1010, y: 450, w: 200, h: 62, type: "concrete" },
    { x: 1010, y: 988, w: 200, h: 62, type: "concrete" },
    { x: 1300, y: 710, w: 72, h: 80, type: "concrete" },
    { x: 1780, y: 220, w: 80, h: 160, type: "concrete" },
    { x: 1780, y: 1120, w: 80, h: 160, type: "concrete" },

    { x: 435, y: 380, w: 125, h: 42, type: "wood" },
    { x: 435, y: 1078, w: 125, h: 42, type: "wood" },
    { x: 810, y: 600, w: 44, h: 118, type: "wood" },
    { x: 810, y: 780, w: 44, h: 118, type: "wood" },
    { x: 1170, y: 240, w: 150, h: 44, type: "wood" },
    { x: 1170, y: 1216, w: 150, h: 44, type: "wood" },
    { x: 1450, y: 520, w: 44, h: 140, type: "wood" },
    { x: 1450, y: 840, w: 44, h: 140, type: "wood" },
    { x: 1930, y: 620, w: 130, h: 42, type: "wood" },
    { x: 1930, y: 838, w: 130, h: 42, type: "wood" },

    { x: 585, y: 700, w: 130, h: 38, type: "sandbag" },
    { x: 585, y: 762, w: 130, h: 38, type: "sandbag" },
    { x: 985, y: 300, w: 38, h: 120, type: "sandbag" },
    { x: 985, y: 1080, w: 38, h: 120, type: "sandbag" },
    { x: 1600, y: 350, w: 120, h: 40, type: "sandbag" },
    { x: 1600, y: 1110, w: 120, h: 40, type: "sandbag" },
    { x: 1660, y: 700, w: 130, h: 38, type: "sandbag" },
    { x: 1660, y: 762, w: 130, h: 38, type: "sandbag" }
  ];

  const SPAWNS = [
    { x: 1100, y: 760 },
    { x: 1280, y: 360 },
    { x: 1280, y: 1160 },
    { x: 1620, y: 190 },
    { x: 1650, y: 1320 },
    { x: 1930, y: 760 },
    { x: 1980, y: 400 },
    { x: 1980, y: 1100 },
    { x: 1510, y: 700 },
    { x: 1500, y: 900 },
    { x: 1450, y: 220 },
    { x: 1450, y: 1280 }
  ];

  const OBSTACLE_TYPES = {
    concrete: {
      label: "混凝土",
      hp: null,
      destructible: false,
      fill: "#77776f",
      edge: "#aaa99d",
      pattern: "#5c5c55"
    },
    wood: {
      label: "木制掩体",
      hp: 58,
      destructible: true,
      fill: "#8a5a32",
      edge: "#b47b45",
      pattern: "#5d381d"
    },
    sandbag: {
      label: "沙袋",
      hp: 92,
      destructible: true,
      fill: "#9b8652",
      edge: "#c4ad72",
      pattern: "#75633a"
    },
    wreck: {
      label: "坦克残骸",
      hp: null,
      destructible: false,
      fill: "#252821",
      edge: "#5c5e52",
      pattern: "#11130f"
    }
  };

  const cloneObstacles = () => OBSTACLES.map((o) => ({ ...o }));
  const cloneSpawns = () => SPAWNS.map((s) => ({ ...s }));

  return {
    BATTLE,
    TANKS,
    WORLD,
    OBSTACLE_TYPES,
    cloneObstacles,
    cloneSpawns
  };
})();

