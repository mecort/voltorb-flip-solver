import { useState, useRef } from "react";
import Tesseract from "tesseract.js";

/* ═══════════════════════════════════════════════════════
   PHOTO → HINTS PIPELINE
   
   Approach:
   1. Detect game board area by green background
   2. Use fixed proportions (well-known from the game) to locate
      the 5 row hint panels (right side) and 5 col hint panels (bottom)
   3. For each panel, crop the top-half (points) and bottom-right (bombs)
   4. Preprocess each crop aggressively for OCR
   5. Run Tesseract with digit-only whitelist
   
   The key insight: the game layout is extremely consistent.
   The grid is always 5x5, panels are always in the same relative positions.
   Rather than trying to "find" panels dynamically (which is error-prone),
   we detect the board edges and use known proportions.
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

/**
 * Find the game board boundaries by detecting the green playing field.
 * Scans for rows/columns with high green pixel density.
 */
function findBoardBounds(canvas) {
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;
  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;

  function isGameGreen(r, g, b) {
    // The game's green background: various shades of green
    return g > 90 && g > r * 1.05 && g > b * 1.1 && r > 20 && r < 200 && b < 180;
  }

  // Find top/bottom/left/right extents of the green area
  let top = h, bottom = 0, left = w, right = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (isGameGreen(data[i], data[i + 1], data[i + 2])) {
        if (y < top) top = y;
        if (y > bottom) bottom = y;
        if (x < left) left = x;
        if (x > right) right = x;
      }
    }
  }

  if (top >= bottom || left >= right) {
    // Fallback: use entire image
    return { x: 0, y: 0, w, h };
  }

  return { x: left, y: top, w: right - left, h: bottom - top };
}

/**
 * Crop a region from canvas.
 */
function crop(canvas, x, y, w, h) {
  x = Math.max(0, Math.round(x));
  y = Math.max(0, Math.round(y));
  w = Math.max(1, Math.round(w));
  h = Math.max(1, Math.round(h));
  // Clamp to canvas bounds
  if (x + w > canvas.width) w = canvas.width - x;
  if (y + h > canvas.height) h = canvas.height - y;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  ctx.drawImage(canvas, x, y, w, h, 0, 0, w, h);
  return c;
}

/**
 * Preprocess a cropped hint region for OCR:
 * - Scale up 4x (pixel art needs upscaling for Tesseract)
 * - Convert to high-contrast black text on white background
 * - The text in these panels is dark/black on a colored bg
 */
function preprocessForOCR(canvas) {
  // Scale up first
  const scale = 4;
  const big = document.createElement("canvas");
  big.width = canvas.width * scale;
  big.height = canvas.height * scale;
  const bigCtx = big.getContext("2d");
  bigCtx.imageSmoothingEnabled = false; // preserve pixel art
  bigCtx.drawImage(canvas, 0, 0, big.width, big.height);

  // Now threshold: find dark pixels (the text)
  const imgData = bigCtx.getImageData(0, 0, big.width, big.height);
  const d = imgData.data;

  // Sample background brightness from edges
  let bgBrightness = 0, bgCount = 0;
  for (let x = 0; x < big.width; x++) {
    for (let y of [0, 1, big.height - 1, big.height - 2]) {
      const i = (y * big.width + x) * 4;
      bgBrightness += d[i] * 0.299 + d[i+1] * 0.587 + d[i+2] * 0.114;
      bgCount++;
    }
  }
  bgBrightness /= bgCount;

  // Threshold: pixels significantly darker than background = text
  const threshold = bgBrightness * 0.6;

  for (let i = 0; i < d.length; i += 4) {
    const brightness = d[i] * 0.299 + d[i+1] * 0.587 + d[i+2] * 0.114;
    const isText = brightness < threshold;
    d[i] = d[i+1] = d[i+2] = isText ? 0 : 255;
  }

  bigCtx.putImageData(imgData, 0, 0);

  // Add white padding around the image (helps Tesseract)
  const padded = document.createElement("canvas");
  const pad = 20;
  padded.width = big.width + pad * 2;
  padded.height = big.height + pad * 2;
  const pCtx = padded.getContext("2d");
  pCtx.fillStyle = "white";
  pCtx.fillRect(0, 0, padded.width, padded.height);
  pCtx.drawImage(big, pad, pad);

  return padded;
}

/**
 * Given the board bounds, calculate the regions for each hint panel.
 * 
 * From analyzing multiple Voltorb Flip screenshots, the layout proportions are:
 * 
 * The board (green area) contains:
 * - A 5x5 grid of cards starting near the top-left
 * - Row hint panels immediately to the right of the grid
 * - Column hint panels immediately below the grid
 * - Some padding/UI elements around
 * 
 * Typical proportions (relative to green area):
 * - Grid starts at roughly (3%, 4%) to (76%, 80%) of the green area
 * - Each cell is about 14.5% wide, 15% tall
 * - Row hints: x from 76% to 92%, same y as grid rows
 * - Col hints: y from 81% to 97%, same x as grid columns
 */
