import { useState, useRef } from "react";

/* ═══════════════════════════════════════════════════════
   COLOR-ANCHORED PANEL DETECTION
   
   Instead of assuming fixed proportions, we FIND the colored
   hint panels by their distinctive background colors:
   - Red/Coral:  R>170, G:60-130, B:40-110
   - Green:      G>140, R:50-120, B:50-120
   - Orange:     R>170, G:120-190, B:20-90
   - Blue:       B>150, R:30-120, G:80-170
   - Purple:     R>120, B>130, G:40-120
   
   These panels are the ONLY large rectangular regions of these
   colors in any Voltorb Flip screenshot. Once found, we cluster
   them into row hints (vertical group on right) and column hints
   (horizontal group on bottom), then read digits from each.
═══════════════════════════════════════════════════════ */

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

/* ─── Color detection ─── */

function classifyPixelColor(r, g, b) {
  // Returns: "red", "green", "orange", "blue", "purple", or null
  // Broadened ranges to handle various screenshot qualities, emulators, and photo lighting.
  //
  // Red/Coral panel
  if (r > 160 && g > 40 && g < 155 && b > 25 && b < 135 && r > g + 35 && r > b + 35) return "red";
  // Green panel (NOT the dark board green — panels are brighter, more saturated)
  if (g > 130 && r > 35 && r < 145 && b > 35 && b < 145 && g > r + 15 && g > b + 15) return "green";
  // Orange/Yellow panel
  if (r > 160 && g > 110 && g < 210 && b < 110 && r > g && (r - b) > 70) return "orange";
  // Blue panel
  if (b > 140 && r < 150 && g > 70 && g < 195 && b > r + 30) return "blue";
  // Purple/Magenta panel
  if (r > 120 && b > 140 && g > 40 && g < 155 && b > g + 20 && r > g + 10) return "purple";
  return null;
}

/* ─── Find colored rectangular regions via run-length scanning ─── */

/**
 * Scan the image to find rectangular blobs of each hint panel color.
 * Uses a downsampled scan for speed, then refines boundaries.
 */
function findColoredPanels(canvas) {
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;
  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;

  // Downsample factor for initial scan (every Nth pixel)
  const step = Math.max(1, Math.floor(Math.min(w, h) / 200));

  // Accumulate colored pixel positions by color
  const colorPixels = { red: [], green: [], orange: [], blue: [], purple: [] };

  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      const i = (y * w + x) * 4;
      const color = classifyPixelColor(data[i], data[i + 1], data[i + 2]);
      if (color) colorPixels[color].push({ x, y });
    }
  }

  // For each color, find rectangular clusters using bounding box
  // In the game, each color appears exactly twice: once as a row hint, once as a col hint
  // (or sometimes colors repeat if layout varies)
  // Strategy: find all connected blobs of each color, then each blob = one panel
  const allPanels = [];

  for (const [color, pixels] of Object.entries(colorPixels)) {
    if (pixels.length < 5) continue; // Too few pixels, skip

    // Simple clustering: group pixels that are close together
    const clusters = clusterPoints(pixels, Math.max(w, h) * 0.08);

    for (const cluster of clusters) {
      if (cluster.length < 3) continue;

      // Get bounding box
      let minX = Infinity, maxX = 0, minY = Infinity, maxY = 0;
      for (const p of cluster) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
      }

      const bw = maxX - minX;
      const bh = maxY - minY;

      // Filter: panels should be roughly square-ish and decent size
      const minDim = Math.min(w, h) * 0.02; // Lowered to catch smaller panels in DS screenshots
      const maxDim = Math.min(w, h) * 0.20;
      if (bw < minDim || bh < minDim) continue;
      if (bw > maxDim || bh > maxDim) continue;

      // Aspect ratio: hint panels are roughly square (0.5-2.5)
      const aspect = bw / bh;
      if (aspect < 0.4 || aspect > 2.5) continue;

      // Verify: panel should contain some dark pixels (text/icon)
      // This filters out solid-colored UI elements like buttons
      let darkPixels = 0;
      const checkStep = Math.max(1, Math.floor(Math.min(bw, bh) / 10));
      for (let cy = minY; cy <= maxY; cy += checkStep) {
        for (let cx = minX; cx <= maxX; cx += checkStep) {
          const idx = (cy * w + cx) * 4;
          if (idx >= 0 && idx < data.length - 3) {
            const lum = data[idx] * 0.3 + data[idx+1] * 0.6 + data[idx+2] * 0.1;
            if (lum < 80) darkPixels++;
          }
        }
      }
      const totalChecked = Math.ceil((maxY - minY) / checkStep) * Math.ceil((maxX - minX) / checkStep) || 1;
      const darkRatio = darkPixels / totalChecked;
      // Hint panels should have 10-60% dark pixels (text + voltorb icon)
      if (darkRatio < 0.05 || darkRatio > 0.7) continue;

      allPanels.push({
        color,
        x: minX, y: minY, w: bw, h: bh,
        cx: minX + bw / 2, cy: minY + bh / 2,
        pixelCount: cluster.length,
      });
    }
  }

  return allPanels;
}

