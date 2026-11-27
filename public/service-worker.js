"use strict";

// 缓存前缀由本应用独占：activate 时不得删除同域其他应用的缓存。
const CACHE_VERSION = "dbtank-static-v7";
const ASSETS = [
  "./",
  "./index.html",
  "./style.css?v=7",
  "./data.js?v=7",
  "./sync.js?v=7",
  "./game.js?v=7",
  "./manifest.json?v=7",
  "./icons/favicon.svg",
  "./icons/icon-48.png",
  "./icons/icon-64.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png",
  "./assets/manifest.json",
  "./assets/backdrops/europe.webp",
  "./assets/backdrops/open-plain.webp",
  "./assets/backdrops/desert.webp",
  "./assets/backdrops/sparse-forest.webp",
  "./assets/covers/concrete.webp",
  "./assets/covers/sandbag.webp",
  "./assets/covers/wood.webp",
  "./assets/covers/earth.webp",
  "./assets/cover-variants/stone-wall.webp",
  "./assets/cover-variants/sandbag-fort.webp",
  "./assets/cover-variants/fallen-log.webp",
  "./assets/cover-variants/wreck-alt.webp",
  "./assets/wrecks/tank-wreck-front.webp",
  "./assets/wrecks/tank-wreck-side.webp",
  "./assets/wrecks/tank-wreck-rear.webp",
  "./assets/tanks/cn-99a-front.webp",
  "./assets/tanks/cn-99a-side.webp",
  "./assets/tanks/cn-99a-rear.webp",
  "./assets/tanks/ru-t90-front.webp",
  "./assets/tanks/ru-t90-side.webp",
  "./assets/tanks/ru-t90-rear.webp",
  "./assets/tanks/us-m1a2-front.webp",
  "./assets/tanks/us-m1a2-side.webp",
  "./assets/tanks/us-m1a2-rear.webp",
  "./assets/tanks/jp-type97-front.webp",
  "./assets/tanks/jp-type97-side.webp",
  "./assets/tanks/jp-type97-rear.webp",
  "./assets/tanks/us-sherman-front.webp",
  "./assets/tanks/us-sherman-side.webp",
  "./assets/tanks/us-sherman-rear.webp",
  "./assets/tanks/de-tiger-front.webp",
  "./assets/tanks/de-tiger-side.webp",
  "./assets/tanks/de-tiger-rear.webp"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith("dbtank-") && key !== CACHE_VERSION)
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== location.origin) return;
  if (url.pathname.indexOf("/api/") !== -1) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(new Request(request.url, { cache: "no-cache" }))
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put("./index.html", copy));
          }
          return response;
        })
        .catch(() => caches.match("./index.html").then((hit) => hit || caches.match("./")))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((hit) => {
      if (hit) return hit;
      return fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
        }
        return response;
      });
    })
  );
});

