# daobox-home · tank 接入完成记录

- 日期：2026-11-27
- 状态：已完成并部署国内
- 归属：外部项目最小接入；daobox-home commit `29da5b8`

## 目的

让 portal.js 识别坦克项目：

1. 账号胶囊挂到 `#db-account-slot`。
2. 打卡 chip 对 `tank` 生效。

## 已应用差异

`public/portal.js` 的 `PILL_ANCHORS` 增加：

```js
tank: ["#db-account-slot", "header.topbar .topbar-inner", "header.topbar"],
```

`public/portal.js` 的 `CHECKIN_APPS` 增加 `tank: 1`。

## 合入记录

- 共享层 `91e4204` 与部署记录 `94df689` 已先合回 main。
- `tank` 两行登记在最新 main 上提交并推送为 `29da5b8`。
- 国内 `/opt/daobox-home/public/portal.js` 已与当前 main 同哈希；公网 portal.js 已返回 `200` 并包含两项登记。

## 已完成验证

在最新共享层基础上通过 Playwright 和本地 portal/API 模拟验证：

- 账号胶囊嵌入顶栏；
- 打卡 chip 显示；
- 共享时长剩余分钟显示；
- `daobox:timeexceeded` 正确锁定；
- `DaoBox.ready()` 为单例；
- `daobox:authready` 只触发一次并返回同一用户；
- `cloud-sync v1.0.0` 可同时加载，不干扰坦克自有同步；
- `app=tank` 双设备恢复、空档防覆盖和离线补传继续通过；
- portal.js 与账号 API 全部中断时，游戏仍独立启动。

