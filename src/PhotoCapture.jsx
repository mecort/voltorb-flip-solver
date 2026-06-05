import { useState, useRef } from "react";

/* ═══════════════════════════════════════════════════════
   TEMPLATE-BASED DIGIT RECOGNITION
   
   The Voltorb Flip game uses a fixed bitmap font. Digits always
   look the same. Instead of OCR, we:
   1. Find the board via green-background detection
   2. Locate hint panels using known layout proportions
   3. Extract digit regions from each panel
   4. Match extracted digits against pre-built templates
   
   Templates are encoded as binary pixel grids representing
   each digit 0-9 in the game's font.
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

/* ─── Board detection ─── */

function findBoardBounds(canvas) {
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;
  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;

  let top = h, bottom = 0, left = w, right = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      if (g > 90 && g > r * 1.05 && g > b * 1.1 && r > 20 && r < 200) {
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

/* ─── Panel location using known proportions ─── */

function getHintRegions(board) {
  const { x: bx, y: by, w: bw, h: bh } = board;

  // Measured from actual Voltorb Flip screenshots:
  // The board (green area) contains the 5x5 grid + hint panels.
  // 
  // Layout proportions (relative to green area bounds):
  // Grid of cards: ~5% to ~67% horizontal, ~4% to ~81% vertical
  // Row hint panels (right of grid): ~68% to ~84% horizontal
  // Col hint panels (below grid): ~82% to ~98% vertical
  //
  // Each cell/panel occupies 1/5 of the grid span in its axis.

  const gridL = bx + bw * 0.04;
  const gridT = by + bh * 0.03;
  const gridR = bx + bw * 0.67;
  const gridB = by + bh * 0.81;
  const cellW = (gridR - gridL) / 5;
  const cellH = (gridB - gridT) / 5;

  // Row hints (right side) — same vertical positions as grid rows
  const rhL = bx + bw * 0.68;
  const rhW = bw * 0.15;
  const rowPanels = [];
  for (let r = 0; r < 5; r++) {
    const top = gridT + r * cellH;
    rowPanels.push({ x: rhL, y: top, w: rhW, h: cellH });
  }

  // Col hints (bottom) — same horizontal positions as grid columns
  const chT = by + bh * 0.82;
  const chH = bh * 0.16;
  const colPanels = [];
  for (let c = 0; c < 5; c++) {
    const left = gridL + c * cellW;
    colPanels.push({ x: left, y: chT, w: cellW, h: chH });
  }

  return { rowPanels, colPanels };
}

/* ─── Digit extraction via column profiling ─── */

/**
 * Convert a canvas region to a binary "text" mask.
 * Text is dark on a colored background.
 * Returns { mask, w, h } where mask[y*w+x] = true if pixel is text.
 */
function regionToTextMask(canvas, region) {
  const ctx = canvas.getContext("2d");
  const { x, y, w, h } = region;
  const rx = Math.max(0, Math.round(x));
  const ry = Math.max(0, Math.round(y));
  const rw = Math.min(Math.round(w), canvas.width - rx);
  const rh = Math.min(Math.round(h), canvas.height - ry);
  
  if (rw <= 0 || rh <= 0) return { mask: [], w: 0, h: 0 };
  
  const imgData = ctx.getImageData(rx, ry, rw, rh);
  const data = imgData.data;

  // Sample background color from the border pixels (top & bottom rows)
  let bgR = 0, bgG = 0, bgB = 0, bgCount = 0;
  for (let sx = 0; sx < rw; sx++) {
    for (const sy of [0, 1, rh - 1, rh - 2]) {
      if (sy >= 0 && sy < rh) {
        const i = (sy * rw + sx) * 4;
        bgR += data[i]; bgG += data[i + 1]; bgB += data[i + 2];
        bgCount++;
      }
    }
  }
  if (bgCount > 0) { bgR /= bgCount; bgG /= bgCount; bgB /= bgCount; }

  const bgLum = bgR * 0.299 + bgG * 0.587 + bgB * 0.114;

  // Create text mask: text pixels are significantly darker than background
  const mask = new Uint8Array(rw * rh);
  for (let py = 0; py < rh; py++) {
    for (let px = 0; px < rw; px++) {
      const i = (py * rw + px) * 4;
      const lum = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
      // Text is dark relative to the colored background
      if (lum < bgLum * 0.55) {
        mask[py * rw + px] = 1;
      }
    }
  }

  return { mask, w: rw, h: rh };
}

/**
 * From a text mask, find individual digit bounding boxes using column profiling.
 */
function findDigitBounds(mask, w, h) {
  // Get column density
  const colDens = new Array(w).fill(0);
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      if (mask[y * w + x]) colDens[x]++;
    }
  }

  // Find runs of columns with text
  const minDens = h * 0.05;
  const runs = [];
  let inRun = false, start = 0;
  for (let x = 0; x <= w; x++) {
    const d = x < w ? colDens[x] : 0;
    if (d > minDens && !inRun) { inRun = true; start = x; }
    else if (d <= minDens && inRun) {
      inRun = false;
      if (x - start > w * 0.04) runs.push({ x1: start, x2: x });
    }
  }

  // For each run, find vertical bounds
  return runs.map(({ x1, x2 }) => {
    let top = h, bottom = 0;
    for (let y = 0; y < h; y++) {
      for (let x = x1; x < x2; x++) {
        if (mask[y * w + x]) {
          if (y < top) top = y;
          if (y > bottom) bottom = y;
        }
      }
    }
    return { x: x1, y: top, w: x2 - x1, h: bottom - top + 1 };
  }).filter(b => b.h > 2);
}

