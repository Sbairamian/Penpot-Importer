const IMPORTER_VERSION = "v0.9.1";

penpot.ui.open("Local Miro SVG Importer", "/index.html", {
  width: 560,
  height: 430
});

function sendStatus(message) {
  penpot.ui.sendMessage({
    type: "status",
    message
  });
}

function num(value, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;
  const n = parseFloat(String(value).replace("px", ""));
  return Number.isFinite(n) ? n : fallback;
}

function identity() {
  return [1, 0, 0, 1, 0, 0];
}

function multiply(m1, m2) {
  const [a1, b1, c1, d1, e1, f1] = m1;
  const [a2, b2, c2, d2, e2, f2] = m2;

  return [
    a1 * a2 + c1 * b2,
    b1 * a2 + d1 * b2,
    a1 * c2 + c1 * d2,
    b1 * c2 + d1 * d2,
    a1 * e2 + c1 * f2 + e1,
    b1 * e2 + d1 * f2 + f1
  ];
}

function applyMatrix(matrix, px, py) {
  return {
    x: matrix[0] * px + matrix[2] * py + matrix[4],
    y: matrix[1] * px + matrix[3] * py + matrix[5]
  };
}

function parseTransform(transform) {
  let matrix = identity();

  if (!transform) return matrix;

  const regex = /(matrix|translate|scale|rotate)\s*\(([^)]*)\)/g;
  let match;

  while ((match = regex.exec(transform)) !== null) {
    const name = match[1];
    const values = match[2]
      .split(/[\s,]+/)
      .filter(Boolean)
      .map(v => num(v));

    let t = identity();

    if (name === "matrix" && values.length >= 6) {
      t = values.slice(0, 6);
    }

    if (name === "translate") {
      const tx = values[0] || 0;
      const ty = values.length > 1 ? values[1] : 0;
      t = [1, 0, 0, 1, tx, ty];
    }

    if (name === "scale") {
      const sx = values[0] || 1;
      const sy = values.length > 1 ? values[1] : sx;
      t = [sx, 0, 0, sy, 0, 0];
    }

    if (name === "rotate") {
      const angle = values[0] || 0;
      const cx = values.length > 2 ? values[1] : 0;
      const cy = values.length > 2 ? values[2] : 0;

      const radians = angle * Math.PI / 180;
      const cos = Math.cos(radians);
      const sin = Math.sin(radians);

      const r = [cos, sin, -sin, cos, 0, 0];

      if (values.length > 2) {
        const toCenter = [1, 0, 0, 1, cx, cy];
        const fromCenter = [1, 0, 0, 1, -cx, -cy];
        t = multiply(multiply(toCenter, r), fromCenter);
      } else {
        t = r;
      }
    }

    matrix = multiply(matrix, t);
  }

  return matrix;
}

function dataUrlToBytes(dataUrl) {
  if (!dataUrl || !dataUrl.startsWith("data:")) {
    return null;
  }

  const commaIndex = dataUrl.indexOf(",");
  if (commaIndex === -1) {
    return null;
  }

  const header = dataUrl.slice(0, commaIndex);
  const data = dataUrl.slice(commaIndex + 1);

  const mimeMatch = header.match(/^data:([^;,]+)/i);
  const mimeType = mimeMatch ? mimeMatch[1].toLowerCase() : "application/octet-stream";
  const isBase64 = /;base64/i.test(header);

  try {
    if (isBase64) {
      const cleanBase64 = data.replace(/\s/g, "");
      const binary = atob(cleanBase64);
      const bytes = new Uint8Array(binary.length);

      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }

      return {
        mimeType,
        bytes
      };
    }

    const decoded = decodeURIComponent(data);
    const bytes = new Uint8Array(decoded.length);

    for (let i = 0; i < decoded.length; i++) {
      bytes[i] = decoded.charCodeAt(i);
    }

    return {
      mimeType,
      bytes
    };
  } catch (err) {
    return null;
  }
}

function getScaleFromMatrix(matrix) {
  const scaleX = Math.sqrt(matrix[0] * matrix[0] + matrix[1] * matrix[1]);
  const scaleY = Math.sqrt(matrix[2] * matrix[2] + matrix[3] * matrix[3]);

  if (scaleY > 0) return scaleY;
  if (scaleX > 0) return scaleX;
  return 1;
}

function cleanFontFamily(fontFamily) {
  if (!fontFamily) return "Arial";

  const lower = fontFamily.toLowerCase();

  if (lower.includes("opensans")) return "Arial";
  if (lower.includes("noto sans")) return "Arial";
  if (lower.includes("helvetica")) return "Helvetica";
  if (lower.includes("arial")) return "Arial";

  return "Arial";
}