/**
 * Simple distance-based clustering of 2D points.
 */
function clusterPoints(points, maxDist) {
  if (points.length === 0) return [];
  const assigned = new Array(points.length).fill(-1);
  const clusters = [];
  let clusterId = 0;

  for (let i = 0; i < points.length; i++) {
    if (assigned[i] >= 0) continue;
    // BFS from this point
    const cluster = [];
    const queue = [i];
    assigned[i] = clusterId;
    while (queue.length > 0) {
      const idx = queue.shift();
      cluster.push(points[idx]);
      for (let j = 0; j < points.length; j++) {
        if (assigned[j] >= 0) continue;
        const dx = points[idx].x - points[j].x;
        const dy = points[idx].y - points[j].y;
        if (Math.sqrt(dx * dx + dy * dy) < maxDist) {
          assigned[j] = clusterId;
          queue.push(j);
        }
      }
    }
    clusters.push(cluster);
    clusterId++;
  }

  return clusters;
}

/* ─── Classify panels into row hints and column hints ─── */

/**
 * Detect if a region contains a Voltorb icon.
 * The Voltorb is a red/orange circle with a white center dot and a
 * horizontal line through it. It's always in the bottom-left of a hint panel.
 * 
 * We look for a cluster of red pixels (the ball) in the lower portion of the panel.
 * Returns: { found: boolean, x, y, radius } of the icon center
 */
function detectVoltorbIcon(canvas, panel) {
  const ctx = canvas.getContext("2d");
  const px = Math.round(panel.x);
  const py = Math.round(panel.y);
  const pw = Math.round(panel.w);
  const ph = Math.round(panel.h);

  if (pw < 4 || ph < 4) return { found: false };

  // The Voltorb icon is in the bottom half of the panel, left side
  // Scan the bottom-left quadrant for red/orange pixels (the ball body)
  const scanX = px;
  const scanY = py + Math.floor(ph * 0.4);
  const scanW = Math.floor(pw * 0.6);
  const scanH = ph - Math.floor(ph * 0.4);

  if (scanW < 3 || scanH < 3) return { found: false };
  if (scanX + scanW > canvas.width || scanY + scanH > canvas.height) return { found: false };

  const imgData = ctx.getImageData(scanX, scanY, scanW, scanH);
  const data = imgData.data;

  // Count "voltorb red" pixels — the icon body is a warm red/orange-red
  // RGB roughly: R>160, G<130, B<130, R > G+40
  let redCount = 0;
  let redSumX = 0, redSumY = 0;

  for (let y = 0; y < scanH; y++) {
    for (let x = 0; x < scanW; x++) {
      const i = (y * scanW + x) * 4;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      // Voltorb red: warm red, not too dark, not too bright
      if (r > 150 && g < 140 && b < 140 && r > g + 30 && r > b + 30) {
        redCount++;
        redSumX += x;
        redSumY += y;
      }
    }
  }

  // The voltorb icon should occupy roughly 5-30% of the scanned area
  const scanArea = scanW * scanH;
  const redRatio = redCount / scanArea;

  if (redRatio > 0.04 && redRatio < 0.4 && redCount > 10) {
    const iconCx = scanX + redSumX / redCount;
    const iconCy = scanY + redSumY / redCount;
    const approxRadius = Math.sqrt(redCount / Math.PI);
    return { found: true, x: iconCx, y: iconCy, radius: approxRadius };
  }

  return { found: false };
}

