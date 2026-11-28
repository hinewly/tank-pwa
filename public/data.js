"use strict";

// 游戏数值集中在此，后续平衡只改参数，不把魔数散进渲染与炮台规则。
window.TankData = (() => {
  const BATTLE = {
    enemyTotal: 10,
    // 默认采用新手难度：玩家能承受多轮炮击，虎式首轮错峰且存在散布。
    playerHp: 180,
    enemyHp: 104,
    playerDamage: 80,
    enemyDamage: 10,
    // 坦克主炮单发制：每次击发后必须重新装填，按住开火键不会自动连发。
    magazineSize: 1,
    playerReload: 0.8,
    enemyReload: 5.2,
    enemyRange: 1300,
    playerRange: 2200,
    enemyAimBias: 0.065,
    enemySpread: 0.16,
    fireCooldown: 0.35,
    bulletSpeed: 1050,
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
      boostMultiplier: 1.28,
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
      shortLabel: "虎式",
      side: "enemy",
      artId: "de-tiger",
      hullLength: 66,
      hullWidth: 46,
      turretLength: 24,
      barrelLength: 46,
      radius: 29,
      turretTurnRate: 0.72,
      enemyHp: 104,
      enemyDamage: 10,
      enemyReload: 5.2,
      colors: {
        body: "#8b7149",
        bodyDark: "#57452c",
        bodyLight: "#b79a64",
        track: "#242522",
        trackLine: "#655d4d",
        accent: "#d6bd80",
        barrel: "#30302b"
      }
    },
    type97: {
      id: "type97",
      label: "日本 97 式中型坦克",
      shortLabel: "97 式",
      side: "enemy",
      artId: "jp-type97",
      hullLength: 55,
      hullWidth: 38,
      turretLength: 19,
      barrelLength: 38,
      radius: 25,
      turretTurnRate: 0.92,
      enemyHp: 48,
      enemyDamage: 7,
      enemyReload: 4.6,
      colors: {
        body: "#7b7451",
        bodyDark: "#4f4b35",
        bodyLight: "#a9a074",
        track: "#27261f",
        trackLine: "#625e4b",
        accent: "#c9bd80",
        barrel: "#343329"
      }
    },
    sherman: {
      id: "sherman",
      label: "美国谢尔曼中型坦克",
      shortLabel: "谢尔曼",
      side: "enemy",
      artId: "us-sherman",
      hullLength: 60,
      hullWidth: 42,
      turretLength: 21,
      barrelLength: 41,
      radius: 27,
      turretTurnRate: 0.82,
      enemyHp: 104,
      enemyDamage: 9,
      enemyReload: 4.9,
      colors: {
        body: "#626b48",
        bodyDark: "#3d442d",
        bodyLight: "#91986d",
        track: "#20231c",
        trackLine: "#58604a",
        accent: "#c6ca91",
        barrel: "#2d3327"
      }
    }
  };

  const WORLD = {
    width: 4400,
    height: 4000,
    playerSpawn: { x: 2200, y: 2000, angle: -Math.PI / 2 }
  };
  const SCENES = {
    europe: { label: "欧洲废墟", backdrop: "europe", groundTint: "rgba(77,85,53,.10)" },
    forest: { label: "稀疏森林", backdrop: "forest", groundTint: "rgba(35,64,38,.16)" },
    desert: { label: "沙石荒漠", backdrop: "desert", groundTint: "rgba(159,126,70,.10)" },
    plain: { label: "开阔平原", backdrop: "plain", groundTint: "rgba(111,119,67,.08)" },
    coast: { label: "海岸沙丘", backdrop: "desert", groundTint: "rgba(72,139,151,.12)", coast: true }
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

  const sceneRandom = (seed) => {
    let value = seed >>> 0;
    return () => {
      value = (value * 1664525 + 1013904223) >>> 0;
      return value / 4294967296;
    };
  };

  const shiftOldObstacles = (list) => list.map((obstacle) => ({
    ...obstacle,
    x: obstacle.x + 700,
    y: obstacle.y + 700
  }));

  const sceneCoverTypes = {
    europe: ["concrete", "wood", "sandbag", "earth"],
    forest: ["tree", "tree", "wood", "earth", "sandbag"],
    desert: ["concrete", "sandbag", "earth", "wood"],
    plain: ["sandbag", "earth", "wood", "concrete"],
    coast: ["wood", "sandbag", "concrete", "earth"]
  };

  const makeCoverField = (scene, count, seed) => {
    const rand = sceneRandom(seed);
    const types = sceneCoverTypes[scene] || sceneCoverTypes.europe;
    const center = WORLD.playerSpawn;
    return Array.from({ length: count }, (_, index) => {
      const angle = index / count * Math.PI * 2 + (rand() - 0.5) * 0.34;
      const radius = 300 + rand() * 920;
      const type = types[Math.floor(rand() * types.length)];
      const horizontal = rand() > 0.48;
      let w = 54 + Math.round(rand() * 86);
      let h = 34 + Math.round(rand() * 30);
      if (type === "tree") {
        w = 28;
        h = 28;
      } else if (type === "sandbag" || type === "earth") {
        w = Math.max(w, 74);
        h = Math.min(h, 42);
      }
      if (!horizontal) [w, h] = [h, w];
      return {
        x: Math.round(center.x + Math.cos(angle) * radius - w / 2),
        y: Math.round(center.y + Math.sin(angle) * radius - h / 2),
        w,
        h,
        type
      };
    });
  };

  const makeArcSpawns = (count, minDistance, maxDistance, centerAngle, spread, seed) => {
    const rand = sceneRandom(seed);
    const center = WORLD.playerSpawn;
    return Array.from({ length: count }, (_, index) => {
      const ratio = count === 1 ? 0.5 : (index + 0.5) / count;
      const angle = centerAngle + (ratio - 0.5) * spread + (rand() - 0.5) * 0.035;
      const radius = minDistance + rand() * (maxDistance - minDistance);
      return {
        x: Math.round(center.x + Math.cos(angle) * radius),
        y: Math.round(center.y + Math.sin(angle) * radius)
      };
    });
  };

  const LEVELS = [
    {
      id: "outpost",
      label: "第 1 关",
      title: "前哨接触",
      scene: "europe",
      enemyType: "tiger",
      hint: "欧洲废墟 · 5 辆虎式 · 近距离教学",
      intro: "欧洲前哨只有 5 辆虎式，掩体稀疏。先熟悉炮塔、履带和单发装填，再进入林地。",
      enemyTotal: 5,
      obstacles: [
        ...shiftOldObstacles(LEVEL_ONE_OBSTACLES),
        { x: 2170, y: 1510, w: 60, h: 140, type: "concrete" },
        { x: 1980, y: 1660, w: 160, h: 50, type: "concrete" }
      ],
      spawns: makeArcSpawns(5, 620, 820, -Math.PI / 2, 1.15, 101)
    },
    {
      id: "forest-edge",
      label: "第 2 关",
      title: "林缘伏击",
      scene: "forest",
      enemyType: "tiger",
      hint: "稀疏森林 · 6 辆虎式 · 树木与倒木",
      intro: "林缘出现 6 辆虎式，树干和倒木会切碎炮线。寻找树间缺口，再抬炮越过低矮工事。",
      enemyTotal: 6,
      obstacles: makeCoverField("forest", 11, 202),
      spawns: makeArcSpawns(6, 760, 960, -Math.PI / 2, 1.35, 102)
    },
    {
      id: "desert-ridge",
      label: "第 3 关",
      title: "沙脊推进",
      scene: "desert",
      enemyType: "tiger",
      hint: "沙石荒漠 · 7 辆虎式 · 中距离对射",
      intro: "荒漠视野开阔，7 辆虎式散布在沙脊后方。利用石墙挡炮，再绕到侧面。",
      enemyTotal: 7,
      obstacles: makeCoverField("desert", 13, 303),
      spawns: makeArcSpawns(7, 920, 1120, -Math.PI / 2, 1.5, 103)
    },
    {
      id: "plain-fire",
      label: "第 4 关",
      title: "平原火线",
      scene: "plain",
      enemyType: "tiger",
      hint: "开阔平原 · 8 辆虎式 · 远距标签",
      intro: "开阔平原没有天然遮挡，远距敌车会出现红色距离标签。开镜清除远端威胁，再向中心推进。",
      enemyTotal: 8,
      obstacles: makeCoverField("plain", 14, 404),
      spawns: makeArcSpawns(8, 1080, 1280, -Math.PI / 2, 1.8, 104)
    },
    {
      id: "coast-head",
      label: "第 5 关",
      title: "滩头铁幕",
      scene: "coast",
      enemyType: "tiger",
      hint: "海岸沙丘 · 9 辆虎式 · 德国战役终点",
      intro: "滩头沙丘与拒马形成多层火力线。9 辆虎式在海岸后方，先狙击外围再突破中央。",
      enemyTotal: 9,
      obstacles: makeCoverField("coast", 16, 505),
      spawns: makeArcSpawns(9, 1250, 1460, -Math.PI / 2, 2.2, 105)
    },
    {
      id: "palm-gap",
      label: "第 6 关",
      title: "椰林缺口",
      scene: "coast",
      enemyType: "type97",
      hint: "海岸沙丘 · 8 辆 97 式 · 一炮击毁",
      intro: "日本 97 式装甲较薄，正面通常一炮击毁。敌军数量减少，但炮塔转向更快。",
      enemyTotal: 8,
      obstacles: makeCoverField("coast", 15, 606),
      spawns: makeArcSpawns(8, 1350, 1580, -Math.PI / 2, 2.7, 106)
    },
    {
      id: "forest-crossfire",
      label: "第 7 关",
      title: "密林交叉火",
      scene: "forest",
      enemyType: "type97",
      hint: "稀疏森林 · 9 辆 97 式 · 树间穿插",
      intro: "树线变成交叉阵地，9 辆 97 式从林间缺口瞄准。利用树干遮挡，再快速探头开火。",
      enemyTotal: 9,
      obstacles: makeCoverField("forest", 18, 707),
      spawns: makeArcSpawns(9, 1400, 1650, -Math.PI / 2, 3, 107)
    },
    {
      id: "desert-ring",
      label: "第 8 关",
      title: "黄沙包围",
      scene: "desert",
      enemyType: "type97",
      hint: "沙石荒漠 · 10 辆 97 式 · 半环合围",
      intro: "97 式沿半环展开，红色标签会标出 1300m 外的安全狙击窗口。先远后近。",
      enemyTotal: 10,
      obstacles: makeCoverField("desert", 20, 808),
      spawns: makeArcSpawns(10, 1420, 1720, -Math.PI / 2, 3.4, 108)
    },
    {
      id: "sherman-line",
      label: "第 9 关",
      title: "谢尔曼阵线",
      scene: "europe",
      enemyType: "sherman",
      hint: "欧洲废墟 · 9 辆谢尔曼 · 正面通常两炮",
      intro: "谢尔曼正面装甲需要两炮，侧后仍是一炮窗口。利用废墟换位，不要停在开阔地。",
      enemyTotal: 9,
      obstacles: makeCoverField("europe", 18, 909),
      spawns: makeArcSpawns(9, 1430, 1720, -Math.PI / 2, 3.8, 109)
    },
    {
      id: "forest-pincer",
      label: "第 10 关",
      title: "林地钳形",
      scene: "forest",
      enemyType: "sherman",
      hint: "稀疏森林 · 10 辆谢尔曼 · 左右夹击",
      intro: "谢尔曼从林地两翼压来，树干会遮住部分车体。先用炮长镜寻找红色远距目标。",
      enemyTotal: 10,
      obstacles: makeCoverField("forest", 22, 1010),
      spawns: makeArcSpawns(10, 1470, 1780, -Math.PI / 2, 4.3, 110)
    },
    {
      id: "coast-slope",
      label: "第 11 关",
      title: "海岸反斜面",
      scene: "coast",
      enemyType: "sherman",
      hint: "海岸沙丘 · 11 辆谢尔曼 · 超距狙击",
      intro: "大部分谢尔曼位于你的火炮射程内、但在敌军射程外。开镜逐个清除，再进入 1300m 威胁圈。",
      enemyTotal: 11,
      obstacles: makeCoverField("coast", 24, 1111),
      spawns: makeArcSpawns(11, 1500, 1840, -Math.PI / 2, 5, 111)
    },
    {
      id: "steel-encirclement",
      label: "第 12 关",
      title: "钢铁合围",
      scene: "europe",
      enemyType: "mixed",
      hint: "欧洲废墟 · 12 辆混合坦克 · 最终十面合围",
      intro: "虎式与谢尔曼组成最终合围。外围目标先用 3.2× 炮长镜点名，近处再靠掩体和侧后装甲决胜。",
      enemyTotal: 12,
      obstacles: shiftOldObstacles(OBSTACLES),
      spawns: makeArcSpawns(12, 1520, 1900, -Math.PI / 2, Math.PI * 2, 112)
    }
  ];

  const OBSTACLE_TYPES = {
    concrete: {
      label: "混凝土",
      hp: 160,
      destructible: true,
      height: 58,
      fill: "#77776f",
      edge: "#aaa99d",
      pattern: "#5c5c55"
    },
    wood: {
      label: "木制掩体",
      hp: 80,
      destructible: true,
      height: 44,
      fill: "#8a5a32",
      edge: "#b47b45",
      pattern: "#5d381d"
    },
    sandbag: {
      label: "沙袋",
      hp: 80,
      destructible: true,
      height: 30,
      fill: "#9b8652",
      edge: "#c4ad72",
      pattern: "#75633a"
    },
    earth: {
      label: "土堆",
      hp: 80,
      destructible: true,
      height: 38,
      fill: "#806039",
      edge: "#b18b52",
      pattern: "#5a4126"
    },
    tree: {
      label: "战地树木",
      hp: 160,
      destructible: true,
      height: 132,
      fill: "#35472f",
      edge: "#6d7651",
      pattern: "#202b1d"
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
    tree: { normal: "", damaged: "", aspect: 0.72 },
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
    { id: "de-tiger", name: "德国虎式", role: "敌方", status: "重甲 · 两炮", art: "assets/tanks/de-tiger-front.webp" },
    { id: "us-sherman", name: "美国谢尔曼", role: "敌方", status: "重甲 · 两炮", art: "assets/tanks/us-sherman-front.webp" },
    { id: "jp-type97", name: "日本 97 式", role: "敌方", status: "轻甲 · 一炮", art: "assets/tanks/jp-type97-front.webp" }
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
    forest: { label: "稀疏林地", src: "assets/backdrops/sparse-forest.webp" },
    coast: { label: "海岸沙丘", src: "assets/backdrops/desert.webp" }
  };

  const cloneObstacles = (levelIndex = 2) => {
    const level = LEVELS[levelIndex] || LEVELS[0];
    return level.obstacles.map((obstacle) => ({ ...obstacle }));
  };
  const cloneSpawns = (levelIndex = 2) => {
    const level = LEVELS[levelIndex] || LEVELS[LEVELS.length - 1];
    return level.spawns.map((spawn) => ({ ...spawn }));
  };

  return {
    BATTLE,
    TANKS,
    WORLD,
    SCENES,
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

