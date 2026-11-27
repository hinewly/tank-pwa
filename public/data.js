"use strict";

// 游戏数值集中在此，后续平衡只改参数，不把魔数散进渲染与炮台规则。
window.TankData = (() => {
  const BATTLE = {
    enemyTotal: 10,
    playerHp: 100,
    enemyHp: 92,
    playerDamage: 42,
    enemyDamage: 30,
    magazineSize: 5,
    playerReload: 2.25,
    enemyReload: 3.05,
    enemyRange: 920,
    enemyAimBias: 0.035,
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
    playerSpawn: { x: 1100, y: 750, angle: -Math.PI / 2 }
  };

  // 十面合围：中心留出机动空间，四周设可摧毁掩体、硬掩体和多条换位路线。
  const OBSTACLES = [
    // 中央四柱：近身安全角，同时保留十字机动通道。
    { x: 990, y: 610, w: 70, h: 60, type: "concrete" },
    { x: 1140, y: 610, w: 70, h: 60, type: "concrete" },
    { x: 990, y: 830, w: 70, h: 60, type: "concrete" },
    { x: 1140, y: 830, w: 70, h: 60, type: "concrete" },

    // 四向硬掩体，避免所有炮线都能直接穿过中心。
    { x: 760, y: 500, w: 60, h: 150, type: "concrete" },
    { x: 1380, y: 500, w: 60, h: 150, type: "concrete" },
    { x: 760, y: 850, w: 60, h: 150, type: "concrete" },
    { x: 1380, y: 850, w: 60, h: 150, type: "concrete" },
    { x: 560, y: 720, w: 120, h: 60, type: "concrete" },
    { x: 1520, y: 720, w: 120, h: 60, type: "concrete" },

    // 内圈木障会被持续炮火打穿，逼玩家换位。
    { x: 860, y: 600, w: 130, h: 40, type: "wood" },
    { x: 1210, y: 600, w: 130, h: 40, type: "wood" },
    { x: 860, y: 860, w: 130, h: 40, type: "wood" },
    { x: 1210, y: 860, w: 130, h: 40, type: "wood" },
    { x: 620, y: 520, w: 120, h: 40, type: "wood" },
    { x: 1460, y: 520, w: 120, h: 40, type: "wood" },
    { x: 620, y: 940, w: 120, h: 40, type: "wood" },
    { x: 1460, y: 940, w: 120, h: 40, type: "wood" },
    { x: 1280, y: 400, w: 110, h: 42, type: "wood" },
    { x: 1280, y: 1058, w: 110, h: 42, type: "wood" },
    { x: 540, y: 600, w: 40, h: 90, type: "wood" },
    { x: 1620, y: 600, w: 40, h: 90, type: "wood" },
    { x: 540, y: 810, w: 40, h: 90, type: "wood" },
    { x: 1620, y: 810, w: 40, h: 90, type: "wood" },

    // 中圈沙袋用于短时挡炮，摧毁后形成可穿行的新缺口。
    { x: 980, y: 460, w: 240, h: 36, type: "sandbag" },
    { x: 980, y: 1004, w: 240, h: 36, type: "sandbag" },
    { x: 700, y: 450, w: 120, h: 36, type: "sandbag" },
    { x: 1380, y: 450, w: 120, h: 36, type: "sandbag" },
    { x: 700, y: 1014, w: 120, h: 36, type: "sandbag" },
    { x: 1380, y: 1014, w: 120, h: 36, type: "sandbag" },
    { x: 500, y: 520, w: 36, h: 120, type: "sandbag" },
    { x: 1664, y: 520, w: 36, h: 120, type: "sandbag" },
    { x: 500, y: 860, w: 36, h: 120, type: "sandbag" },
    { x: 1664, y: 860, w: 36, h: 120, type: "sandbag" },
    { x: 860, y: 400, w: 100, h: 52, type: "earth" },
    { x: 820, y: 340, w: 100, h: 52, type: "earth" },
    { x: 860, y: 1048, w: 100, h: 52, type: "earth" }
  ];

  const SPAWNS = [
    // 北队 5 座：西翼、西北、正北、东北、东翼。
    { x: 560, y: 450 },
    { x: 820, y: 260 },
    { x: 1100, y: 190 },
    { x: 1380, y: 260 },
    { x: 1640, y: 450 },
    // 南队 5 座：西翼、西南、正南、东南、东翼。
    { x: 560, y: 1050 },
    { x: 820, y: 1240 },
    { x: 1100, y: 1310 },
    { x: 1380, y: 1240 },
    { x: 1640, y: 1050 }
  ];

  const OBSTACLE_TYPES = {
    concrete: {
      label: "混凝土",
      hp: null,
      destructible: false,
      height: 58,
      fill: "#77776f",
      edge: "#aaa99d",
      pattern: "#5c5c55"
    },
    wood: {
      label: "木制掩体",
      hp: 58,
      destructible: true,
      height: 44,
      fill: "#8a5a32",
      edge: "#b47b45",
      pattern: "#5d381d"
    },
    sandbag: {
      label: "沙袋",
      hp: 92,
      destructible: true,
      height: 30,
      fill: "#9b8652",
      edge: "#c4ad72",
      pattern: "#75633a"
    },
    earth: {
      label: "土堆",
      hp: 108,
      destructible: true,
      height: 38,
      fill: "#806039",
      edge: "#b18b52",
      pattern: "#5a4126"
    },
    wreck: {
      label: "坦克残骸",
      hp: null,
      destructible: false,
      height: 56,
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

