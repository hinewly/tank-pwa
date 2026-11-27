# tank-pwa · 坦克对战：钢铁代差

DaoBox 正式娱乐子程序。首版是 99A 炮塔/车长第一人称视角的「十面合围」：玩家位于战场中心，四周 700～754m 环带同时存在北侧 5 座、南侧 5 座虎式固定炮台，无增援、无波次。敌方车体完全静止，只有炮塔限速转动；双方主炮都是单发装填、一炮一炮射击，不能按住连发。炮弹会被混凝土路障、叠袋墙、原木结构、土堆、敌车和坦克残骸真实阻挡。

战场远景、六款坦克、炮塔内部与掩体使用 Vidu 原创素材；有效交战距离按 `0–800m` 计算。敌方 billboard 使用落地阴影、接触压暗、距离大气衰减和下沉 6% 的底边处理，避免像贴纸一样漂浮。左上战术雷达以炮塔朝向为上方，持续显示玩家车体/炮塔方向、四周 10 辆敌车与主要掩体。菜单中的“车型图鉴”可查看六款坦克并切换四种战场远景。

## 访问路径

- 开发目录：`/Users/zoujiean/CodeX/tank-pwa`
- 线上目标：`https://daobox.net.cn/tank/`
- PWA scope：`/tank/`
- Service Worker 缓存前缀：`dbtank-`

国内版已通过 Caddy 静态目录上线。根域仅新增 `/tank` 与 `/tank/*` 路由，不占主站 API、`portal.js` 或 `/picks/*`；未改 DNS，未加首页入口，未部署海外。

## 本地运行

```bash
cd /Users/zoujiean/CodeX/tank-pwa
node tools/static-server.cjs
```

打开 `http://127.0.0.1:8811/tank/`。该工具会按正式路径 `/tank/` 提供 `public/`，便于验证 Service Worker scope。本地没有 DaoBox 门户时，游戏会自动以游客本地模式运行；联网正式环境会异步注入账号胶囊、共享时长、打卡与反馈入口。

浏览器验收：

```bash
node tools/browser-check.cjs
node tools/platform-check.cjs
```

两个脚本复用工作区现有的 Playwright Core，不新增项目依赖。

## 操作

- PC：`W/S` 前后，`A/D` 车体转向，鼠标锁定后 360° 环视，按住右键进入约 1.7× 炮长镜，左键或 `Space` 点按单发开火，`R` 装填，`Esc` 暂停。
- 手机：横屏优先；左摇杆驾驶，右摇杆环视/瞄准，独立瞄准键切换炮长镜，独立开火键点按单发。

宽视野固定为 `1×`；炮长镜约 `1.7×`。99A 每发装填 `2.9s`，虎式每发装填 `5.2s`；按住开火不会自动续射。默认采用新手难度：99A 装甲 180、虎式单发炮击基础伤害 10，虎式首轮错峰并带明显散布，玩家可以在弹丸飞行期间横向机动躲避。开镜不停止移动、不改变炮塔世界角，也不提供自动锁敌或距离伤害衰减。

正式掩体、远景、坦克和炮塔内部均为本地 WebP 素材。`public/data.js` 的 `COVER_ART`、`TANK_ART`、`BACKDROPS`、`COCKPIT_ART` 是资源入口；图片加载失败时才回退到 Canvas 矢量，替换素材不会改变碰撞、耐久、射程或固定炮台逻辑。炮塔内部遮罩位于世界场景之上、HUD/准星/伤害数字之下，规格见 `public/assets/covers/README.md` 与 `public/assets/cockpit/README.md`。

## 技术约束

纯 Vanilla JS + Canvas 2D，无框架、无构建、无 npm 运行依赖。`public/` 可直接作为静态站部署。

