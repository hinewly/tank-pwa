# daobox-home · tank 接入待集成记录

- 日期：2026-11-27
- 状态：未提交，等待 `entertainment-cloud-sync-20261127` 工位先合回 main
- 归属：外部项目最小接入，不属于 tank-pwa 仓库提交内容

## 目的

让 portal.js 识别坦克项目：

1. 账号胶囊挂到 `#db-account-slot`。
2. 打卡 chip 对 `tank` 生效。

## 待应用差异

`public/portal.js` 的 `PILL_ANCHORS` 增加：

```js
tank: ["#db-account-slot", "header.topbar .topbar-inner", "header.topbar"],
```

`public/portal.js` 的 `CHECKIN_APPS` 增加 `tank: 1`。

## 并行约束

- `daobox-home/.worktrees/entertainment-cloud-sync-20261127` 正在修改同一个 `portal.js` 的认证 Promise。
- 改动区域不重叠，但按工作区规则不在本任务中提交 daobox-home，也不与并行 worktree 竞争。
- 等娱乐云同步任务先合回 main 后，再应用本补丁并重新运行 `tank-pwa/tools/platform-check.cjs`。

## 已完成验证

坦克项目测试时通过 Playwright 路由载入主目录中尚未提交的这份 portal.js，验证：

- 账号胶囊嵌入顶栏；
- 打卡 chip 显示；
- 共享时长剩余分钟显示；
- `daobox:timeexceeded` 正确锁定；
- portal.js 与账号 API 全部中断时，游戏仍独立启动。

