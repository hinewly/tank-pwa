# 99A 第一人称炮塔内部素材

- 运行时文件：`cn-99a-gunner.webp`
- 尺寸：1364×768
- 字节数：121,156
- SHA-256：`906f96ccd4f441026a9dab55bd3a8d9588b7dd79f1cf5163b77c7237088b18ec`
- 原创来源：Vidu AIGC，原始绿幕与提示词记录见 `art-source/README.md`
- 配置入口：`public/data.js → COCKPIT_ART["cn-99a"]`

中央绿幕已转为透明并做边缘羽化/去绿。正式渲染时遮罩高于世界、弹道与粒子，低于伤害数字、瞄准线、威胁罗盘、准星、摇杆和 DOM HUD。低机位裁景保证中央准星落在透明战场区域，炮口焰按 `(0.502, 0.457)` 的归一化炮口位置生成。

只有图片加载失败时才回退到 Canvas 矢量炮管。替换素材时需同步更新 `data.js`、`service-worker.js`、`assets/manifest.json`、版本号和 `/tank/` 离线缓存。
