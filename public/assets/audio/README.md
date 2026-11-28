# 坦克炮音频素材

## tank-cannon.mp3

- 原素材：用户提供的 `音频1_去人声_强力版.mp3`
- 使用确认：用户于 2026-11-28 明确指定为默认炮弹声音
- 源时间：`0.78–1.93s`
- 处理：24Hz 高通、9kHz 低通、动态压缩、`+4dB` 增益和首尾淡入淡出，转单声道 MP3 96kbps。

素材来自用户提供文件，使用与公开分发的授权由用户确认和承担。

## tank-ricochet.mp3

- 原素材：用户提供的 `音频1_去人声_强力版.mp3`
- 使用确认：用户于 2026-11-28 明确指定为默认跳弹声音
- 源时间：`25.50–25.98s`
- 处理：1.2kHz 高通、11kHz 低通、动态压缩、`+8dB` 增益和首尾淡入淡出，转单声道 MP3 96kbps。

素材来自用户提供文件，使用与公开分发的授权由用户确认和承担。

## tank-engine-loop.mp3

- 原素材：`Engine-loop heavy vehicle/tank`
- 作者：Nayckron
- 来源：https://opengameart.org/content/engine-loop-heavy-vehicletank
- 授权：CC BY 3.0
- 下载日期：2026-11-28
- 原始文件：`https://opengameart.org/sites/default/files/engine_heavy_loop_0.mp3`
- 使用方式：原文件直接作为 WebAudio 循环音源，播放速率、低通滤波和音量随油门、速度与转向变化。

CC BY 3.0 要求保留作者与来源署名；页面底部和本文件均已标注。

## tank-armor-hit.mp3

- 原素材：Kenney Impact Sounds · `impact_metal_heavy_000.ogg`
- 来源：https://github.com/Boyquotes/kenney-impact-sounds-for-godot
- 授权：CC0 1.0
- 下载日期：2026-11-28
- 处理：45Hz 高通、9.5kHz 低通和轻量增益，转单声道 MP3 96kbps。

## tank-explosion.mp3

- 原素材：`2 high quality explosions`
- 作者：qubodup
- 来源：https://opengameart.org/content/2-high-quality-explosions
- 授权：CC BY 3.0
- 下载日期：2026-11-28
- 处理：从原音频第二段爆炸截取 1.28 秒，做 28Hz 高通、6.5kHz 低通和轻量增益，转单声道 MP3 96kbps。

该样本用于主炮近场冲击叠加、装甲命中和坦克爆炸；CC BY 3.0 署名已写入页面底部。

## local/ 候选音源

`local/` 留作尚未正式采用的候选短音效目录：

- `cinematic-armor-hit.mp3`：源时间 `57.12–57.57s`，短促装甲撞击；
- `cinematic-explosion.mp3`：源时间 `103.10–104.55s`，爆炸尾段。

炮击和跳弹已按用户确认转为正式 `tank-cannon.mp3` / `tank-ricochet.mp3`。`local/` 继续由 `.gitignore` 排除，游戏当前不加载其中的候选文件。
