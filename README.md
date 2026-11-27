# tank-pwa · 坦克对战：钢铁代差

DaoBox 正式娱乐子程序。首版是一张草地地图上的俯视坦克遭遇战：玩家驾驶中方 99A，对抗 10 辆虎式。核心是正面装甲、侧后弱点、限速炮塔、可摧毁掩体和残骸变化。

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

- PC：`W/S` 前后，`A/D` 转向，鼠标瞄准，按住左键开火，`Space` 开火，`R` 装填，`Esc` 暂停。
- 手机：横屏优先；左摇杆移动，右摇杆瞄准并开火。

## 技术约束

纯 Vanilla JS + Canvas 2D，无框架、无构建、无 npm 运行依赖。`public/` 可直接作为静态站部署。

