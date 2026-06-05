import { useState, useRef } from "react";

/* ═══════════════════════════════════════════════════════
   COLOR-BASED BOARD DETECTION
   
   Strategy: Instead of fragile OCR, we detect the game board
   structure by finding the colored hint panels (which have
   very distinctive colors), then read digits using pixel
   pattern matching optimized for the game's bitmap font.
═══════════════════════════════════════════════════════ */

/**
 * Get image data from a file as a canvas.
 */
async function loadImageToCanvas(file) {
  const img = new Image();
  const url = URL.createObjectURL(file);
  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = reject;
    img.src = url;
  });
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0);
  URL.revokeObjectURL(url);
  return canvas;
}

/**
 * Detect the game board grid by finding the green playing field.
 * Returns the bounding box of just the grid + hint panels area.
 */
function detectBoardArea(canvas) {
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;
  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;

  // The game background is a medium green (#4-6 range for R, #8-A for G, #4-7 for B)
  // We scan for dense green regions
  let top = h, bottom = 0, left = w, right = 0;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      // Match the green game background: green dominant, medium brightness
      if (g > 100 && g < 220 && g > r * 1.1 && g > b * 1.2 && r > 30 && r < 180) {
        if (y < top) top = y;
        if (y > bottom) bottom = y;
        if (x < left) left = x;
        if (x > right) right = x;
      }
    }
  }

  if (top >= bottom || left >= right) {
    return { x: 0, y: 0, w, h };
  }

  return { x: left, y: top, w: right - left, h: bottom - top };
}

/**
 * Find colored hint panels by scanning for their distinctive background colors.
 * The game uses these panel colors:
 * - Red/Coral: ~E87860 / C85848
 * - Green: ~58B868 / 389848
 * - Orange/Yellow: ~D8A040 / B88020
 * - Blue: ~5088D8 / 3868B8
 * - Purple: ~A868C8 / 8848A8
 */
function isHintPanelColor(r, g, b) {
  // Red/Coral panel
  if (r > 160 && r < 255 && g > 60 && g < 140 && b > 40 && b < 120 && r > g && r > b) return true;
  // Green panel
  if (g > 140 && g < 220 && r > 40 && r < 120 && b > 40 && b < 120 && g > r && g > b) return true;
  // Orange/Yellow panel
  if (r > 160 && r < 255 && g > 120 && g < 200 && b > 20 && b < 100 && r > b && g > b) return true;
  // Blue panel
  if (b > 150 && b < 240 && r > 30 && r < 120 && g > 80 && g < 180 && b > r) return true;
  // Purple/Pink panel
  if (r > 120 && r < 200 && b > 140 && b < 230 && g > 40 && g < 120 && b > g) return true;
  return false;
}

/**
 * Find distinct rectangular regions of hint panel colors.
 * Returns an array of bounding boxes sorted by position.
 */