/**
 * Normalize a digit region to a fixed-size grid (7x10) for matching.
 * Returns an array of 70 values (0 or 1).
 */
function normalizeDigit(mask, maskW, bounds) {
  const gw = 7, gh = 10;
  const grid = new Array(gw * gh).fill(0);
  
  for (let gy = 0; gy < gh; gy++) {
    for (let gx = 0; gx < gw; gx++) {
      // Map grid cell to source pixels
      const srcX = Math.round(bounds.x + (gx / gw) * bounds.w);
      const srcY = Math.round(bounds.y + (gy / gh) * bounds.h);
      const srcX2 = Math.round(bounds.x + ((gx + 1) / gw) * bounds.w);
      const srcY2 = Math.round(bounds.y + ((gy + 1) / gh) * bounds.h);
      
      // Count filled pixels in this cell
      let filled = 0, total = 0;
      for (let sy = srcY; sy < srcY2; sy++) {
        for (let sx = srcX; sx < srcX2; sx++) {
          if (sy >= 0 && sy < (bounds.y + bounds.h) && sx >= 0) {
            total++;
            if (mask[sy * maskW + sx]) filled++;
          }
        }
      }
      grid[gy * gw + gx] = total > 0 && filled / total > 0.3 ? 1 : 0;
    }
  }
  return grid;
}

/* ─── Digit templates (7x10 binary grids) ─── */
// These represent what digits 0-9 look like in the standard bitmap font
// used by Pokémon HGSS Voltorb Flip, normalized to a 7-wide x 10-tall grid.
// 1 = filled, 0 = empty.

