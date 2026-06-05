import { useState, useRef } from "react";

/* ═══════════════════════════════════════════════════════
   TEMPLATE-BASED DIGIT RECOGNITION FOR VOLTORB FLIP
   
   Strategy:
   1. Find the game board via green-background detection
   2. Locate hint panels using known fixed proportions
   3. For each panel, isolate the text by finding pixels that are
      MUCH darker than the panel's colored background
   4. Find exactly 2 digits in the points region, 1 digit in bombs
   5. Match each digit against 7x10 templates
   
   Key constraints:
   - Points: always displayed as 2-digit zero-padded (00-15)
   - Bombs: always 1 digit (0-5)
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

  // Find the green game background
  // The game uses a specific medium-green: roughly R=60-130, G=130-190, B=60-130
  let top = h, bottom = 0, left = w, right = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      // Specifically target the Voltorb Flip green (not just any green)
      if (g > 120 && g < 200 && r > 50 && r < 150 && b > 50 && b < 150 &&
          g > r && g > b && (g - r) > 20) {
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

  // From the Voltorb Flip game layout (extremely consistent):
  // The green area contains a 5x5 grid + hint panels + some chrome
  //
  // For the wikihow screenshot style (just the board, minimal chrome):
  // Grid: left ~4% to ~67%, top ~3% to ~81%
  // Row hints: ~68% to ~83% horizontal, aligned with rows
  // Col hints: ~82% to ~98% vertical, aligned with cols

  const gridL = bx + bw * 0.04;
  const gridT = by + bh * 0.03;
  const gridR = bx + bw * 0.67;
  const gridB = by + bh * 0.81;
  const cellW = (gridR - gridL) / 5;
  const cellH = (gridB - gridT) / 5;

  // Row hint panels
  const rhL = bx + bw * 0.68;
  const rhW = bw * 0.15;
  const rowPanels = [];
  for (let r = 0; r < 5; r++) {
    rowPanels.push({ x: rhL, y: gridT + r * cellH, w: rhW, h: cellH });
  }

  // Col hint panels
  const chT = by + bh * 0.82;
  const chH = bh * 0.16;
  const colPanels = [];
  for (let c = 0; c < 5; c++) {
    colPanels.push({ x: gridL + c * cellW, y: chT, w: cellW, h: chH });
  }

  return { rowPanels, colPanels };
}

/* ─── Text isolation ─── */

/**
 * Extract a binary text mask from a specific region of the canvas.
 * 
 * Critical improvement: We sample the background from the CENTER of the region
 * (not edges which might be borders or adjacent panels), and use a stricter
 * threshold. The text in the game is always very dark (near black) on a
 * brightly colored panel background.
 */
function getTextMask(canvas, region) {
  const ctx = canvas.getContext("2d");
  const rx = Math.max(0, Math.round(region.x));
  const ry = Math.max(0, Math.round(region.y));
  const rw = Math.min(Math.round(region.w), canvas.width - rx);
  const rh = Math.min(Math.round(region.h), canvas.height - ry);

  if (rw <= 4 || rh <= 4) return { mask: new Uint8Array(0), w: 0, h: 0 };

  const imgData = ctx.getImageData(rx, ry, rw, rh);
  const data = imgData.data;

  // Sample background from a strip near the top (where there's usually no text)
  // and from left/right edges
  let bgLum = 0, bgCount = 0;
  
  // Top 15% strip
  const sampleH = Math.max(2, Math.floor(rh * 0.15));
  for (let sy = 0; sy < sampleH; sy++) {
    for (let sx = Math.floor(rw * 0.2); sx < Math.floor(rw * 0.8); sx++) {
      const i = (sy * rw + sx) * 4;
      bgLum += data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
      bgCount++;
    }
  }
  // Left edge strip
  for (let sy = Math.floor(rh * 0.2); sy < Math.floor(rh * 0.8); sy++) {
    for (let sx = 0; sx < Math.max(2, Math.floor(rw * 0.1)); sx++) {
      const i = (sy * rw + sx) * 4;
      bgLum += data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
      bgCount++;
    }
  }

  if (bgCount > 0) bgLum /= bgCount;
  if (bgLum < 50) bgLum = 150; // Fallback if background is too dark

  // Text threshold: pixels must be MUCH darker than background
  // The game text is nearly black (lum ~20-60) on colored bg (lum ~120-200)
  const threshold = Math.min(bgLum * 0.4, 80);

  const mask = new Uint8Array(rw * rh);
  for (let py = 0; py < rh; py++) {
    for (let px = 0; px < rw; px++) {
      const i = (py * rw + px) * 4;
      const lum = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
      if (lum < threshold) {
        mask[py * rw + px] = 1;
      }
    }
  }

  return { mask, w: rw, h: rh };
}