function findHintPanels(canvas, boardArea) {
  const ctx = canvas.getContext("2d");
  const { x: bx, y: by, w: bw, h: bh } = boardArea;
  const imgData = ctx.getImageData(bx, by, bw, bh);
  const data = imgData.data;

  // Create a binary mask of hint-panel-colored pixels
  const mask = new Uint8Array(bw * bh);
  for (let y = 0; y < bh; y++) {
    for (let x = 0; x < bw; x++) {
      const i = (y * bw + x) * 4;
      if (isHintPanelColor(data[i], data[i + 1], data[i + 2])) {
        mask[y * bw + x] = 1;
      }
    }
  }

  // Find connected regions using flood fill
  const visited = new Uint8Array(bw * bh);
  const regions = [];

  for (let y = 0; y < bh; y++) {
    for (let x = 0; x < bw; x++) {
      if (mask[y * bw + x] && !visited[y * bw + x]) {
        // Flood fill to find the region bounds
        let minX = x, maxX = x, minY = y, maxY = y;
        let pixelCount = 0;
        const stack = [[x, y]];
        visited[y * bw + x] = 1;

        while (stack.length > 0) {
          const [cx, cy] = stack.pop();
          pixelCount++;
          if (cx < minX) minX = cx;
          if (cx > maxX) maxX = cx;
          if (cy < minY) minY = cy;
          if (cy > maxY) maxY = cy;

          for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
            const nx = cx + dx, ny = cy + dy;
            if (nx >= 0 && nx < bw && ny >= 0 && ny < bh &&
                !visited[ny * bw + nx] && mask[ny * bw + nx]) {
              visited[ny * bw + nx] = 1;
              stack.push([nx, ny]);
            }
          }
        }

        const rw = maxX - minX;
        const rh = maxY - minY;
        const area = rw * rh;
        const fill = pixelCount / area;

        // Filter: panels should be roughly square-ish, decent size, well-filled
        if (rw > bw * 0.04 && rh > bh * 0.04 && fill > 0.4 && area > 200) {
          regions.push({
            x: minX + bx, y: minY + by,
            w: rw, h: rh,
            cx: minX + rw / 2, cy: minY + rh / 2,
            pixelCount,
          });
        }
      }
    }
  }

  return regions;
}

/**
 * Given detected hint panel regions, classify them into row hints (right side)
 * and column hints (bottom). We expect 5 row hints and 5 column hints = 10 panels.
 */
function classifyPanels(panels, boardArea) {
  if (panels.length < 10) return null;

  // Sort by area descending and take top 10
  const sorted = [...panels].sort((a, b) => (b.w * b.h) - (a.w * a.h));
  const top10 = sorted.slice(0, 10);

  // Separate into right-side (row hints) vs bottom (col hints)
  // Row hints will have higher X values, Col hints will have higher Y values
  const avgX = top10.reduce((s, p) => s + p.cx, 0) / 10;
  const avgY = top10.reduce((s, p) => s + p.cy, 0) / 10;

  // Find the split: panels in the rightmost column vs bottom row
  // Row hints: rightmost cluster. Col hints: bottommost cluster.
  const xSorted = [...top10].sort((a, b) => b.cx - a.cx);
  const ySorted = [...top10].sort((a, b) => b.cy - a.cy);

  // The 5 rightmost panels are row hints, 5 bottommost are col hints
  // But we need to handle the corner (where row and col hints meet)
  // Better approach: cluster by X position for row hints, Y position for col hints
  
  // Find the X threshold that separates grid from row hints
  const xValues = top10.map(p => p.cx).sort((a, b) => a - b);
  const xGap = xValues.reduce((best, x, i) => {
    if (i === 0) return best;
    const gap = x - xValues[i - 1];
    return gap > best.gap ? { gap, threshold: (x + xValues[i - 1]) / 2 } : best;
  }, { gap: 0, threshold: 0 });

  // Find the Y threshold that separates grid from col hints
  const yValues = top10.map(p => p.cy).sort((a, b) => a - b);
  const yGap = yValues.reduce((best, y, i) => {
    if (i === 0) return best;
    const gap = y - yValues[i - 1];
    return gap > best.gap ? { gap, threshold: (y + yValues[i - 1]) / 2 } : best;
  }, { gap: 0, threshold: 0 });

  // Panels to the right of xGap threshold = row hints (sorted top to bottom)
  // Panels below yGap threshold = col hints (sorted left to right)
  const rowPanels = top10
    .filter(p => p.cx > xGap.threshold)
    .sort((a, b) => a.cy - b.cy);
  const colPanels = top10
    .filter(p => p.cy > yGap.threshold && p.cx <= xGap.threshold)
    .sort((a, b) => a.cx - b.cx);

  // If we don't have exactly 5 of each, try alternate classification
  if (rowPanels.length !== 5 || colPanels.length !== 5) {
    // Fallback: assume the rightmost 5 are row, bottommost 5 are col
    // Remove duplicates (a panel might be both rightmost and bottommost)
    const rightMost = [...top10].sort((a, b) => b.cx - a.cx).slice(0, 5).sort((a, b) => a.cy - b.cy);
    const remaining = top10.filter(p => !rightMost.includes(p));
    const bottomMost = remaining.sort((a, b) => b.cy - a.cy).slice(0, 5).sort((a, b) => a.cx - b.cx);
    
    if (rightMost.length === 5 && bottomMost.length === 5) {
      return { rowPanels: rightMost, colPanels: bottomMost };
    }
    return null;
  }

  return { rowPanels, colPanels };
}

