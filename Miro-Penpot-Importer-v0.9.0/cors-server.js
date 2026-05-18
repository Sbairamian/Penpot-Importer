const http = require("http");
const fs = require("fs");
const path = require("path");

const root = __dirname;
const port = 8123;

const types = {
  ".json": "application/json; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
  ".html": "text/html; charset=utf-8"
};

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split("?")[0]);
  const safePath = path.normalize(urlPath).replace(/^(\.\.[\/\\])+/, "");
  let filePath = path.join(root, safePath === "/" ? "manifest.json" : safePath);

  if (!filePath.startsWith(root)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  if (!fs.existsSync(filePath)) {
    res.writeHead(404, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "*"
    });
    res.end("Not found");
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const body = fs.readFileSync(filePath);

  res.writeHead(200, {
    "Content-Type": types[ext] || "application/octet-stream",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "*",
    "Cache-Control": "no-store"
  });

  res.end(body);
});

server.listen(port, "0.0.0.0", () => {
  console.log(`Serving ${root}`);
  console.log(`Open: http://192.168.1.6:${port}/manifest.json`);
});