/**
 * Validate panel candidates by checking for Voltorb icon presence.
 * Panels with a Voltorb icon are confirmed hint panels.
 * Panels without are likely false positives (UI buttons, etc.)
 */
function validatePanelsWithVoltorb(canvas, panels) {
  const validated = [];
  for (const panel of panels) {
    const icon = detectVoltorbIcon(canvas, panel);
    if (icon.found) {
      validated.push({ ...panel, voltorb: icon });
    }
  }
  return validated;
}

/**
 * Given found panels, separate into row hints (right-side vertical group)
 * and column hints (bottom horizontal group).
 * 
 * Logic: 
 * - We expect 10 panels total (5 row + 5 col)
 * - Row hints form a vertical line (similar X, varying Y)
 * - Col hints form a horizontal line (similar Y, varying X)
 */
function classifyPanels(panels) {
  if (panels.length < 2) return null;

  // All hint panels should be roughly the same size. Filter outliers.
  const areas = panels.map(p => p.w * p.h).sort((a, b) => a - b);
  const medianArea = areas[Math.floor(areas.length / 2)];
  
  // Keep only panels within 4x of median area
  const sizedPanels = panels.filter(p => {
    const a = p.w * p.h;
    return a > medianArea * 0.2 && a < medianArea * 4.0;
  });

  if (sizedPanels.length < 2) return null;

  // Sort by size descending, take top candidates
  const candidates = [...sizedPanels]
    .sort((a, b) => (b.w * b.h) - (a.w * a.h))
    .slice(0, Math.min(14, sizedPanels.length));

  // Strategy: Find panels forming a vertical line (row hints = rightmost group)
  // and panels forming a horizontal line (col hints = bottommost group)
  
  // Sort by X to find the rightmost vertical group
  const byX = [...candidates].sort((a, b) => b.cx - a.cx);
  
  // Try to find rightmost panels that are vertically aligned
  let rowPanels = null;
  for (let i = 0; i < Math.min(3, byX.length); i++) {
    const anchor = byX[i];
    const tolerance = anchor.w * 2.5;
    const aligned = candidates
      .filter(p => Math.abs(p.cx - anchor.cx) < tolerance)
      .sort((a, b) => a.cy - b.cy);
    if (aligned.length >= Math.min(3, candidates.length)) {
      rowPanels = aligned.slice(0, 5);
      break;
    }
  }

  if (!rowPanels) {
    // Fallback: take rightmost panels
    rowPanels = byX.slice(0, Math.min(5, byX.length)).sort((a, b) => a.cy - b.cy);
  }

  // Col panels: from remaining, find horizontally aligned at bottom
  const remaining = candidates.filter(p => !rowPanels.includes(p));
  
  let colPanels = null;
  if (remaining.length > 0) {
    const byY = [...remaining].sort((a, b) => b.cy - a.cy);
    for (let i = 0; i < Math.min(3, byY.length); i++) {
      const anchor = byY[i];
      const tolerance = anchor.h * 2.5;
      const aligned = remaining
        .filter(p => Math.abs(p.cy - anchor.cy) < tolerance)
        .sort((a, b) => a.cx - b.cx);
      if (aligned.length >= Math.min(3, remaining.length)) {
        colPanels = aligned.slice(0, 5);
        break;
      }
    }
    if (!colPanels) {
      colPanels = byY.slice(0, Math.min(5, byY.length)).sort((a, b) => a.cx - b.cx);
    }
  } else {
    colPanels = [];
  }

  return { rowPanels: rowPanels.slice(0, 5), colPanels: (colPanels || []).slice(0, 5) };
}