const TEMPLATES = {
  0: [
    0,0,1,1,1,0,0,
    0,1,1,0,1,1,0,
    1,1,0,0,0,1,1,
    1,1,0,0,0,1,1,
    1,1,0,0,0,1,1,
    1,1,0,0,0,1,1,
    1,1,0,0,0,1,1,
    1,1,0,0,0,1,1,
    0,1,1,0,1,1,0,
    0,0,1,1,1,0,0,
  ],
  1: [
    0,0,0,1,1,0,0,
    0,0,1,1,1,0,0,
    0,1,1,1,1,0,0,
    0,0,0,1,1,0,0,
    0,0,0,1,1,0,0,
    0,0,0,1,1,0,0,
    0,0,0,1,1,0,0,
    0,0,0,1,1,0,0,
    0,0,0,1,1,0,0,
    0,1,1,1,1,1,0,
  ],
  2: [
    0,1,1,1,1,1,0,
    1,1,0,0,0,1,1,
    0,0,0,0,0,1,1,
    0,0,0,0,0,1,1,
    0,0,0,0,1,1,0,
    0,0,0,1,1,0,0,
    0,0,1,1,0,0,0,
    0,1,1,0,0,0,0,
    1,1,0,0,0,0,0,
    1,1,1,1,1,1,1,
  ],
  3: [
    0,1,1,1,1,1,0,
    1,1,0,0,0,1,1,
    0,0,0,0,0,1,1,
    0,0,0,0,0,1,1,
    0,0,1,1,1,1,0,
    0,0,0,0,0,1,1,
    0,0,0,0,0,1,1,
    0,0,0,0,0,1,1,
    1,1,0,0,0,1,1,
    0,1,1,1,1,1,0,
  ],
  4: [
    0,0,0,0,1,1,0,
    0,0,0,1,1,1,0,
    0,0,1,1,1,1,0,
    0,1,1,0,1,1,0,
    1,1,0,0,1,1,0,
    1,1,1,1,1,1,1,
    0,0,0,0,1,1,0,
    0,0,0,0,1,1,0,
    0,0,0,0,1,1,0,
    0,0,0,0,1,1,0,
  ],
  5: [
    1,1,1,1,1,1,1,
    1,1,0,0,0,0,0,
    1,1,0,0,0,0,0,
    1,1,1,1,1,1,0,
    0,0,0,0,0,1,1,
    0,0,0,0,0,1,1,
    0,0,0,0,0,1,1,
    0,0,0,0,0,1,1,
    1,1,0,0,0,1,1,
    0,1,1,1,1,1,0,
  ],
  6: [
    0,0,1,1,1,1,0,
    0,1,1,0,0,0,0,
    1,1,0,0,0,0,0,
    1,1,0,0,0,0,0,
    1,1,1,1,1,1,0,
    1,1,0,0,0,1,1,
    1,1,0,0,0,1,1,
    1,1,0,0,0,1,1,
    0,1,1,0,0,1,1,
    0,0,1,1,1,1,0,
  ],
  7: [
    1,1,1,1,1,1,1,
    0,0,0,0,0,1,1,
    0,0,0,0,1,1,0,
    0,0,0,0,1,1,0,
    0,0,0,1,1,0,0,
    0,0,0,1,1,0,0,
    0,0,1,1,0,0,0,
    0,0,1,1,0,0,0,
    0,0,1,1,0,0,0,
    0,0,1,1,0,0,0,
  ],
  8: [
    0,1,1,1,1,1,0,
    1,1,0,0,0,1,1,
    1,1,0,0,0,1,1,
    1,1,0,0,0,1,1,
    0,1,1,1,1,1,0,
    1,1,0,0,0,1,1,
    1,1,0,0,0,1,1,
    1,1,0,0,0,1,1,
    1,1,0,0,0,1,1,
    0,1,1,1,1,1,0,
  ],
  9: [
    0,1,1,1,1,1,0,
    1,1,0,0,0,1,1,
    1,1,0,0,0,1,1,
    1,1,0,0,0,1,1,
    0,1,1,1,1,1,1,
    0,0,0,0,0,1,1,
    0,0,0,0,0,1,1,
    0,0,0,0,0,1,1,
    0,0,0,0,1,1,0,
    0,1,1,1,1,0,0,
  ],
};

/**
 * Match a normalized digit grid against all templates.
 * Returns the digit (0-9) with the best match.
 */
function matchDigit(grid) {
  let bestDigit = 0;
  let bestScore = -1;

  for (let d = 0; d <= 9; d++) {
    const tmpl = TEMPLATES[d];
    let match = 0;
    for (let i = 0; i < 70; i++) {
      if (grid[i] === tmpl[i]) match++;
    }
    if (match > bestScore) {
      bestScore = match;
      bestDigit = d;
    }
  }

  return bestDigit;
}

/**
 * Read a number (1 or 2 digits) from a panel sub-region.
 */
function readNumber(canvas, region) {
  const { mask, w, h } = regionToTextMask(canvas, region);
  if (w === 0 || h === 0) return null;

  const digitBounds = findDigitBounds(mask, w, h);
  if (digitBounds.length === 0) return null;

  let result = 0;
  for (const bounds of digitBounds) {
    const grid = normalizeDigit(mask, w, bounds);
    const digit = matchDigit(grid);
    result = result * 10 + digit;
  }
  return result;
}

/* ─── Main processing ─── */