/* ─── Digit finding with strict constraints ─── */

/**
 * Find digit bounding boxes in a text mask.
 * maxDigits constrains how many we expect (2 for pts, 1 for bombs).
 */
function findDigits(mask, w, h, maxDigits) {
  // Column density profile
  const colDens = new Array(w).fill(0);
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      if (mask[y * w + x]) colDens[x]++;
    }
  }

  // Find runs of columns with significant text pixels
  // Use a higher threshold to avoid noise
  const minDens = Math.max(2, h * 0.1);
  const runs = [];
  let inRun = false, start = 0;

  for (let x = 0; x <= w; x++) {
    const d = x < w ? colDens[x] : 0;
    if (d >= minDens && !inRun) { inRun = true; start = x; }
    else if (d < minDens && inRun) {
      inRun = false;
      const runW = x - start;
      // A real digit should be at least 8% of the region width
      if (runW >= w * 0.08) {
        runs.push({ x1: start, x2: x });
      }
    }
  }

  if (runs.length === 0) return [];

  // If we have more runs than expected, merge close ones or take the largest
  // First, merge runs that are very close together (< 10% gap)
  const merged = [runs[0]];
  for (let i = 1; i < runs.length; i++) {
    const prev = merged[merged.length - 1];
    const gap = runs[i].x1 - prev.x2;
    if (gap < w * 0.05) {
      // Merge
      prev.x2 = runs[i].x2;
    } else {
      merged.push(runs[i]);
    }
  }

  // If still too many, try to split merged runs that are extra wide
  let digits = [];
  for (const run of merged) {
    const runW = run.x2 - run.x1;
    // If a run is wider than 60% of region, it might be 2 digits merged
    if (runW > w * 0.6 && maxDigits >= 2) {
      const mid = run.x1 + Math.floor(runW / 2);
      digits.push({ x1: run.x1, x2: mid });
      digits.push({ x1: mid, x2: run.x2 });
    } else {
      digits.push(run);
    }
  }

  // Take at most maxDigits (prefer the widest/tallest ones)
  if (digits.length > maxDigits) {
    digits.sort((a, b) => (b.x2 - b.x1) - (a.x2 - a.x1));
    digits = digits.slice(0, maxDigits);
    digits.sort((a, b) => a.x1 - b.x1); // Re-sort left to right
  }

  // Get vertical bounds for each digit
  return digits.map(({ x1, x2 }) => {
    let top = h, bottom = 0;
    for (let y = 0; y < h; y++) {
      for (let x = x1; x < x2; x++) {
        if (mask[y * w + x]) {
          if (y < top) top = y;
          if (y > bottom) bottom = y;
        }
      }
    }
    if (top >= bottom) return null;
    return { x: x1, y: top, w: x2 - x1, h: bottom - top + 1 };
  }).filter(Boolean);
}

/* ─── Normalize digit to 7x10 grid ─── */

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
          if (sx >= 0 && sx < maskW && sy >= 0) {
            total++;
            if (mask[sy * maskW + sx]) filled++;
          }
        }
      }
      grid[gy * gw + gx] = total > 0 && filled / total > 0.35 ? 1 : 0;
    }
  }
  return grid;
}

/* ─── Digit templates (7x10 binary grids) ─── */