/* ─── Digit reading from detected panels ─── */

function getTextMask(canvas, region) {
  const ctx = canvas.getContext("2d");
  const rx = Math.max(0, Math.round(region.x));
  const ry = Math.max(0, Math.round(region.y));
  const rw = Math.min(Math.round(region.w), canvas.width - rx);
  const rh = Math.min(Math.round(region.h), canvas.height - ry);

  if (rw <= 4 || rh <= 4) return { mask: new Uint8Array(0), w: 0, h: 0 };

  const imgData = ctx.getImageData(rx, ry, rw, rh);
  const data = imgData.data;

  // Sample background luminance from edges
  let bgLum = 0, bgCount = 0;
  const sampleH = Math.max(2, Math.floor(rh * 0.15));
  for (let sy = 0; sy < sampleH; sy++) {
    for (let sx = Math.floor(rw * 0.1); sx < Math.floor(rw * 0.9); sx++) {
      const i = (sy * rw + sx) * 4;
      bgLum += data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
      bgCount++;
    }
  }
  for (let sy = rh - sampleH; sy < rh; sy++) {
    for (let sx = Math.floor(rw * 0.1); sx < Math.floor(rw * 0.9); sx++) {
      const i = (sy * rw + sx) * 4;
      bgLum += data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
      bgCount++;
    }
  }
  if (bgCount > 0) bgLum /= bgCount;
  if (bgLum < 50) bgLum = 150;

  const threshold = Math.min(bgLum * 0.4, 80);
  const mask = new Uint8Array(rw * rh);
  for (let py = 0; py < rh; py++) {
    for (let px = 0; px < rw; px++) {
      const i = (py * rw + px) * 4;
      const lum = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
      if (lum < threshold) mask[py * rw + px] = 1;
    }
  }

  return { mask, w: rw, h: rh };
}

function findDigits(mask, w, h, maxDigits) {
  const colDens = new Array(w).fill(0);
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      if (mask[y * w + x]) colDens[x]++;
    }
  }

  const minDens = Math.max(2, h * 0.1);
  const runs = [];
  let inRun = false, start = 0;
  for (let x = 0; x <= w; x++) {
    const d = x < w ? colDens[x] : 0;
    if (d >= minDens && !inRun) { inRun = true; start = x; }
    else if (d < minDens && inRun) {
      inRun = false;
      if (x - start >= w * 0.06) runs.push({ x1: start, x2: x });
    }
  }

  if (runs.length === 0) return [];

  // Merge close runs
  const merged = [runs[0]];
  for (let i = 1; i < runs.length; i++) {
    const prev = merged[merged.length - 1];
    if (runs[i].x1 - prev.x2 < w * 0.04) {
      prev.x2 = runs[i].x2;
    } else {
      merged.push(runs[i]);
    }
  }

  // Split extra-wide runs
  let digits = [];
  for (const run of merged) {
    const runW = run.x2 - run.x1;
    if (runW > w * 0.6 && maxDigits >= 2) {
      const mid = run.x1 + Math.floor(runW / 2);
      digits.push({ x1: run.x1, x2: mid });
      digits.push({ x1: mid, x2: run.x2 });
    } else {
      digits.push(run);
    }
  }

  if (digits.length > maxDigits) {
    digits.sort((a, b) => (b.x2 - b.x1) - (a.x2 - a.x1));
    digits = digits.slice(0, maxDigits);
    digits.sort((a, b) => a.x1 - b.x1);
  }

  return digits.map(({ x1, x2 }) => {
    let top = h, bottom = 0;
    for (let y = 0; y < h; y++) {
      for (let x = x1; x < x2; x++) {
        if (mask[y * w + x]) { if (y < top) top = y; if (y > bottom) bottom = y; }
      }
    }
    if (top >= bottom) return null;
    return { x: x1, y: top, w: x2 - x1, h: bottom - top + 1 };
  }).filter(Boolean);
}

