# tank-pwa · 坦克对战：钢铁代差

DaoBox 正式娱乐子程序。首版是 99A 炮塔/车长第一人称视角的「十面合围」：玩家位于战场中心，四周同时存在北侧 5 座、南侧 5 座虎式固定炮台，无增援、无波次。敌方车体完全静止，只有炮塔限速转动并开火；炮弹会被混凝土、木障、沙袋、敌车和残骸真实阻挡。

## 访问路径

- 开发目录：`/Users/zoujiean/CodeX/tank-pwa`
- 线上目标：`https://daobox.net.cn/tank/`
- PWA scope：`/tank/`
- Service Worker 缓存前缀：`dbtank-`

正式部署暂缓，需用户确认后接入 Caddy 静态目录，不改 DNS。

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

- PC：`W/S` 前后，`A/D` 车体转向，鼠标锁定后 360° 环视，左键开火，`Space` 开火，`R` 装填，`Esc` 暂停。
- 手机：横屏优先；左摇杆驾驶，右摇杆环视/瞄准，独立开火键射击。

## 技术约束

纯 Vanilla JS + Canvas 2D，无框架、无构建、无 npm 运行依赖。`public/` 可直接作为静态站部署。