const TEMPLATES = [
  // 0
  [0,0,1,1,1,0,0, 0,1,1,0,1,1,0, 1,1,0,0,0,1,1, 1,1,0,0,0,1,1, 1,1,0,0,0,1,1, 1,1,0,0,0,1,1, 1,1,0,0,0,1,1, 1,1,0,0,0,1,1, 0,1,1,0,1,1,0, 0,0,1,1,1,0,0],
  // 1
  [0,0,0,1,1,0,0, 0,0,1,1,1,0,0, 0,1,1,1,1,0,0, 0,0,0,1,1,0,0, 0,0,0,1,1,0,0, 0,0,0,1,1,0,0, 0,0,0,1,1,0,0, 0,0,0,1,1,0,0, 0,0,0,1,1,0,0, 0,1,1,1,1,1,0],
  // 2
  [0,1,1,1,1,1,0, 1,1,0,0,0,1,1, 0,0,0,0,0,1,1, 0,0,0,0,1,1,0, 0,0,0,1,1,0,0, 0,0,1,1,0,0,0, 0,1,1,0,0,0,0, 1,1,0,0,0,0,0, 1,1,0,0,0,0,0, 1,1,1,1,1,1,1],
  // 3
  [0,1,1,1,1,1,0, 1,1,0,0,0,1,1, 0,0,0,0,0,1,1, 0,0,0,0,0,1,1, 0,0,1,1,1,1,0, 0,0,0,0,0,1,1, 0,0,0,0,0,1,1, 0,0,0,0,0,1,1, 1,1,0,0,0,1,1, 0,1,1,1,1,1,0],
  // 4
  [0,0,0,0,1,1,0, 0,0,0,1,1,1,0, 0,0,1,1,1,1,0, 0,1,1,0,1,1,0, 1,1,0,0,1,1,0, 1,1,1,1,1,1,1, 0,0,0,0,1,1,0, 0,0,0,0,1,1,0, 0,0,0,0,1,1,0, 0,0,0,0,1,1,0],
  // 5
  [1,1,1,1,1,1,1, 1,1,0,0,0,0,0, 1,1,0,0,0,0,0, 1,1,1,1,1,1,0, 0,0,0,0,0,1,1, 0,0,0,0,0,1,1, 0,0,0,0,0,1,1, 0,0,0,0,0,1,1, 1,1,0,0,0,1,1, 0,1,1,1,1,1,0],
  // 6
  [0,0,1,1,1,1,0, 0,1,1,0,0,0,0, 1,1,0,0,0,0,0, 1,1,0,0,0,0,0, 1,1,1,1,1,1,0, 1,1,0,0,0,1,1, 1,1,0,0,0,1,1, 1,1,0,0,0,1,1, 0,1,1,0,0,1,1, 0,0,1,1,1,1,0],
  // 7
  [1,1,1,1,1,1,1, 0,0,0,0,0,1,1, 0,0,0,0,1,1,0, 0,0,0,0,1,1,0, 0,0,0,1,1,0,0, 0,0,0,1,1,0,0, 0,0,1,1,0,0,0, 0,0,1,1,0,0,0, 0,0,1,1,0,0,0, 0,0,1,1,0,0,0],
  // 8
  [0,1,1,1,1,1,0, 1,1,0,0,0,1,1, 1,1,0,0,0,1,1, 1,1,0,0,0,1,1, 0,1,1,1,1,1,0, 1,1,0,0,0,1,1, 1,1,0,0,0,1,1, 1,1,0,0,0,1,1, 1,1,0,0,0,1,1, 0,1,1,1,1,1,0],
  // 9
  [0,1,1,1,1,1,0, 1,1,0,0,0,1,1, 1,1,0,0,0,1,1, 1,1,0,0,0,1,1, 0,1,1,1,1,1,1, 0,0,0,0,0,1,1, 0,0,0,0,0,1,1, 0,0,0,0,0,1,1, 0,0,0,0,1,1,0, 0,1,1,1,1,0,0],
];

/**
 * Match a normalized 7x10 digit grid against all templates.
 * Returns { digit, confidence } where confidence is match percentage.
 */
function matchDigit(grid) {
  let bestDigit = 0;
  let bestScore = 0;

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

  return { digit: bestDigit, confidence: bestScore / 70 };
}

/* ─── Read numbers from panel regions ─── */

/**
 * Read a 2-digit points value from a panel's top region.
 * Always expects exactly 2 digits (game shows "03", "05", "08", etc.)
 */
function readPoints(canvas, region) {
  const { mask, w, h } = getTextMask(canvas, region);
  if (w === 0 || h === 0) return null;

  const digits = findDigits(mask, w, h, 2);
  if (digits.length === 0) return null;

  let result = 0;
  let validCount = 0;
  for (const bounds of digits) {
    const grid = normalizeDigit(mask, w, bounds);
    const { digit, confidence } = matchDigit(grid);
    if (confidence > 0.5) {
      result = result * 10 + digit;
      validCount++;
    }
  }

  // Clamp to valid range
  if (validCount === 0) return null;
  if (result > 15) {
    // If we got something > 15, likely a misread. 
    // Try taking just the last digit or clamping.
    if (validCount === 2) {
      // Re-read: maybe first "digit" was noise, take only second
      const lastDigit = result % 10;
      if (lastDigit <= 15) return lastDigit;
    }
    return Math.min(result, 15);
  }
  return result;
}