/**
 * Extract digit from a hint panel region using pixel density analysis.
 * The hint panel has:
 * - Top half: 2-digit point number (white/dark text on colored bg)
 * - Bottom half: Voltorb icon + 1-digit bomb count
 * 
 * We use a 7-segment-like approach: divide the digit area into zones
 * and count dark/light pixels to determine which digit it is.
 */
function extractDigitsFromPanel(canvas, panel) {
  const ctx = canvas.getContext("2d");
  
  // Get the panel image data
  const pData = ctx.getImageData(panel.x, panel.y, panel.w, panel.h);
  const pw = panel.w;
  const ph = panel.h;
  const pixels = pData.data;

  // Convert to grayscale and find "text" pixels (significantly different from bg)
  // First, sample the background color from corners
  const sampleBg = (sx, sy, sw, sh) => {
    let rSum = 0, gSum = 0, bSum = 0, count = 0;
    for (let y = sy; y < sy + sh && y < ph; y++) {
      for (let x = sx; x < sx + sw && x < pw; x++) {
        const i = (y * pw + x) * 4;
        rSum += pixels[i]; gSum += pixels[i+1]; bSum += pixels[i+2];
        count++;
      }
    }
    return count > 0 ? [rSum/count, gSum/count, bSum/count] : [128,128,128];
  };

  const bgColor = sampleBg(2, 2, Math.min(6, pw), Math.min(6, ph));

  // Create a binary "text" mask - pixels that differ significantly from background
  const textMask = new Uint8Array(pw * ph);
  for (let y = 0; y < ph; y++) {
    for (let x = 0; x < pw; x++) {
      const i = (y * pw + x) * 4;
      const r = pixels[i], g = pixels[i+1], b = pixels[i+2];
      const diff = Math.abs(r - bgColor[0]) + Math.abs(g - bgColor[1]) + Math.abs(b - bgColor[2]);
      // Also check if it's "dark" text (the numbers are typically dark on colored bg)
      // or "light" text (white numbers)
      const brightness = r * 0.299 + g * 0.587 + b * 0.114;
      const bgBrightness = bgColor[0] * 0.299 + bgColor[1] * 0.587 + bgColor[2] * 0.114;
      
      if (diff > 80 && Math.abs(brightness - bgBrightness) > 40) {
        textMask[y * pw + x] = 1;
      }
    }
  }

  // The points number is in the top ~45% of the panel
  // The bomb count is in the bottom ~45%, right portion (left portion is voltorb icon)
  const ptsRegion = { x: 0, y: 0, w: pw, h: Math.floor(ph * 0.48) };
  const bombRegion = { x: Math.floor(pw * 0.45), y: Math.floor(ph * 0.52), w: Math.floor(pw * 0.55), h: Math.floor(ph * 0.48) };

  const ptsValue = readNumberFromRegion(textMask, pw, ptsRegion);
  const bombValue = readNumberFromRegion(textMask, pw, bombRegion);

  return { pts: ptsValue, bombs: bombValue };
}

/**
 * Read a 1-2 digit number from a binary text mask region.
 * Uses column density profiling to find and identify digits.
 */