function normalizeColor(color, fallback) {
  if (!color) return fallback;
  const c = String(color).trim();

  if (c === "" || c === "none" || c === "transparent") {
    return fallback;
  }

  if (c.toLowerCase() === "red") return "#ff0000";
  if (c.toLowerCase() === "yellow") return "#ffff00";

  return c;
}

function rectBoundsFromItem(item) {
  const m = parseTransform(item.transform);

  const x = num(item.x, 0);
  const y = num(item.y, 0);
  const width = num(item.width, 0);
  const height = num(item.height, 0);

  const p1 = applyMatrix(m, x, y);
  const p2 = applyMatrix(m, x + width, y);
  const p3 = applyMatrix(m, x, y + height);
  const p4 = applyMatrix(m, x + width, y + height);

  const minX = Math.min(p1.x, p2.x, p3.x, p4.x);
  const minY = Math.min(p1.y, p2.y, p3.y, p4.y);
  const maxX = Math.max(p1.x, p2.x, p3.x, p4.x);
  const maxY = Math.max(p1.y, p2.y, p3.y, p4.y);

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
    scale: getScaleFromMatrix(m)
  };
}

async function createImageRect(item, parsed, namePrefix) {
  const bounds = rectBoundsFromItem(item);

  if (bounds.width <= 0 || bounds.height <= 0) {
    return false;
  }

  const media = await penpot.uploadMediaData(
    namePrefix + " " + item.index,
    parsed.bytes,
    parsed.mimeType
  );

  const rect = penpot.createRectangle();
  rect.name = namePrefix + " " + item.index;
  rect.x = bounds.x;
  rect.y = bounds.y;
  rect.resize(bounds.width, bounds.height);

  rect.fills = [
    {
      fillOpacity: 1,
      fillImage: media
    }
  ];

  return true;
}

async function importImages(images) {
  let created = 0;

  for (const item of images) {
    const parsed = dataUrlToBytes(item.href);
    if (!parsed) continue;

    const ok = await createImageRect(item, parsed, "Miro image");
    if (ok) created++;
  }

  return created;
}

async function importVectorOverlay(vectorOverlaySvg, vectorNodeCount, vectorOverlayBounds) {
  if (!vectorOverlaySvg || !vectorOverlaySvg.trim()) {
    return {
      created: 0,
      skipped: vectorNodeCount || 0
    };
  }

  try {
    const shape = await penpot.createShapeFromSvgWithImages(vectorOverlaySvg);

    if (shape) {
      shape.name = "Miro vector overlay";

      if (vectorOverlayBounds) {
        try {
          shape.x = num(vectorOverlayBounds.x, shape.x || 0);
          shape.y = num(vectorOverlayBounds.y, shape.y || 0);
        } catch (err) {}
      }

      return {
        created: vectorNodeCount || 1,
        skipped: 0
      };
    }

    return {
      created: 0,
      skipped: vectorNodeCount || 0
    };
  } catch (err) {
    return {
      created: 0,
      skipped: vectorNodeCount || 0
    };
  }
}

function importTextsOnly(texts) {
  let textCreated = 0;
  let skipped = 0;

  for (const item of texts) {
    try {
      const value = item.text || "";
      if (!value.trim()) continue;

      const m = parseTransform(item.transform);

      const x = num(item.x, 0);
      const y = num(item.y, 0);
      const position = applyMatrix(m, x, y);

      const scale = getScaleFromMatrix(m);
      const fontSize = num(item.fontSize, 16) * scale;

      const textShape = penpot.createText(value);

      textShape.name = item.name || "Miro text";
      textShape.x = position.x;
      textShape.y = position.y - fontSize;

      try {
        textShape.fontSize = fontSize;
      } catch (err) {}

      try {
        textShape.fontFamily = cleanFontFamily(item.fontFamily);
      } catch (err) {}

      try {
        textShape.fills = [
          {
            fillColor: normalizeColor(item.fill, "#000000"),
            fillOpacity: 1
          }
        ];
      } catch (err) {}

      textCreated++;
    } catch (err) {
      skipped++;
    }
  }

  return {
    textCreated,
    skipped
  };
}