function normalizeDigit(mask, maskW, bounds) {
  const gw = 7, gh = 10;
  const grid = new Array(gw * gh).fill(0);
  for (let gy = 0; gy < gh; gy++) {
    for (let gx = 0; gx < gw; gx++) {
      const srcX1 = Math.floor(bounds.x + (gx / gw) * bounds.w);
      const srcY1 = Math.floor(bounds.y + (gy / gh) * bounds.h);
      const srcX2 = Math.ceil(bounds.x + ((gx + 1) / gw) * bounds.w);
      const srcY2 = Math.ceil(bounds.y + ((gy + 1) / gh) * bounds.h);
      let filled = 0, total = 0;
      for (let sy = srcY1; sy < srcY2; sy++) {
        for (let sx = srcX1; sx < srcX2; sx++) {
          if (sx >= 0 && sx < maskW && sy >= 0) { total++; if (mask[sy * maskW + sx]) filled++; }
        }
      }
      grid[gy * gw + gx] = total > 0 && filled / total > 0.35 ? 1 : 0;
    }
  }
  return grid;
}

/* ─── Templates ─── */
const TEMPLATES = [
  [0,0,1,1,1,0,0,0,1,1,0,1,1,0,1,1,0,0,0,1,1,1,1,0,0,0,1,1,1,1,0,0,0,1,1,1,1,0,0,0,1,1,1,1,0,0,0,1,1,1,1,0,0,0,1,1,0,1,1,0,1,1,0,0,0,1,1,1,0,0],
  [0,0,0,1,1,0,0,0,0,1,1,1,0,0,0,1,1,1,1,0,0,0,0,0,1,1,0,0,0,0,0,1,1,0,0,0,0,0,1,1,0,0,0,0,0,1,1,0,0,0,0,0,1,1,0,0,0,0,0,1,1,0,0,0,1,1,1,1,1,0],
  [0,1,1,1,1,1,0,1,1,0,0,0,1,1,0,0,0,0,0,1,1,0,0,0,0,1,1,0,0,0,0,1,1,0,0,0,0,1,1,0,0,0,0,1,1,0,0,0,0,1,1,0,0,0,0,1,1,0,0,0,0,0,1,1,1,1,1,1,1,1],
  [0,1,1,1,1,1,0,1,1,0,0,0,1,1,0,0,0,0,0,1,1,0,0,0,0,0,1,1,0,0,1,1,1,1,0,0,0,0,0,0,1,1,0,0,0,0,0,1,1,0,0,0,0,0,1,1,1,1,0,0,0,1,1,0,1,1,1,1,1,0],
  [0,0,0,0,1,1,0,0,0,0,1,1,1,0,0,0,1,1,1,1,0,0,1,1,0,1,1,0,1,1,0,0,1,1,0,1,1,1,1,1,1,1,0,0,0,0,1,1,0,0,0,0,0,1,1,0,0,0,0,0,1,1,0,0,0,0,0,1,1,0],
  [1,1,1,1,1,1,1,1,1,0,0,0,0,0,1,1,0,0,0,0,0,1,1,1,1,1,1,0,0,0,0,0,0,1,1,0,0,0,0,0,1,1,0,0,0,0,0,1,1,0,0,0,0,0,1,1,1,1,0,0,0,1,1,0,1,1,1,1,1,0],
  [0,0,1,1,1,1,0,0,1,1,0,0,0,0,1,1,0,0,0,0,0,1,1,0,0,0,0,0,1,1,1,1,1,1,0,1,1,0,0,0,1,1,1,1,0,0,0,1,1,1,1,0,0,0,1,1,0,1,1,0,0,1,1,0,0,1,1,1,1,0],
  [1,1,1,1,1,1,1,0,0,0,0,0,1,1,0,0,0,0,1,1,0,0,0,0,0,1,1,0,0,0,0,1,1,0,0,0,0,0,1,1,0,0,0,0,1,1,0,0,0,0,0,1,1,0,0,0,0,0,1,1,0,0,0,0,0,1,1,0,0,0],
  [0,1,1,1,1,1,0,1,1,0,0,0,1,1,1,1,0,0,0,1,1,1,1,0,0,0,1,1,0,1,1,1,1,1,0,1,1,0,0,0,1,1,1,1,0,0,0,1,1,1,1,0,0,0,1,1,1,1,0,0,0,1,1,0,1,1,1,1,1,0],
  [0,1,1,1,1,1,0,1,1,0,0,0,1,1,1,1,0,0,0,1,1,1,1,0,0,0,1,1,0,1,1,1,1,1,1,0,0,0,0,0,1,1,0,0,0,0,0,1,1,0,0,0,0,0,1,1,0,0,0,0,1,1,0,0,1,1,1,1,0,0],
];

