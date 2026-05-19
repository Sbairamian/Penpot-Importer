const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const SERVER_VERSION = "v0.9.1";

const root = __dirname;
const port = 8123;

const types = {
  ".json": "application/json; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif"
};

function writeCorsHeaders(res, statusCode, extraHeaders = {}) {
  res.writeHead(statusCode, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "*",
    "Cache-Control": "no-store",
    ...extraHeaders
  });
}

function sendJson(res, statusCode, data) {
  writeCorsHeaders(res, statusCode, {
    "Content-Type": "application/json; charset=utf-8"
  });

  res.end(JSON.stringify(data, null, 2));
}

function isAllowedProxyUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl);

    if (parsed.protocol !== "https:") {
      return false;
    }

    const hostname = parsed.hostname.toLowerCase();

    if (hostname !== "miro.com" && !hostname.endsWith(".miro.com")) {
      return false;
    }

    return true;
  } catch (err) {
    return false;
  }
}

function readSmallErrorBody(response, callback) {
  const chunks = [];
  let total = 0;
  const maxBytes = 4096;

  response.on("data", chunk => {
    if (total < maxBytes) {
      chunks.push(chunk);
      total += chunk.length;
    }
  });

  response.on("end", () => {
    const buffer = Buffer.concat(chunks);
    callback(buffer.toString("utf8"));
  });
}

function fetchRemoteImage(rawUrl, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    if (redirectCount > 5) {
      reject(new Error("Too many redirects while fetching remote image"));
      return;
    }

    const parsed = new URL(rawUrl);

    const options = {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 LocalPenpotMiroImporter/" + SERVER_VERSION,
        "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        "Referer": "https://miro.com/",
        "Origin": "https://miro.com"
      }
    };

    const request = https.request(parsed, options, response => {
      const statusCode = response.statusCode || 0;
      const contentType = response.headers["content-type"] || "";
      const location = response.headers.location || "";

      if ([301, 302, 303, 307, 308].includes(statusCode) && location) {
        response.resume();

        let nextUrl;

        try {
          nextUrl = new URL(location, rawUrl).toString();
        } catch (err) {
          reject(new Error("Invalid redirect location: " + location));
          return;
        }

        if (!isAllowedProxyUrl(nextUrl)) {
          reject(new Error("Redirect target is not allowed: " + nextUrl));
          return;
        }

        fetchRemoteImage(nextUrl, redirectCount + 1)
          .then(resolve)
          .catch(reject);

        return;
      }

      if (statusCode < 200 || statusCode >= 300) {
        readSmallErrorBody(response, body => {
          reject(
            new Error(
              "Remote server returned HTTP " +
              statusCode +
              ". Content-Type: " +
              contentType +
              ". Body preview: " +
              body.slice(0, 500)
            )
          );
        });
        return;
      }

      if (!String(contentType).toLowerCase().startsWith("image/")) {
        readSmallErrorBody(response, body => {
          reject(
            new Error(
              "Remote response was not an image. Content-Type: " +
              contentType +
              ". Body preview: " +
              body.slice(0, 500)
            )
          );
        });
        return;
      }

      const chunks = [];

      response.on("data", chunk => {
        chunks.push(chunk);
      });

      response.on("end", () => {
        const buffer = Buffer.concat(chunks);

        resolve({
          buffer,
          contentType,
          finalUrl: rawUrl,
          redirectCount
        });
      });
    });

    request.on("error", err => {
      reject(err);
    });

    request.setTimeout(30000, () => {
      request.destroy(new Error("Remote image request timed out"));
    });

    request.end();
  });
}

async function handleProxyImage(req, res) {
  try {
    const requestUrl = new URL(req.url, "http://127.0.0.1:" + port);
    const targetUrl = requestUrl.searchParams.get("url") || "";

    if (!targetUrl) {
      sendJson(res, 400, {
        ok: false,
        version: SERVER_VERSION,
        error: "Missing url parameter"
      });
      return;
    }

    if (!isAllowedProxyUrl(targetUrl)) {
      sendJson(res, 400, {
        ok: false,
        version: SERVER_VERSION,
        error: "Proxy only allows https://miro.com or https://*.miro.com image URLs",
        url: targetUrl
      });
      return;
    }

    const result = await fetchRemoteImage(targetUrl);

    writeCorsHeaders(res, 200, {
      "Content-Type": result.contentType || "application/octet-stream",
      "Content-Length": result.buffer.length,
      "X-Proxy-Version": SERVER_VERSION,
      "X-Proxy-Final-Url": result.finalUrl || targetUrl
    });

    res.end(result.buffer);
  } catch (err) {
    sendJson(res, 502, {
      ok: false,
      version: SERVER_VERSION,
      error: err && err.message ? err.message : String(err)
    });
  }
}

function handleStaticFile(req, res) {
  const urlPath = decodeURIComponent(req.url.split("?")[0]);
  const safePath = path.normalize(urlPath).replace(/^(\.\.[\/\\])+/, "");
  let filePath = path.join(root, safePath === "/" ? "manifest.json" : safePath);

  if (!filePath.startsWith(root)) {
    writeCorsHeaders(res, 403, {
      "Content-Type": "text/plain; charset=utf-8"
    });
    res.end("Forbidden");
    return;
  }

  if (!fs.existsSync(filePath)) {
    writeCorsHeaders(res, 404, {
      "Content-Type": "text/plain; charset=utf-8"
    });
    res.end("Not found");
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const body = fs.readFileSync(filePath);

  writeCorsHeaders(res, 200, {
    "Content-Type": types[ext] || "application/octet-stream"
  });

  res.end(body);
}

const server = http.createServer((req, res) => {
  if (req.method === "OPTIONS") {
    writeCorsHeaders(res, 204);
    res.end();
    return;
  }

  const urlPath = req.url.split("?")[0];

  if (urlPath === "/proxy-image") {
    handleProxyImage(req, res);
    return;
  }

  if (urlPath === "/server-version") {
    sendJson(res, 200, {
      ok: true,
      version: SERVER_VERSION
    });
    return;
  }

  handleStaticFile(req, res);
});

server.listen(port, "0.0.0.0", () => {
  console.log("Local Miro SVG Importer server " + SERVER_VERSION);
  console.log("Serving " + root);
  console.log("Open: http://127.0.0.1:" + port + "/manifest.json");
  console.log("Proxy test route: http://127.0.0.1:" + port + "/proxy-image?url=<encoded-miro-image-url>");
});