function readNumberFromRegion(mask, maskWidth, region) {
  const { x: rx, y: ry, w: rw, h: rh } = region;

  // Calculate column density profile within the region
  const colDensity = new Array(rw).fill(0);
  for (let x = 0; x < rw; x++) {
    for (let y = 0; y < rh; y++) {
      if (mask[(ry + y) * maskWidth + (rx + x)]) {
        colDensity[x]++;
      }
    }
  }

  // Find digit columns (runs of non-zero density)
  const threshold = rh * 0.08; // minimum column density to count
  const digitRuns = [];
  let inRun = false, runStart = 0;

  for (let x = 0; x <= rw; x++) {
    const val = x < rw ? colDensity[x] : 0;
    if (val > threshold && !inRun) {
      inRun = true;
      runStart = x;
    } else if (val <= threshold && inRun) {
      inRun = false;
      const runWidth = x - runStart;
      if (runWidth > rw * 0.05) { // ignore very narrow noise
        digitRuns.push({ start: runStart, end: x, width: runWidth });
      }
    }
  }

  if (digitRuns.length === 0) return null;

  // For each digit run, identify the digit using zone analysis
  let result = 0;
  for (const run of digitRuns) {
    const digit = identifyDigit(mask, maskWidth, rx + run.start, ry, run.width, rh);
    if (digit !== null) {
      result = result * 10 + digit;
    }
  }

  return result > 0 || digitRuns.length > 0 ? result : null;
}

/**
 * Identify a single digit using a 3x5 zone density grid.
 * Each zone's fill ratio helps distinguish digits 0-9.
 */
function identifyDigit(mask, maskWidth, dx, dy, dw, dh) {
  // Trim the digit vertically (find actual top/bottom of text)
  let actualTop = dh, actualBottom = 0;
  for (let y = 0; y < dh; y++) {
    for (let x = 0; x < dw; x++) {
      if (mask[(dy + y) * maskWidth + (dx + x)]) {
        if (y < actualTop) actualTop = y;
        if (y > actualBottom) actualBottom = y;
      }
    }
  }
  if (actualTop >= actualBottom) return null;

  const trimH = actualBottom - actualTop + 1;
  const trimY = dy + actualTop;

  // Divide into 3 columns x 5 rows grid
  const cols = 3, rows = 5;
  const zones = new Array(rows * cols).fill(0);
  const zoneW = dw / cols;
  const zoneH = trimH / rows;

  for (let zy = 0; zy < rows; zy++) {
    for (let zx = 0; zx < cols; zx++) {
      let filled = 0, total = 0;
      const startX = Math.floor(zx * zoneW);
      const endX = Math.floor((zx + 1) * zoneW);
      const startY = Math.floor(zy * zoneH);
      const endY = Math.floor((zy + 1) * zoneH);
      
      for (let y = startY; y < endY; y++) {
        for (let x = startX; x < endX; x++) {
          total++;
          if (mask[(trimY + y) * maskWidth + (dx + x)]) filled++;
        }
      }
      zones[zy * cols + zx] = total > 0 ? filled / total : 0;
    }
  }

  // Score each digit pattern (0-9) against the observed zones
  return matchDigitPattern(zones, dw / trimH);
}

/**
 * Match zone density pattern to known digit shapes.
 * Uses the aspect ratio and zone fills to classify.
 */
