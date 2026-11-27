"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "../public");
const PORT = Number(process.env.PORT || 8811);
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon"
};

const server = http.createServer((request, response) => {
  const url = new URL(request.url, "http://" + (request.headers.host || "127.0.0.1"));
  if (url.pathname === "/") {
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
    response.end("<!doctype html><meta charset='utf-8'><title>缓存隔离测试</title>");
    return;
  }
  if (!url.pathname.startsWith("/tank/")) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("not found");
    return;
  }
  const relative = decodeURIComponent(url.pathname.slice("/tank/".length)) || "index.html";
  const filePath = path.resolve(ROOT, relative);
  if (!filePath.startsWith(ROOT + path.sep) && filePath !== ROOT) {
    response.writeHead(403);
    response.end("forbidden");
    return;
  }
  fs.stat(filePath, (statError, stat) => {
    if (statError || !stat.isFile()) {
      response.writeHead(404);
      response.end("not found");
      return;
    }
    response.writeHead(200, {
      "Content-Type": MIME[path.extname(filePath)] || "application/octet-stream",
      "Cache-Control": path.extname(filePath) === ".html" ? "no-store" : "public, max-age=60",
      "Service-Worker-Allowed": "/tank/"
    });
    fs.createReadStream(filePath).pipe(response);
  });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log("http://127.0.0.1:" + PORT + "/tank/");
});