function getHintRegions(board) {
  const { x: bx, y: by, w: bw, h: bh } = board;

  // Grid spans from about 3% to 75% horizontally, 3% to 79% vertically
  const gridL = bx + bw * 0.03;
  const gridT = by + bh * 0.03;
  const gridR = bx + bw * 0.745;
  const gridB = by + bh * 0.79;

  const cellW = (gridR - gridL) / 5;
  const cellH = (gridB - gridT) / 5;

  // Row hint panels: to the right of grid, same height as cells
  // They span from about 76% to 92% of board width
  const rhL = bx + bw * 0.755;
  const rhR = bx + bw * 0.92;
  const rhW = rhR - rhL;

  const rowHints = [];
  for (let r = 0; r < 5; r++) {
    const top = gridT + r * cellH;
    rowHints.push({
      // Points number: top portion of panel, centered
      pts: { x: rhL + rhW * 0.15, y: top + cellH * 0.02, w: rhW * 0.7, h: cellH * 0.44 },
      // Bomb count: bottom-right area (skip the voltorb icon on the left)
      bombs: { x: rhL + rhW * 0.55, y: top + cellH * 0.50, w: rhW * 0.35, h: cellH * 0.44 },
    });
  }

  // Column hint panels: below the grid, same width as cells
  // They span from about 80% to 97% of board height
  const chT = by + bh * 0.80;
  const chB = by + bh * 0.97;
  const chH = chB - chT;

  const colHints = [];
  for (let c = 0; c < 5; c++) {
    const left = gridL + c * cellW;
    colHints.push({
      // Points number: top portion
      pts: { x: left + cellW * 0.15, y: chT + chH * 0.02, w: cellW * 0.7, h: chH * 0.44 },
      // Bomb count: bottom-right
      bombs: { x: left + cellW * 0.50, y: chT + chH * 0.50, w: cellW * 0.4, h: chH * 0.44 },
    });
  }

  return { rowHints, colHints };
}

/**
 * Run OCR on a small cropped region and return the detected number.
 */
async function ocrNumber(canvas, region, worker) {
  const cropped = crop(canvas, region.x, region.y, region.w, region.h);
  const processed = preprocessForOCR(cropped);

  const { data } = await worker.recognize(processed);
  const text = data.text.replace(/[^0-9]/g, "");
  if (!text) return null;
  const num = parseInt(text, 10);
  return isNaN(num) ? null : num;
}

/**
 * Main processing function.
 */
async function processGameScreenshot(canvas, onProgress) {
  onProgress(5);

  // 1. Find the green board area
  const board = findBoardBounds(canvas);
  onProgress(10);

  // 2. Calculate hint panel positions
  const { rowHints, colHints } = getHintRegions(board);
  onProgress(15);

  // 3. Initialize Tesseract
  const worker = await Tesseract.createWorker("eng");
  await worker.setParameters({
    tessedit_char_whitelist: "0123456789",
    tessedit_pageseg_mode: "7", // single text line
  });
  onProgress(30);

  // 4. OCR each region
  const rowResults = [];
  for (let r = 0; r < 5; r++) {
    const pts = await ocrNumber(canvas, rowHints[r].pts, worker);
    const bombs = await ocrNumber(canvas, rowHints[r].bombs, worker);
    rowResults.push({
      pts: pts !== null ? String(pts) : "",
      bombs: bombs !== null ? String(bombs) : "",
    });
    onProgress(30 + Math.round(((r + 1) / 10) * 60));
  }

  const colResults = [];
  for (let c = 0; c < 5; c++) {
    const pts = await ocrNumber(canvas, colHints[c].pts, worker);
    const bombs = await ocrNumber(canvas, colHints[c].bombs, worker);
    colResults.push({
      pts: pts !== null ? String(pts) : "",
      bombs: bombs !== null ? String(bombs) : "",
    });
    onProgress(30 + Math.round(((5 + c + 1) / 10) * 60));
  }

  await worker.terminate();
  onProgress(100);

  return { rowResults, colResults };
}

/* ═══════════════════════════════════════════════════════
   COMPONENT
═══════════════════════════════════════════════════════ */
export default function PhotoCapture({ onHintsDetected }) {
  const [status, setStatus] = useState("idle");
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState("");
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);

  const processImage = async (file) => {
    setStatus("processing");
    setProgress(0);
    setErrorMsg("");

    try {
      const canvas = await loadImageToCanvas(file);
      const { rowResults, colResults } = await processGameScreenshot(canvas, setProgress);
      setStatus("done");
      onHintsDetected(rowResults, colResults);
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
    setStatus("idle");
    setProgress(0);
    setErrorMsg("");
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
          <button onClick={() => cameraInputRef.current?.click()} style={btnStyle}>
            📷 SNAP
          </button>
          <button onClick={() => fileInputRef.current?.click()} style={btnStyle}>
            📁 UPLOAD
          </button>
        </div>
      )}

      {status === "processing" && (
        <div style={{ textAlign: "center" }}>
          <div style={{
            fontFamily: "'Press Start 2P', monospace", fontSize: 7,
            color: "#FFF", marginBottom: 4,
          }}>SCANNING... {progress}%</div>
          <div style={{
            height: 8, background: "#1A5A3A",
            border: "2px solid #0A3A2A", borderRadius: 4,
            overflow: "hidden",
          }}>
            <div style={{
              height: "100%", width: `${progress}%`,
              background: "linear-gradient(90deg, #D8A838, #E8C848)",
              transition: "width 0.2s", borderRadius: 2,
            }} />
          </div>
        </div>
      )}

      {status === "done" && (
        <div style={{ textAlign: "center" }}>
          <span style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 7, color: "#AAFFAA" }}>
            ✓ LOADED — VERIFY & SOLVE
          </span>
          <button onClick={reset} style={retryStyle}>RETRY</button>
        </div>
      )}

      {status === "error" && (
        <div style={{ textAlign: "center" }}>
          <span style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 6, color: "#FFAAAA" }}>
            ⚠ {errorMsg}
          </span>
          <button onClick={reset} style={retryStyle}>RETRY</button>
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