function matchDigitPattern(zones, aspectRatio) {
  // Zone indices (3 cols x 5 rows):
  // 0  1  2    (top)
  // 3  4  5
  // 6  7  8    (middle)
  // 9  10 11
  // 12 13 14   (bottom)

  const t = 0.25; // threshold for "filled"

  const top = (zones[0] + zones[1] + zones[2]) / 3;
  const mid = (zones[6] + zones[7] + zones[8]) / 3;
  const bot = (zones[12] + zones[13] + zones[14]) / 3;
  const topLeft = (zones[0] + zones[3]) / 2;
  const topRight = (zones[2] + zones[5]) / 2;
  const botLeft = (zones[9] + zones[12]) / 2;
  const botRight = (zones[11] + zones[14]) / 2;
  const midLeft = zones[6];
  const midRight = zones[8];
  const center = zones[7];
  const topCenter = zones[1];
  const botCenter = zones[13];

  // Narrow digit (1) - very narrow aspect ratio
  if (aspectRatio < 0.45) return 1;

  // Score each digit
  const scores = new Array(10).fill(0);

  // 0: top, bottom filled; left+right sides filled; middle empty center
  scores[0] = top + bot + topLeft + topRight + botLeft + botRight - center * 2;
  
  // 1: narrow, mostly right or center column
  scores[1] = (topCenter + center + botCenter) * 2 - topLeft - botLeft - (aspectRatio > 0.5 ? 2 : 0);
  
  // 2: top filled, middle filled, bottom filled, topRight, botLeft
  scores[2] = top + mid + bot + topRight + botLeft - topLeft - botRight;
  
  // 3: top, mid, bot filled; right side filled; left side empty
  scores[3] = top + mid + bot + topRight + botRight - topLeft - botLeft;
  
  // 4: top sides, middle all, bottom right only
  scores[4] = topLeft + topRight + mid + botRight - bot * 0.5 - botLeft;
  
  // 5: top filled, mid filled, bot filled, topLeft, botRight
  scores[5] = top + mid + bot + topLeft + botRight - topRight - botLeft;
  
  // 6: top filled, topLeft, mid, botLeft, botRight, bot
  scores[6] = top + mid + bot + topLeft + botLeft + botRight - topRight * 0.5;
  
  // 7: top filled, right side
  scores[7] = top + topRight + midRight + botRight - botLeft - midLeft - mid * 0.5;
  
  // 8: everything filled
  scores[8] = top + mid + bot + topLeft + topRight + botLeft + botRight;
  
  // 9: top, topLeft, topRight, mid, botRight, bot
  scores[9] = top + mid + bot + topLeft + topRight + botRight - botLeft * 0.5;

  // Find best match
  let bestDigit = 0, bestScore = -Infinity;
  for (let d = 0; d < 10; d++) {
    if (scores[d] > bestScore) {
      bestScore = scores[d];
      bestDigit = d;
    }
  }

  return bestDigit;
}

/**
 * Main processing pipeline:
 * 1. Detect board area (green background)
 * 2. Find colored hint panels
 * 3. Classify into row hints (right) and col hints (bottom)
 * 4. Extract digits from each panel
 */
function processGameImage(canvas) {
  const boardArea = detectBoardArea(canvas);
  const panels = findHintPanels(canvas, boardArea);

  if (panels.length < 10) {
    throw new Error(`Found ${panels.length} panels, need 10. Try a clearer photo.`);
  }

  const classified = classifyPanels(panels, boardArea);
  if (!classified) {
    throw new Error("Could not identify row/column hint layout. Try again.");
  }

  const { rowPanels, colPanels } = classified;

  const rowResults = rowPanels.map((panel) => {
    const digits = extractDigitsFromPanel(canvas, panel);
    return {
      pts: digits.pts !== null ? String(digits.pts) : "",
      bombs: digits.bombs !== null ? String(digits.bombs) : "",
    };
  });

  const colResults = colPanels.map((panel) => {
    const digits = extractDigitsFromPanel(canvas, panel);
    return {
      pts: digits.pts !== null ? String(digits.pts) : "",
      bombs: digits.bombs !== null ? String(digits.bombs) : "",
    };
  });

  return { rowResults, colResults };
}