function buildExternalAssignmentReport(imageSummary) {
  const assignments = imageSummary.externalAssignments || [];

  if (!assignments.length) {
    return "No external image assignments recorded.\n";
  }

  let report = "";

  for (let i = 0; i < assignments.length; i++) {
    const a = assignments[i];

    report +=
      "External image assignment #" + (i + 1) + "\n" +
      "  SVG image element index: " + a.imageElementIndex + "\n" +
      "  Unique external URL #: " + (a.uniqueExternalIndex || "unknown") + "\n" +
      "  Method: " + a.method + "\n" +
      "  SVG URL: " + a.svgHref + "\n" +
      "  SVG box: x=" + a.x + ", y=" + a.y + ", width=" + a.width + ", height=" + a.height + "\n";

    if (a.selectedFileName) {
      report +=
        "  Selected file used: " + a.selectedFileName + "\n" +
        "  Selected file size: " + a.selectedFileSize + " bytes\n" +
        "  Selected file type: " + (a.selectedFileType || "unknown") + "\n";
    }

    if (a.proxyError) {
      report +=
        "  Proxy error: " + a.proxyError + "\n";
    }

    report += "\n";
  }

  return report;
}

penpot.ui.onMessage(async (message) => {
  if (!message || message.type !== "import-content") {
    return;
  }

  try {
    const imageSummary = message.imageSummary || {};
    const images = message.images || [];
    const vectorOverlaySvg = message.vectorOverlaySvg || "";
    const vectorOverlayBounds = message.vectorOverlayBounds || null;
    const vectorNodeCount = message.vectorNodeCount || 0;
    const texts = message.texts || [];

    sendStatus(
      "Received content.\n" +
      "Version: " + IMPORTER_VERSION + "\n" +
      "Raster images: " + images.length + "\n" +
      "Vector overlay nodes: " + vectorNodeCount + "\n" +
      "Text objects: " + texts.length + "\n\n" +
      "Creating Penpot objects..."
    );

    const imageCount = await importImages(images);
    const overlayResult = await importVectorOverlay(
      vectorOverlaySvg,
      vectorNodeCount,
      vectorOverlayBounds
    );
    const textResult = importTextsOnly(texts);

    const externalAssignmentReport = buildExternalAssignmentReport(imageSummary);

    sendStatus(
      "Done.\n\n" +

      "VERSION\n" +
      "plugin.js: " + IMPORTER_VERSION + "\n" +
      "index.html: " + (imageSummary.indexVersion || "unknown") + "\n\n" +

      "IMAGE DIAGNOSTICS\n" +
      "All <image> elements in SVG: " + (imageSummary.total ?? "unknown") + "\n" +
      "Embedded raster image elements: " + (imageSummary.embeddedRaster ?? "unknown") + "\n" +
      "Embedded SVG image elements: " + (imageSummary.embeddedSvg ?? "unknown") + "\n" +
      "External/linked image refs: " + (imageSummary.external ?? "unknown") + "\n" +
      "Unique external URLs: " + (imageSummary.uniqueExternalUrlCount ?? "unknown") + "\n" +
      "External images proxy-fetched: " + (imageSummary.externalProxyFetched ?? "unknown") + "\n" +
      "External proxy fetch failed: " + (imageSummary.externalProxyFetchFailed ?? "unknown") + "\n" +
      "External image refs manually matched: " + (imageSummary.externalMatched ?? "unknown") + "\n" +
      "Matched by filename/path: " + (imageSummary.externalMatchedByName ?? "unknown") + "\n" +
      "Matched by unique URL order: " + (imageSummary.externalMatchedByUniqueUrlOrder ?? "unknown") + "\n" +
      "Reused by unique URL: " + (imageSummary.externalReusedByUniqueUrl ?? "unknown") + "\n" +
      "External image refs unmatched: " + (imageSummary.externalUnmatched ?? "unknown") + "\n" +
      "data-frame image elements: " + (imageSummary.dataFrame ?? "unknown") + "\n" +
      "Raster images sent to Penpot: " + images.length + "\n" +
      "Raster images actually created: " + imageCount + "\n\n" +

      "EXTERNAL IMAGE ASSIGNMENT REPORT\n" +
      externalAssignmentReport +

      "VECTOR/TEXT RESULTS\n" +
      "Created vector overlay nodes: " + overlayResult.created + "\n" +
      "Skipped vector overlay nodes: " + overlayResult.skipped + "\n" +
      "Created editable text objects: " + textResult.textCreated + "\n" +
      "Skipped text objects: " + textResult.skipped + "\n\n" +

      "This final report shows local proxy mapping for external Miro images."
    );

  } catch (err) {
    sendStatus("Plugin Error: " + (err && err.message ? err.message : String(err)));
  }
});

// Local Miro SVG Importer plugin.js version: v0.9.1