function processGameScreenshot(canvas) {
  const board = findBoardBounds(canvas);
  const { rowPanels, colPanels } = getHintRegions(board);

  const rowResults = rowPanels.map((panel) => {
    // Points: top half of panel
    const ptsRegion = {
      x: panel.x + panel.w * 0.1,
      y: panel.y + panel.h * 0.0,
      w: panel.w * 0.8,
      h: panel.h * 0.48,
    };
    // Bombs: bottom-right of panel (skip voltorb icon on left)
    const bombRegion = {
      x: panel.x + panel.w * 0.5,
      y: panel.y + panel.h * 0.52,
      w: panel.w * 0.45,
      h: panel.h * 0.44,
    };
    const pts = readNumber(canvas, ptsRegion);
    const bombs = readNumber(canvas, bombRegion);
    return {
      pts: pts !== null ? String(pts) : "",
      bombs: bombs !== null ? String(bombs) : "",
    };
  });

  const colResults = colPanels.map((panel) => {
    const ptsRegion = {
      x: panel.x + panel.w * 0.1,
      y: panel.y + panel.h * 0.0,
      w: panel.w * 0.8,
      h: panel.h * 0.48,
    };
    const bombRegion = {
      x: panel.x + panel.w * 0.5,
      y: panel.y + panel.h * 0.52,
      w: panel.w * 0.45,
      h: panel.h * 0.44,
    };
    const pts = readNumber(canvas, ptsRegion);
    const bombs = readNumber(canvas, bombRegion);
    return {
      pts: pts !== null ? String(pts) : "",
      bombs: bombs !== null ? String(bombs) : "",
    };
  });

  return { rowResults, colResults };
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
      
      // Generate debug overlay image
      const debugCanvas = document.createElement("canvas");
      debugCanvas.width = canvas.width;
      debugCanvas.height = canvas.height;
      const dCtx = debugCanvas.getContext("2d");
      dCtx.drawImage(canvas, 0, 0);
      
      const board = findBoardBounds(canvas);
      const { rowPanels, colPanels } = getHintRegions(board);
      
      // Draw debug rectangles
      dCtx.strokeStyle = "#FF0000";
      dCtx.lineWidth = 3;
      dCtx.strokeRect(board.x, board.y, board.w, board.h); // Board bounds in red
      
      dCtx.strokeStyle = "#00FF00";
      dCtx.lineWidth = 2;
      rowPanels.forEach(p => dCtx.strokeRect(p.x, p.y, p.w, p.h));
      
      dCtx.strokeStyle = "#0088FF";
      dCtx.lineWidth = 2;
      colPanels.forEach(p => dCtx.strokeRect(p.x, p.y, p.w, p.h));
      
      setDebugImg(debugCanvas.toDataURL("image/jpeg", 0.6));

      const { rowResults, colResults } = processGameScreenshot(canvas);
      
      const allEmpty = [...rowResults, ...colResults].every(
        r => r.pts === "" && r.bombs === ""
      );
      if (allEmpty) {
        throw new Error("No values detected. Make sure the full game board is visible.");
      }

      const rowStr = rowResults.map(r => `${r.pts}/${r.bombs}`).join(", ");
      const colStr = colResults.map(r => `${r.pts}/${r.bombs}`).join(", ");
      setDebugInfo(`R:[${rowStr}] C:[${colStr}]`);

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
    setErrorMsg("");
    setDebugInfo("");
    setDebugImg(null);
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
          <span style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 7, color: "#FFF" }}>
            ANALYZING...
          </span>
        </div>
      )}

      {status === "done" && (
        <div style={{ textAlign: "center" }}>
          <span style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 7, color: "#AAFFAA" }}>
            ✓ VERIFY VALUES & SOLVE
          </span>
          <button onClick={reset} style={retryStyle}>RETRY</button>
          {debugInfo && (
            <div style={{
              fontFamily: "monospace", fontSize: 9, color: "#AAFFAA88",
              marginTop: 4, wordBreak: "break-all",
            }}>{debugInfo}</div>
          )}
          {debugImg && (
            <img src={debugImg} alt="debug" style={{
              width: "100%", maxWidth: 300, marginTop: 6,
              borderRadius: 4, border: "1px solid #FFF3",
            }} />
          )}
        </div>
      )}

      {status === "error" && (
        <div style={{ textAlign: "center" }}>
          <span style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 6, color: "#FFAAAA" }}>
            ⚠ {errorMsg}
          </span>
          <button onClick={reset} style={retryStyle}>RETRY</button>
          {debugImg && (
            <img src={debugImg} alt="debug" style={{
              width: "100%", maxWidth: 300, marginTop: 6,
              borderRadius: 4, border: "1px solid #FFF3",
            }} />
          )}
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