function matchDigit(grid) {
  let bestDigit = 0, bestScore = 0;
  for (let d = 0; d <= 9; d++) {
    let match = 0;
    for (let i = 0; i < 70; i++) { if (grid[i] === TEMPLATES[d][i]) match++; }
    if (match > bestScore) { bestScore = match; bestDigit = d; }
  }
  return { digit: bestDigit, confidence: bestScore / 70 };
}

function readPoints(canvas, region) {
  const { mask, w, h } = getTextMask(canvas, region);
  if (w === 0 || h === 0) return null;
  const digits = findDigits(mask, w, h, 2);
  if (digits.length === 0) return null;
  let result = 0, validCount = 0;
  for (const bounds of digits) {
    const grid = normalizeDigit(mask, w, bounds);
    const { digit, confidence } = matchDigit(grid);
    if (confidence > 0.45) { result = result * 10 + digit; validCount++; }
  }
  if (validCount === 0) return null;
  return Math.min(result, 15);
}

function readBombs(canvas, region) {
  const { mask, w, h } = getTextMask(canvas, region);
  if (w === 0 || h === 0) return null;
  const digits = findDigits(mask, w, h, 1);
  if (digits.length === 0) return null;
  const bounds = digits[digits.length - 1];
  const grid = normalizeDigit(mask, w, bounds);
  const { digit, confidence } = matchDigit(grid);
  if (confidence < 0.45) return null;
  return Math.min(digit, 5);
}

/* ─── Main processing pipeline ─── */