/**
 * Read a 1-digit bomb count from a panel's bottom-right region.
 * Always expects exactly 1 digit (0-5).
 */
function readBombs(canvas, region) {
  const { mask, w, h } = getTextMask(canvas, region);
  if (w === 0 || h === 0) return null;

  const digits = findDigits(mask, w, h, 1);
  if (digits.length === 0) return null;

  // Take the last (rightmost) digit found — this avoids reading the Voltorb sprite
  const bounds = digits[digits.length - 1];
  const grid = normalizeDigit(mask, w, bounds);
  const { digit, confidence } = matchDigit(grid);

  if (confidence < 0.5) return null;
  return Math.min(digit, 5); // Clamp to valid bomb range
}

/* ─── Main processing ─── */

function processGameScreenshot(canvas) {
  const board = findBoardBounds(canvas);
  const { rowPanels, colPanels } = getHintRegions(board);

  const readPanel = (panel) => {
    // Points: top ~45% of panel, inset 15% from sides
    const ptsRegion = {
      x: panel.x + panel.w * 0.15,
      y: panel.y + panel.h * 0.03,
      w: panel.w * 0.70,
      h: panel.h * 0.43,
    };
    // Bombs: bottom-right ~35% of panel (right of voltorb icon)
    const bombRegion = {
      x: panel.x + panel.w * 0.55,
      y: panel.y + panel.h * 0.55,
      w: panel.w * 0.38,
      h: panel.h * 0.40,
    };

    const pts = readPoints(canvas, ptsRegion);
    const bombs = readBombs(canvas, bombRegion);
    return {
      pts: pts !== null ? String(pts) : "",
      bombs: bombs !== null ? String(bombs) : "",
    };
  };

  const rowResults = rowPanels.map(readPanel);
  const colResults = colPanels.map(readPanel);

  return { rowResults, colResults, board, rowPanels, colPanels };
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
      const { rowResults, colResults, board, rowPanels, colPanels } = processGameScreenshot(canvas);

      // Generate debug overlay
      const dCanvas = document.createElement("canvas");
      dCanvas.width = canvas.width;
      dCanvas.height = canvas.height;
      const dCtx = dCanvas.getContext("2d");
      dCtx.drawImage(canvas, 0, 0);

      // Board bounds (red)
      dCtx.strokeStyle = "#FF0000";
      dCtx.lineWidth = Math.max(2, canvas.width * 0.003);
      dCtx.strokeRect(board.x, board.y, board.w, board.h);

      // Row panels (green)
      dCtx.strokeStyle = "#00FF00";
      dCtx.lineWidth = Math.max(1, canvas.width * 0.002);
      rowPanels.forEach(p => dCtx.strokeRect(p.x, p.y, p.w, p.h));

      // Col panels (blue)
      dCtx.strokeStyle = "#0088FF";
      colPanels.forEach(p => dCtx.strokeRect(p.x, p.y, p.w, p.h));

      setDebugImg(dCanvas.toDataURL("image/jpeg", 0.5));

      // Check if we got reasonable results
      const allEmpty = [...rowResults, ...colResults].every(r => r.pts === "" && r.bombs === "");
      if (allEmpty) {
        throw new Error("No values detected. Ensure the game board is fully visible.");
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
            ✓ VERIFY & SOLVE
          </span>
          <button onClick={reset} style={retryStyle}>RETRY</button>
          {debugInfo && (
            <div style={{
              fontFamily: "monospace", fontSize: 9, color: "#AAFFAA88",
              marginTop: 4, wordBreak: "break-all",
            }}>{debugInfo}</div>
          )}
          {debugImg && (
            <img src={debugImg} alt="debug overlay" style={{
              width: "100%", maxWidth: 280, marginTop: 6,
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
            <img src={debugImg} alt="debug overlay" style={{
              width: "100%", maxWidth: 280, marginTop: 6,
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
