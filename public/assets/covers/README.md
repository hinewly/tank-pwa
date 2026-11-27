# 第一人称掩体 billboard 素材接口

本目录预留给原创 PNG/WebP 掩体素材。当前 `data.js` 的 `COVER_ART` 配置为空，游戏使用 Canvas 矢量 fallback。

## 推荐规格

- 透明背景 PNG 或 WebP。
- 相机低位平视、固定正面 3/4 billboard 轮廓，不画完整俯视图。
- 底边落在画布底边，不要在图片内部再画地面阴影；游戏会统一绘制落地椭圆阴影和透视缩放。
- 单个文件建议 512×320 或 768×384，成品压缩后尽量小于 150KB。
- `normal` 为完整状态，`damaged` 为明显破损但结构仍可辨认的状态。

## 配置

在 `public/data.js` 的 `COVER_ART` 中填入相对路径，例如：

```js
const COVER_ART = {
  concrete: {
    normal: "assets/covers/concrete-normal.webp",
    damaged: "assets/covers/concrete-damaged.webp",
    aspect: 1.9
  },
  sandbag: {
    normal: "assets/covers/sandbag-normal.webp",
    damaged: "assets/covers/sandbag-damaged.webp",
    aspect: 2.2
  }
};
```

支持类型：`concrete`、`sandbag`、`wood`、`earth`、`wreck`。

正式启用图片后，把实际文件路径同步加入 `service-worker.js` 的 `ASSETS`，并递增 `CACHE_VERSION`，保证首次离线安装也能拿到素材。

素材必须是本项目原创或已取得明确商用授权，不使用商业游戏截图或拆包资源。