function processGameScreenshot(canvas) {
  // 1. Find all colored panels by their background color
  const panels = findColoredPanels(canvas);

  // 2. Validate with Voltorb icon detection
  const validated = validatePanelsWithVoltorb(canvas, panels);

  // Use validated panels if we got enough, otherwise fall back to color-only
  const usePanels = validated.length >= 6 ? validated : panels;

  // 3. Classify into row hints (right side) and column hints (bottom)
  // Even if we don't have 10, try to classify what we have
  let rowPanels = [];
  let colPanels = [];

  if (usePanels.length >= 3) {
    const classified = classifyPanels(usePanels);
    if (classified) {
      rowPanels = classified.rowPanels;
      colPanels = classified.colPanels;
    } else {
      // Can't classify — try heuristic: sort by position
      // Rightmost panels = row hints, bottommost = col hints
      const sorted = [...usePanels].sort((a, b) => b.cx - a.cx);
      rowPanels = sorted.slice(0, Math.min(5, Math.ceil(sorted.length / 2))).sort((a, b) => a.cy - b.cy);
      colPanels = sorted.slice(Math.min(5, Math.ceil(sorted.length / 2))).sort((a, b) => a.cx - b.cx);
    }
  }

  // 4. Read digits from each panel (fill what we can)
  const readPanel = (panel) => {
    let ptsRegion, bombRegion;

    if (panel.voltorb && panel.voltorb.found) {
      const icon = panel.voltorb;
      const iconR = icon.radius * 1.2;
      ptsRegion = {
        x: panel.x + panel.w * 0.05,
        y: panel.y,
        w: panel.w * 0.9,
        h: Math.max(5, (icon.y - iconR) - panel.y),
      };
      bombRegion = {
        x: icon.x + iconR * 0.5,
        y: icon.y - iconR,
        w: Math.max(5, (panel.x + panel.w) - (icon.x + iconR * 0.5) - panel.w * 0.05),
        h: iconR * 2.2,
      };
    } else {
      ptsRegion = {
        x: panel.x + panel.w * 0.1,
        y: panel.y,
        w: panel.w * 0.8,
        h: panel.h * 0.45,
      };
      bombRegion = {
        x: panel.x + panel.w * 0.45,
        y: panel.y + panel.h * 0.52,
        w: panel.w * 0.48,
        h: panel.h * 0.42,
      };
    }

    const pts = readPoints(canvas, ptsRegion);
    const bombs = readBombs(canvas, bombRegion);
    return {
      pts: pts !== null ? String(pts) : "",
      bombs: bombs !== null ? String(bombs) : "",
    };
  };

  // Pad to 5 with empty values if we didn't find enough
  const emptyHint = { pts: "", bombs: "" };
  const rowResults = [
    ...rowPanels.map(readPanel),
    ...Array(Math.max(0, 5 - rowPanels.length)).fill(emptyHint),
  ].slice(0, 5);
  const colResults = [
    ...colPanels.map(readPanel),
    ...Array(Math.max(0, 5 - colPanels.length)).fill(emptyHint),
  ].slice(0, 5);

  return {
    rowResults, colResults, rowPanels, colPanels,
    allPanels: panels, validatedCount: validated.length,
    totalFound: usePanels.length,
  };
}