/* ═══════════════════════════════════════════════════════
   PHOTO CAPTURE COMPONENT
═══════════════════════════════════════════════════════ */
export default function PhotoCapture({ onHintsDetected }) {
  const [status, setStatus] = useState("idle"); // idle | processing | done | error
  const [errorMsg, setErrorMsg] = useState("");
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);

  const processImage = async (file) => {
    setStatus("processing");
    setErrorMsg("");

    try {
      const canvas = await loadImageToCanvas(file);
      const { rowResults, colResults } = processGameImage(canvas);
      setStatus("done");
      onHintsDetected(rowResults, colResults);
    } catch (e) {
      console.error("Image processing error:", e);
      setErrorMsg(e.message || "Failed to process image");
      setStatus("error");
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) processImage(file);
  };

  const handleCapture = () => {
    fileInputRef.current?.click();
  };

  const handleCamera = () => {
    cameraInputRef.current?.click();
  };

  const reset = () => {
    setStatus("idle");
    setErrorMsg("");
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (cameraInputRef.current) cameraInputRef.current.value = "";
  };

  return (
    <div style={{ marginTop: 10 }}>
      {/* Hidden file inputs */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        style={{ display: "none" }}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileChange}
        style={{ display: "none" }}
      />

      {status === "idle" && (
        <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
          <button
            onClick={handleCamera}
            style={{
              fontFamily: "'Press Start 2P', monospace",
              fontSize: 8,
              color: "#FFF",
              background: "linear-gradient(180deg, #D8A838, #B88818)",
              border: "2px solid #987008",
              borderRadius: 4,
              padding: "8px 12px",
              cursor: "pointer",
              boxShadow: "0 2px 4px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.3)",
              textShadow: "0 1px 1px rgba(0,0,0,0.3)",
            }}
            onMouseDown={(e) => { e.currentTarget.style.transform = "translateY(1px) scale(0.96)"; }}
            onMouseUp={(e) => { e.currentTarget.style.transform = ""; }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = ""; }}
          >
            📷 SNAP
          </button>
          <button
            onClick={handleCapture}
            style={{
              fontFamily: "'Press Start 2P', monospace",
              fontSize: 8,
              color: "#FFF",
              background: "linear-gradient(180deg, #D8A838, #B88818)",
              border: "2px solid #987008",
              borderRadius: 4,
              padding: "8px 12px",
              cursor: "pointer",
              boxShadow: "0 2px 4px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.3)",
              textShadow: "0 1px 1px rgba(0,0,0,0.3)",
            }}
            onMouseDown={(e) => { e.currentTarget.style.transform = "translateY(1px) scale(0.96)"; }}
            onMouseUp={(e) => { e.currentTarget.style.transform = ""; }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = ""; }}
          >
            📁 UPLOAD
          </button>
        </div>
      )}

      {status === "processing" && (
        <div style={{ textAlign: "center" }}>
          <span style={{
            fontFamily: "'Press Start 2P', monospace",
            fontSize: 7, color: "#FFF",
          }}>
            ANALYZING...
          </span>
        </div>
      )}

      {status === "done" && (
        <div style={{ textAlign: "center" }}>
          <span style={{
            fontFamily: "'Press Start 2P', monospace",
            fontSize: 7, color: "#AAFFAA",
          }}>
            ✓ HINTS LOADED
          </span>
          <button
            onClick={reset}
            style={{
              marginLeft: 8,
              fontFamily: "'Press Start 2P', monospace",
              fontSize: 7,
              color: "#FFF",
              background: "transparent",
              border: "2px solid #FFF6",
              borderRadius: 4,
              padding: "4px 10px",
              cursor: "pointer",
            }}
          >
            RETRY
          </button>
        </div>
      )}

      {status === "error" && (
        <div style={{ textAlign: "center" }}>
          <span style={{
            fontFamily: "'Press Start 2P', monospace",
            fontSize: 6, color: "#FFAAAA",
          }}>
            ⚠ {errorMsg}
          </span>
          <button
            onClick={reset}
            style={{
              marginLeft: 8,
              fontFamily: "'Press Start 2P', monospace",
              fontSize: 7,
              color: "#FFF",
              background: "transparent",
              border: "2px solid #FFF6",
              borderRadius: 4,
              padding: "4px 10px",
              cursor: "pointer",
            }}
          >
            RETRY
          </button>
        </div>
      )}
    </div>
  );
}
