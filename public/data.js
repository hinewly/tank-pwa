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
    enemyRange: 1500,
    playerRange: 1500,
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
    width: 3000,
    height: 2600,
    playerSpawn: { x: 1500, y: 1300, angle: -Math.PI / 2 }
  };
  const OBSTACLE_OFFSET = { x: 400, y: 550 };

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
    // 北队 5 座：约 1080～1185m 外环，广角先侦察、3.2× 炮长镜再精打。
    { x: 600, y: 700 },
    { x: 950, y: 250 },
    { x: 1500, y: 150 },
    { x: 2050, y: 250 },
    { x: 2400, y: 700 },
    // 南队 5 座：与北队镜像布置，全部仍在 1500m 有效射程内。
    { x: 600, y: 1900 },
    { x: 950, y: 2350 },
    { x: 1500, y: 2450 },
    { x: 2050, y: 2350 },
    { x: 2400, y: 1900 }
  ];

  // 第一关使用独立稀疏工事：只保留少量可读掩体，避免新手在复杂地图中找不到目标。
  const LEVEL_ONE_OBSTACLES = [
    { x: 1260, y: 1120, w: 160, h: 40, type: "wood" },
    { x: 1660, y: 1080, w: 60, h: 140, type: "concrete" },
    { x: 1150, y: 1400, w: 130, h: 38, type: "earth" },
    { x: 1730, y: 1470, w: 180, h: 36, type: "sandbag" },
    { x: 1390, y: 1600, w: 150, h: 40, type: "wood" },
    { x: 1850, y: 1280, w: 40, h: 120, type: "concrete" }
  ];

  const LEVELS = [
    {
      id: "outpost",
      label: "第 1 关",
      title: "前哨接触",
      hint: "5 辆虎式 · 稀疏掩体 · 快速战斗",
      intro: "北侧前哨只有 5 辆虎式，掩体稀疏。先用宽视野找目标，再按右键开镜逐个清除。",
      enemyTotal: 5,
      spawns: [
        { x: 1000, y: 750 },
        { x: 1250, y: 520 },
        { x: 1500, y: 450 },
        { x: 1750, y: 520 },
        { x: 2000, y: 750 }
      ]
    },
    {
      id: "advance",
      label: "第 2 关",
      title: "装甲推进",
      hint: "8 辆虎式 · 半场工事 · 增加换位压力",
      intro: "敌军增加到 8 辆，掩体只保留约一半。利用混凝土挡炮，再寻找侧面或后部装甲窗口。",
      enemyTotal: 8,
      spawns: [
        { x: 700, y: 900 },
        { x: 1000, y: 500 },
        { x: 1500, y: 350 },
        { x: 2000, y: 500 },
        { x: 2300, y: 900 },
        { x: 1000, y: 1700 },
        { x: 1500, y: 2050 },
        { x: 2000, y: 1700 }
      ]
    },
    {
      id: "encirclement",
      label: "第 3 关",
      title: "十面合围",
      hint: "10 辆虎式 · 完整工事 · 最终合围",
      intro: "完整工事与 10 辆虎式同时启用。先侦察威胁方位，再用炮长镜、横移和残骸掩护完成清场。",
      enemyTotal: 10,
      spawns: SPAWNS
    }
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
      hp: 320,
      destructible: true,
      height: 44,
      fill: "#8a5a32",
      edge: "#b47b45",
      pattern: "#5d381d"
    },
    sandbag: {
      label: "沙袋",
      hp: 480,
      destructible: true,
      height: 30,
      fill: "#9b8652",
      edge: "#c4ad72",
      pattern: "#75633a"
    },
    earth: {
      label: "土堆",
      hp: 640,
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

  const cloneObstacles = (levelIndex = 2) => {
    if (levelIndex === 0) return LEVEL_ONE_OBSTACLES.map((o) => ({ ...o }));
    const source = levelIndex === 1
      ? OBSTACLES.filter((_, index) => index % 2 === 0)
      : OBSTACLES;
    return source.map((o) => ({
      ...o,
      x: o.x + OBSTACLE_OFFSET.x,
      y: o.y + OBSTACLE_OFFSET.y
    }));
  };
  const cloneSpawns = (levelIndex = 2) => {
    const level = LEVELS[levelIndex] || LEVELS[LEVELS.length - 1];
    return level.spawns.map((spawn) => ({ ...spawn }));
  };

  return {
    BATTLE,
    TANKS,
    WORLD,
    LEVELS,
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