/* ═══════════════════════════════════════════════════════
   COMPONENT
═══════════════════════════════════════════════════════ */
export default function PhotoCapture({ onHintsDetected }) {
  const [status, setStatus] = useState("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [debugInfo, setDebugInfo] = useState("");
  const [debugImg, setDebugImg] = useState(null);
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);

  const processImage = async (file) => {
    setStatus("processing");
    setErrorMsg("");
    setDebugInfo("");
    setDebugImg(null);

    try {
      const canvas = await loadImageToCanvas(file);
      const { rowResults, colResults, rowPanels, colPanels, allPanels, validatedCount, totalFound } = processGameScreenshot(canvas);

      // Generate debug overlay
      const dCanvas = document.createElement("canvas");
      dCanvas.width = canvas.width;
      dCanvas.height = canvas.height;
      const dCtx = dCanvas.getContext("2d");
      dCtx.drawImage(canvas, 0, 0);

      // Draw all detected panels (thin yellow)
      dCtx.strokeStyle = "#FFFF00";
      dCtx.lineWidth = 1;
      allPanels.forEach(p => dCtx.strokeRect(p.x, p.y, p.w, p.h));

      // Draw row panels (thick green)
      dCtx.strokeStyle = "#00FF00";
      dCtx.lineWidth = Math.max(2, canvas.width * 0.003);
      rowPanels.forEach((p, i) => {
        dCtx.strokeRect(p.x, p.y, p.w, p.h);
        if (p.voltorb && p.voltorb.found) {
          dCtx.fillStyle = "#FF00FF";
          dCtx.beginPath();
          dCtx.arc(p.voltorb.x, p.voltorb.y, 4, 0, Math.PI * 2);
          dCtx.fill();
        }
      });

      // Draw col panels (thick blue)
      dCtx.strokeStyle = "#00AAFF";
      colPanels.forEach((p, i) => {
        dCtx.strokeRect(p.x, p.y, p.w, p.h);
        if (p.voltorb && p.voltorb.found) {
          dCtx.fillStyle = "#FF00FF";
          dCtx.beginPath();
          dCtx.arc(p.voltorb.x, p.voltorb.y, 4, 0, Math.PI * 2);
          dCtx.fill();
        }
      });

      setDebugImg(dCanvas.toDataURL("image/jpeg", 0.5));

      const filledCount = [...rowResults, ...colResults].filter(r => r.pts !== "" || r.bombs !== "").length;

      const rowStr = rowResults.map(r => `${r.pts || "?"}/${r.bombs || "?"}`).join(", ");
      const colStr = colResults.map(r => `${r.pts || "?"}/${r.bombs || "?"}`).join(", ");
      setDebugInfo(`R:[${rowStr}] C:[${colStr}] (${totalFound} found, ${validatedCount}✓)`);

      if (filledCount === 0 && totalFound === 0) {
        setErrorMsg("No panels detected. Make sure the game board is visible.");
        setStatus("error");
      } else {
        setStatus("done");
        onHintsDetected(rowResults, colResults);
      }
    } catch (e) {
      console.error("Processing error:", e);
      setErrorMsg(e.message || "Failed to process image");
      setStatus("error");
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) processImage(file);
  };

  const reset = () => {
    setStatus("idle"); setErrorMsg(""); setDebugInfo(""); setDebugImg(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (cameraInputRef.current) cameraInputRef.current.value = "";
  };

  return (
    <div style={{ marginTop: 10 }}>
      <input ref={fileInputRef} type="file" accept="image/*"
        onChange={handleFileChange} style={{ display: "none" }} />
      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment"
        onChange={handleFileChange} style={{ display: "none" }} />

      {status === "idle" && (
        <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
          <button onClick={() => cameraInputRef.current?.click()} style={btnStyle}>📷 SNAP</button>
          <button onClick={() => fileInputRef.current?.click()} style={btnStyle}>📁 UPLOAD</button>
        </div>
      )}

      {status === "processing" && (
        <div style={{ textAlign: "center" }}>
          <span style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 7, color: "#FFF" }}>ANALYZING...</span>
        </div>
      )}

      {status === "done" && (
        <div style={{ textAlign: "center" }}>
          <span style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 7, color: "#AAFFAA" }}>✓ VERIFY & SOLVE</span>
          <button onClick={reset} style={retryStyle}>RETRY</button>
          {debugInfo && <div style={{ fontFamily: "monospace", fontSize: 9, color: "#AAFFAA88", marginTop: 4, wordBreak: "break-all" }}>{debugInfo}</div>}
          {debugImg && <img src={debugImg} alt="debug" style={{ width: "100%", maxWidth: 280, marginTop: 6, borderRadius: 4, border: "1px solid #FFF3" }} />}
        </div>
      )}

      {status === "error" && (
        <div style={{ textAlign: "center" }}>
          <span style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 6, color: "#FFAAAA" }}>⚠ {errorMsg}</span>
          <button onClick={reset} style={retryStyle}>RETRY</button>
          {debugImg && <img src={debugImg} alt="debug" style={{ width: "100%", maxWidth: 280, marginTop: 6, borderRadius: 4, border: "1px solid #FFF3" }} />}
        </div>
      )}
    </div>
  );
}

const btnStyle = {
  fontFamily: "'Press Start 2P', monospace", fontSize: 8,
  color: "#FFF", background: "linear-gradient(180deg, #D8A838, #B88818)",
  border: "2px solid #987008", borderRadius: 4,
  padding: "8px 12px", cursor: "pointer",
  boxShadow: "0 2px 4px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.3)",
  textShadow: "0 1px 1px rgba(0,0,0,0.3)",
};

const retryStyle = {
  marginLeft: 8, fontFamily: "'Press Start 2P', monospace", fontSize: 7,
  color: "#FFF", background: "transparent",
  border: "2px solid rgba(255,255,255,0.4)", borderRadius: 4,
  padding: "4px 10px", cursor: "pointer",
};
