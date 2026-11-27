"use strict";

// 游戏数值集中在此，后续平衡只改参数，不把魔数散进渲染与炮台规则。
window.TankData = (() => {
  const BATTLE = {
    enemyTotal: 10,
    // 默认采用新手难度：玩家能承受多轮炮击，虎式首轮错峰且存在散布。
    playerHp: 180,
    enemyHp: 80,
    playerDamage: 80,
    enemyDamage: 10,
    // 坦克主炮单发制：每次击发后必须重新装填，按住开火键不会自动连发。
    magazineSize: 1,
    playerReload: 0.8,
    enemyReload: 5.2,
    enemyRange: 800,
    playerRange: 800,
    enemyAimBias: 0.065,
    enemySpread: 0.16,
    fireCooldown: 0.35,
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
      artId: "cn-99a",
      hullLength: 62,
      hullWidth: 42,
      turretLength: 23,
      barrelLength: 44,
      radius: 27,
      maxForward: 190,
      maxReverse: 100,
      maxStrafe: 92,
      acceleration: 320,
      brake: 430,
      strafeAcceleration: 280,
      hullTurnRate: 2.7,
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
      artId: "de-tiger",
      hullLength: 66,
      hullWidth: 46,
      turretLength: 24,
      barrelLength: 46,
      radius: 29,
      turretTurnRate: 0.72,
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
    { x: 560, y: 720, w: 120, h: 60, type: "concrete", artVariant: "stone" },
    { x: 1520, y: 720, w: 120, h: 60, type: "concrete" },

    // 内圈木障会被持续炮火打穿，逼玩家换位。
    { x: 860, y: 600, w: 130, h: 40, type: "wood" },
    { x: 1210, y: 600, w: 130, h: 40, type: "wood" },
    { x: 860, y: 860, w: 130, h: 40, type: "wood" },
    { x: 1210, y: 860, w: 130, h: 40, type: "wood" },
    { x: 620, y: 520, w: 120, h: 40, type: "wood" },
    { x: 1460, y: 520, w: 120, h: 40, type: "wood" },
    { x: 620, y: 940, w: 120, h: 40, type: "wood", artVariant: "fallen" },
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
    { x: 700, y: 1014, w: 120, h: 36, type: "sandbag", artVariant: "fort" },
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
    // 北队 5 座：把固定炮台拉到 700～754m 环带，留出观察和横向规避空间。
    { x: 400, y: 470 },
    { x: 620, y: 210 },
    { x: 1100, y: 50 },
    { x: 1580, y: 210 },
    { x: 1800, y: 470 },
    // 南队 5 座：与北队镜像布置，全部仍在 800m 有效射程内。
    { x: 400, y: 1030 },
    { x: 620, y: 1290 },
    { x: 1100, y: 1450 },
    { x: 1580, y: 1290 },
    { x: 1800, y: 1030 }
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

  // 正式素材。图片异常时游戏回退到 Canvas 矢量绘制。
  const COVER_ART = {
    concrete: {
      normal: "assets/covers/concrete.webp",
      damaged: "",
      aspect: 1.9,
      variants: { stone: "assets/cover-variants/stone-wall.webp" }
    },
    sandbag: {
      normal: "assets/covers/sandbag.webp",
      damaged: "",
      aspect: 2.0,
      variants: { fort: "assets/cover-variants/sandbag-fort.webp" }
    },
    wood: {
      normal: "assets/covers/wood.webp",
      damaged: "",
      aspect: 1.85,
      variants: { fallen: "assets/cover-variants/fallen-log.webp" }
    },
    earth: { normal: "assets/covers/earth.webp", damaged: "", aspect: 2.0 },
    wreck: {
      normal: "assets/wrecks/tank-wreck-side.webp",
      damaged: "",
      aspect: 1.9,
      variants: {
        front: "assets/wrecks/tank-wreck-front.webp",
        rear: "assets/wrecks/tank-wreck-rear.webp",
        alt: "assets/cover-variants/wreck-alt.webp"
      }
    }
  };

  const TANK_ART = {
    "cn-99a": {
      front: "assets/tanks/cn-99a-front.webp",
      side: "assets/tanks/cn-99a-side.webp",
      rear: "assets/tanks/cn-99a-rear.webp"
    },
    "ru-t90": {
      front: "assets/tanks/ru-t90-front.webp",
      side: "assets/tanks/ru-t90-side.webp",
      rear: "assets/tanks/ru-t90-rear.webp"
    },
    "us-m1a2": {
      front: "assets/tanks/us-m1a2-front.webp",
      side: "assets/tanks/us-m1a2-side.webp",
      rear: "assets/tanks/us-m1a2-rear.webp"
    },
    "jp-type97": {
      front: "assets/tanks/jp-type97-front.webp",
      side: "assets/tanks/jp-type97-side.webp",
      rear: "assets/tanks/jp-type97-rear.webp"
    },
    "us-sherman": {
      front: "assets/tanks/us-sherman-front.webp",
      side: "assets/tanks/us-sherman-side.webp",
      rear: "assets/tanks/us-sherman-rear.webp"
    },
    "de-tiger": {
      front: "assets/tanks/de-tiger-front.webp",
      side: "assets/tanks/de-tiger-side.webp",
      rear: "assets/tanks/de-tiger-rear.webp"
    }
  };

  const TANK_CATALOG = [
    { id: "cn-99a", name: "中国 99A", role: "我方", status: "当前主战", art: "assets/tanks/cn-99a-front.webp" },
    { id: "ru-t90", name: "俄罗斯 T-90", role: "我方", status: "后续可选", art: "assets/tanks/ru-t90-front.webp" },
    { id: "us-m1a2", name: "美国 M1A2", role: "我方", status: "后续可选", art: "assets/tanks/us-m1a2-front.webp" },
    { id: "de-tiger", name: "德国虎式", role: "敌方", status: "当前对手", art: "assets/tanks/de-tiger-front.webp" },
    { id: "us-sherman", name: "美国谢尔曼", role: "敌方", status: "后续可选", art: "assets/tanks/us-sherman-front.webp" },
    { id: "jp-type97", name: "日本 97 式", role: "敌方", status: "后续可选", art: "assets/tanks/jp-type97-front.webp" }
  ];

  const COCKPIT_ART = {
    "cn-99a": {
      gunner: "assets/cockpit/cn-99a-gunner.webp",
      aspect: 1364 / 768,
      screenScale: 1.28,
      aimScale: 1.035,
      muzzleX: 0.502,
      muzzleY: 0.457
    }
  };

  const BACKDROPS = {
    europe: { label: "欧洲战场", src: "assets/backdrops/europe.webp" },
    plain: { label: "开阔平原", src: "assets/backdrops/open-plain.webp" },
    desert: { label: "沙石荒漠", src: "assets/backdrops/desert.webp" },
    forest: { label: "稀疏林地", src: "assets/backdrops/sparse-forest.webp" }
  };

  const cloneObstacles = () => OBSTACLES.map((o) => ({ ...o }));
  const cloneSpawns = () => SPAWNS.map((s) => ({ ...s }));

  return {
    BATTLE,
    TANKS,
    WORLD,
    OBSTACLE_TYPES,
    COVER_ART,
    TANK_ART,
    TANK_CATALOG,
    COCKPIT_ART,
    BACKDROPS,
    cloneObstacles,
    cloneSpawns
  };
})();

