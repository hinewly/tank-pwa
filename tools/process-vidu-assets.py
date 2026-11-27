#!/usr/bin/env python3
"""将 Vidu 原始素材处理成可直接用于坦克游戏的透明 WebP billboard。"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

import cv2
import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "art-source" / "vidu"
PUBLIC = ROOT / "public" / "assets"

TANKS = [
    ("中国99A坦克-三视图.png", "cn-99a"),
    ("俄罗斯T-90坦克-三视图.png", "ru-t90"),
    ("美国M1A2坦克-三视图.png", "us-m1a2"),
    ("日本97式坦克-三视图.png", "jp-type97"),
    ("美国谢尔曼坦克-三视图.png", "us-sherman"),
    ("德国虎式坦克-三视图.png", "de-tiger"),
]

BACKDROPS = [
    ("欧洲战场远景全景.webp", "europe"),
    ("开阔平原远景全景.webp", "open-plain"),
    ("沙石荒漠远景全景.webp", "desert"),
    ("稀疏林地远景全景.webp", "sparse-forest"),
]


def fix_webp_extensions() -> None:
    for path in SOURCE.iterdir():
        if path.suffix.lower() != ".jpeg":
            continue
        if path.read_bytes()[:4] != b"RIFF":
            continue
        target = path.with_suffix(".webp")
        if target.exists():
            path.unlink()
        else:
            path.rename(target)


def alpha_from_white(image: Image.Image, threshold: int = 235) -> Image.Image:
    rgb = np.array(image.convert("RGB"))
    near_white = (np.min(rgb, axis=2) >= threshold).astype(np.uint8)
    count, labels, stats, _ = cv2.connectedComponentsWithStats(near_white, 8)
    border_labels: set[int] = set()
    height, width = near_white.shape
    for x in range(width):
        border_labels.add(int(labels[0, x]))
        border_labels.add(int(labels[height - 1, x]))
    for y in range(height):
        border_labels.add(int(labels[y, 0]))
        border_labels.add(int(labels[y, width - 1]))
    border_labels.discard(0)
    background = np.isin(labels, list(border_labels))
    alpha = np.where(background, 0, 255).astype(np.uint8)
    alpha = cv2.GaussianBlur(alpha, (3, 3), 0.65)
    rgba = np.dstack([rgb, alpha])
    return Image.fromarray(rgba, "RGBA")


def foreground_boxes(
    image: Image.Image,
    threshold: int = 235,
    minimum_area: int = 3000,
) -> tuple[list[tuple[int, int, int, int, int, int]], np.ndarray]:
    rgb = np.array(image.convert("RGB"))
    mask = (np.min(rgb, axis=2) < threshold).astype(np.uint8)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
    count, labels, stats, _ = cv2.connectedComponentsWithStats(mask, 8)
    rows = []
    for index in range(1, count):
        x, y, width, height, area = (int(v) for v in stats[index])
        if area >= minimum_area:
            rows.append((area, x, y, width, height, index))
    return rows, labels


def crop_component(image: Image.Image, box: tuple[int, int, int, int], component: np.ndarray, padding: int = 12) -> Image.Image:
    x, y, width, height = box
    left = max(0, x - padding)
    top = max(0, y - padding)
    right = min(image.width, x + width + padding)
    bottom = min(image.height, y + height + padding)
    crop = image.crop((left, top, right, bottom)).copy()
    crop_component_mask = component[top:bottom, left:right]
    alpha = np.array(crop)
    alpha[:, :, 3] = np.minimum(alpha[:, :, 3], crop_component_mask)
    return Image.fromarray(alpha, "RGBA")


def resize_max(image: Image.Image, max_width: int) -> Image.Image:
    if image.width <= max_width:
        return image
    height = round(image.height * max_width / image.width)
    return image.resize((max_width, height), Image.Resampling.LANCZOS)


def save_webp(image: Image.Image, path: Path, quality: int = 88) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if image.mode not in ("RGB", "RGBA"):
        image = image.convert("RGBA")
    image.save(path, "WEBP", quality=quality, method=6, alpha_quality=92 if image.mode == "RGBA" else 100)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def process_tanks(manifest: list[dict]) -> None:
    for filename, tank_id in TANKS:
        source = SOURCE / filename
        image = Image.open(source).convert("RGBA")
        rgba = alpha_from_white(image)
        boxes, labels = foreground_boxes(image)
        boxes = sorted(sorted(boxes, reverse=True)[:3], key=lambda row: row[1])
        if len(boxes) != 3:
            raise RuntimeError(f"{filename}: expected 3 tank components, got {len(boxes)}")
        for index, view in enumerate(("front", "side", "rear")):
            area, x, y, width, height, component_id = boxes[index]
            component = (labels == component_id).astype(np.uint8) * 255
            component = cv2.dilate(component, np.ones((3, 3), np.uint8), iterations=1)
            crop = crop_component(rgba, (x, y, width, height), component, padding=14)
            crop = resize_max(crop, 760)
            output = PUBLIC / "tanks" / f"{tank_id}-{view}.webp"
            save_webp(crop, output)
            manifest.append({
                "path": str(output.relative_to(ROOT / "public")),
                "width": crop.width,
                "height": crop.height,
                "bytes": output.stat().st_size,
                "sha256": sha256(output),
                "source": str(source.relative_to(ROOT)),
            })


def crop_region_alpha(image: Image.Image, left: int, right: int, padding: int = 10) -> Image.Image:
    region = image.crop((left, 0, right, image.height))
    alpha = alpha_from_white(region)
    mask = np.array(alpha)[:, :, 3] > 8
    ys, xs = np.where(mask)
    if not len(xs):
        raise RuntimeError(f"empty asset region x={left}:{right}")
    x1, x2 = int(xs.min()), int(xs.max()) + 1
    y1, y2 = int(ys.min()), int(ys.max()) + 1
    box = (max(0, x1 - padding), max(0, y1 - padding), min(alpha.width, x2 + padding), min(alpha.height, y2 + padding))
    return alpha.crop(box)


def process_covers(manifest: list[dict]) -> None:
    cover_source = SOURCE / "战场掩体四类图集.webp"
    cover_image = Image.open(cover_source).convert("RGB")
    ranges = [(0, 333, "concrete"), (340, 666, "sandbag"), (675, 998, "wood"), (1010, cover_image.width, "earth")]
    for left, right, kind in ranges:
        crop = crop_region_alpha(cover_image, left, right)
        crop = resize_max(crop, 600)
        output = PUBLIC / "covers" / f"{kind}.webp"
        save_webp(crop, output)
        manifest.append({
            "path": str(output.relative_to(ROOT / "public")),
            "width": crop.width,
            "height": crop.height,
            "bytes": output.stat().st_size,
            "sha256": sha256(output),
            "source": str(cover_source.relative_to(ROOT)),
        })

    object_source = SOURCE / "战场物件第二组.webp"
    object_image = Image.open(object_source).convert("RGB")
    variants = [
        (0, 320, "stone-wall"),
        (330, 660, "sandbag-fort"),
        (675, 1005, "fallen-log"),
        (1015, object_image.width, "wreck-alt"),
    ]
    for left, right, name in variants:
        crop = crop_region_alpha(object_image, left, right)
        crop = resize_max(crop, 600)
        output = PUBLIC / "cover-variants" / f"{name}.webp"
        save_webp(crop, output)
        manifest.append({
            "path": str(output.relative_to(ROOT / "public")),
            "width": crop.width,
            "height": crop.height,
            "bytes": output.stat().st_size,
            "sha256": sha256(output),
            "source": str(object_source.relative_to(ROOT)),
        })

    wreck_source = SOURCE / "二战坦克残骸图集.webp"
    wreck_image = Image.open(wreck_source).convert("RGBA")
    wreck_rgba = alpha_from_white(wreck_image)
    boxes, labels = foreground_boxes(wreck_image)
    boxes = sorted(boxes, reverse=True)[:3]
    boxes = sorted(boxes, key=lambda row: row[1])
    for index, view in enumerate(("front", "side", "rear")):
        area, x, y, width, height, component_id = boxes[index]
        component = (labels == component_id).astype(np.uint8) * 255
        component = cv2.dilate(component, np.ones((3, 3), np.uint8), iterations=1)
        crop = crop_component(wreck_rgba, (x, y, width, height), component, padding=14)
        crop = resize_max(crop, 640)
        output = PUBLIC / "wrecks" / f"tank-wreck-{view}.webp"
        save_webp(crop, output)
        manifest.append({
            "path": str(output.relative_to(ROOT / "public")),
            "width": crop.width,
            "height": crop.height,
            "bytes": output.stat().st_size,
            "sha256": sha256(output),
            "source": str(wreck_source.relative_to(ROOT)),
        })


def process_backdrops(manifest: list[dict]) -> None:
    for filename, backdrop_id in BACKDROPS:
        source = SOURCE / filename
        image = Image.open(source).convert("RGB")
        output = PUBLIC / "backdrops" / f"{backdrop_id}.webp"
        save_webp(image, output, quality=78)
        manifest.append({
            "path": str(output.relative_to(ROOT / "public")),
            "width": image.width,
            "height": image.height,
            "bytes": output.stat().st_size,
            "sha256": sha256(output),
            "source": str(source.relative_to(ROOT)),
        })


def process_cockpit(manifest: list[dict]) -> None:
    source = SOURCE / "99A第一人称炮塔内部绿幕.webp"
    image = Image.open(source).convert("RGB")
    rgb = np.array(image).astype(np.int16)
    red = rgb[:, :, 0]
    green = rgb[:, :, 1]
    blue = rgb[:, :, 2]
    reference = np.maximum(red, blue)
    green_excess = green - np.maximum(reference * 1.08, 58)
    key_mask = ((green > 75) & (green_excess > 12)).astype(np.uint8)
    alpha = np.where(key_mask > 0, 0, 255).astype(np.uint8)
    alpha = cv2.GaussianBlur(alpha, (5, 5), 1.05)

    # 去绿边：仅压掉明显超出红/蓝通道的绿色。
    despilled_green = np.minimum(green, np.maximum(red, blue) * 1.08).astype(np.uint8)
    rgba = np.dstack([rgb.astype(np.uint8)[:, :, 0], despilled_green, rgb.astype(np.uint8)[:, :, 2], alpha])
    output_image = Image.fromarray(rgba.astype(np.uint8), "RGBA")
    output = PUBLIC / "cockpit" / "cn-99a-gunner.webp"
    save_webp(output_image, output, quality=90)
    manifest.append({
        "path": str(output.relative_to(ROOT / "public")),
        "width": output_image.width,
        "height": output_image.height,
        "bytes": output.stat().st_size,
        "sha256": sha256(output),
        "source": str(source.relative_to(ROOT)),
    })


def main() -> None:
    fix_webp_extensions()
    manifest: list[dict] = []
    process_tanks(manifest)
    process_covers(manifest)
    process_backdrops(manifest)
    process_cockpit(manifest)
    total = sum(item["bytes"] for item in manifest)
    payload = {
        "generated": "tools/process-vidu-assets.py",
        "source": "art-source/vidu",
        "totalBytes": total,
        "assets": manifest,
    }
    manifest_path = PUBLIC / "manifest.json"
    manifest_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"processed {len(manifest)} assets, total {total / 1024:.1f} KiB")


if __name__ == "__main__":
    main()

