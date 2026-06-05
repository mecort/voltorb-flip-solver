import { useState, useRef } from "react";
import Tesseract from "tesseract.js";

/* ═══════════════════════════════════════════════════════
   IMAGE PROCESSING HELPERS
═══════════════════════════════════════════════════════ */

/**
 * Crops a region from a canvas context and returns a new canvas.
 */
function cropCanvas(sourceCanvas, x, y, w, h) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  ctx.drawImage(sourceCanvas, x, y, w, h, 0, 0, w, h);
  return c;
}

/**
 * Preprocesses an image canvas region for better OCR:
 * - Converts to grayscale
 * - Applies threshold to get high-contrast black/white
 * - Inverts if needed (white text on dark bg → black text on white bg)
 */
function preprocessForOCR(canvas) {
  const ctx = canvas.getContext("2d");
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imgData.data;

  // Convert to grayscale and threshold
  let darkPixels = 0;
  for (let i = 0; i < data.length; i += 4) {
    const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    const val = gray > 140 ? 255 : 0;
    data[i] = data[i + 1] = data[i + 2] = val;
    if (val === 0) darkPixels++;
  }

  // If mostly dark, invert (text is likely light on dark background)
  const totalPixels = canvas.width * canvas.height;
  if (darkPixels > totalPixels * 0.5) {
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 255 - data[i];
      data[i + 1] = 255 - data[i + 1];
      data[i + 2] = 255 - data[i + 2];
    }
  }

  ctx.putImageData(imgData, 0, 0);
  return canvas;
}

/**
 * Scale a canvas up for better OCR recognition.
 */
function scaleCanvas(canvas, factor) {
  const c = document.createElement("canvas");
  c.width = canvas.width * factor;
  c.height = canvas.height * factor;
  const ctx = c.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(canvas, 0, 0, c.width, c.height);
  return c;
}

/**
 * Detect the game board boundaries by finding the green background area.
 * Returns normalized coordinates for hint regions.
 */
function findBoardBounds(canvas) {
  const ctx = canvas.getContext("2d");
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imgData.data;
  const w = canvas.width;
  const h = canvas.height;

  // Look for the green game background color (RGB ~100-140, ~180-220, ~80-130)
  // We'll scan to find the bounding box of the game area
  let top = h, bottom = 0, left = w, right = 0;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      // Green background of the game: g > r and g > b
      if (g > 120 && g > r * 1.2 && g > b * 1.3 && r > 50) {
        if (y < top) top = y;
        if (y > bottom) bottom = y;
        if (x < left) left = x;
        if (x > right) right = x;
      }
    }
  }

  // If detection failed, use full image
  if (top >= bottom || left >= right) {
    return { top: 0, left: 0, width: w, height: h };
  }

  return { top, left, width: right - left, height: bottom - top };
}

/**
 * Given the full game screenshot, extract the hint regions.
 * 
 * Voltorb Flip layout (from the screenshot):
 * - 5x5 grid of face-down cards in the center
 * - Row hints on the RIGHT side: colored panels showing 2-digit pts number on top,
 *   Voltorb icon + single digit bomb count on bottom
 * - Column hints on the BOTTOM: same format as row hints
 * - The grid area starts after the header (level/score) at the top
 */
function extractHintRegions(canvas) {
  const w = canvas.width;
  const h = canvas.height;

  const bounds = findBoardBounds(canvas);

  // Work relative to the detected game board area
  const bx = bounds.left;
  const by = bounds.top;
  const bw = bounds.width;
  const bh = bounds.height;

  // Based on Voltorb Flip game layout proportions:
  // Header takes top ~8%
  // Grid area: starts at ~10% from top, goes to ~76% from top
  // Grid left edge: ~5% from left
  // Grid right edge: ~72% from left (before row hints)
  // Row hints: ~74% to ~94% from left
  // Col hints: ~78% to ~94% from top
  // Footer buttons at bottom ~6%

  // Grid area (the 5x5 cards)
  const gridTop = by + bh * 0.10;
  const gridBottom = by + bh * 0.755;
  const gridLeft = bx + bw * 0.05;
  const gridRight = bx + bw * 0.72;

  const cellH = (gridBottom - gridTop) / 5;
  const cellW = (gridRight - gridLeft) / 5;

  // Row hint panels (right side of grid)
  // Each row hint panel is vertically aligned with the corresponding grid row
  // Top half = points number, Bottom half = bomb count (next to voltorb icon)
  const rowHintLeft = bx + bw * 0.74;
  const rowHintRight = bx + bw * 0.94;
  const rowHintW = rowHintRight - rowHintLeft;

  const rowHints = [];
  for (let r = 0; r < 5; r++) {
    const rTop = gridTop + r * cellH + cellH * 0.05;
    const rH = cellH * 0.9;
    rowHints.push({
      // Points: top portion of the hint cell (the 2-digit number)
      pts: { x: rowHintLeft, y: rTop, w: rowHintW, h: rH * 0.5 },
      // Bombs: bottom portion (single digit next to Voltorb icon)
      // We crop more to the right side where the digit is
      bombs: { x: rowHintLeft + rowHintW * 0.5, y: rTop + rH * 0.5, w: rowHintW * 0.5, h: rH * 0.5 },
    });
  }

  // Column hint panels (below the grid)
  const colHintTop = by + bh * 0.775;
  const colHintBottom = by + bh * 0.935;
  const colHintH = colHintBottom - colHintTop;

  const colHints = [];
  for (let c = 0; c < 5; c++) {
    const cLeft = gridLeft + c * cellW + cellW * 0.05;
    const cW = cellW * 0.9;
    colHints.push({
      // Points: top portion
      pts: { x: cLeft, y: colHintTop, w: cW, h: colHintH * 0.5 },
      // Bombs: bottom-right area where the digit is
      bombs: { x: cLeft + cW * 0.5, y: colHintTop + colHintH * 0.5, w: cW * 0.5, h: colHintH * 0.5 },
    });
  }

  return { rowHints, colHints };
}

/**
 * Run OCR on a specific region and extract a number.
 */
async function ocrRegion(canvas, region, worker) {
  let cropped = cropCanvas(canvas, region.x, region.y, region.w, region.h);
  cropped = scaleCanvas(cropped, 3);
  cropped = preprocessForOCR(cropped);

  const { data } = await worker.recognize(cropped);
  // Extract just digits from the result
  const digits = data.text.replace(/[^0-9]/g, "");
  return digits ? parseInt(digits, 10) : null;
}

/* ═══════════════════════════════════════════════════════
   PHOTO CAPTURE COMPONENT
═══════════════════════════════════════════════════════ */
export default function PhotoCapture({ onHintsDetected }) {
  const [status, setStatus] = useState("idle"); // idle | processing | done | error
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState("");
  const [preview, setPreview] = useState(null);
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);

  const processImage = async (file) => {
    setStatus("processing");
    setProgress(0);
    setErrorMsg("");

    try {
      // Load image onto canvas
      const img = new Image();
      const url = URL.createObjectURL(file);
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = url;
      });

      setPreview(url);

      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);

      // Extract hint regions
      const { rowHints, colHints } = extractHintRegions(canvas);

      // Initialize Tesseract worker
      setProgress(10);
      const worker = await Tesseract.createWorker("eng", 1, {
        logger: (m) => {
          if (m.status === "recognizing text") {
            setProgress(10 + Math.round(m.progress * 80));
          }
        },
      });

      await worker.setParameters({
        tessedit_char_whitelist: "0123456789",
        tessedit_pageseg_mode: "7", // single line
      });

      // OCR each hint region
      const rowResults = [];
      const colResults = [];

      for (let r = 0; r < 5; r++) {
        const pts = await ocrRegion(canvas, rowHints[r].pts, worker);
        const bombs = await ocrRegion(canvas, rowHints[r].bombs, worker);
        rowResults.push({ pts: pts !== null ? String(pts) : "", bombs: bombs !== null ? String(bombs) : "" });
        setProgress(10 + Math.round(((r + 1) / 10) * 80));
      }

      for (let c = 0; c < 5; c++) {
        const pts = await ocrRegion(canvas, colHints[c].pts, worker);
        const bombs = await ocrRegion(canvas, colHints[c].bombs, worker);
        colResults.push({ pts: pts !== null ? String(pts) : "", bombs: bombs !== null ? String(bombs) : "" });
        setProgress(10 + Math.round(((5 + c + 1) / 10) * 80));
      }

      await worker.terminate();
      setProgress(100);
      setStatus("done");

      onHintsDetected(rowResults, colResults);
    } catch (e) {
      console.error("OCR Error:", e);
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
    setProgress(0);
    setErrorMsg("");
    setPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div style={{ marginTop: 6 }}>
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
              color: "#FFFFFF",
              background: "#C8881A",
              border: "2px solid #A86A10",
              borderRadius: 16,
              padding: "8px 14px",
              cursor: "pointer",
              boxShadow: "0 2px 4px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.3)",
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
              color: "#FFFFFF",
              background: "#C8881A",
              border: "2px solid #A86A10",
              borderRadius: 16,
              padding: "8px 14px",
              cursor: "pointer",
              boxShadow: "0 2px 4px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.3)",
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
          <div style={{
            fontFamily: "'Press Start 2P', monospace",
            fontSize: 7,
            color: "#8A6A20",
            marginBottom: 4,
          }}>
            SCANNING... {progress}%
          </div>
          <div style={{
            height: 8,
            background: "#FFFFFF",
            border: "2px solid #A8E0D4",
            borderRadius: 6,
            overflow: "hidden",
          }}>
            <div style={{
              height: "100%",
              width: `${progress}%`,
              background: "linear-gradient(90deg, #C8881A, #E8A830)",
              transition: "width 0.3s",
              borderRadius: 4,
            }} />
          </div>
        </div>
      )}

      {status === "done" && (
        <div style={{ textAlign: "center" }}>
          <span style={{
            fontFamily: "'Press Start 2P', monospace",
            fontSize: 7,
            color: "#2A9A68",
          }}>
            ✓ HINTS LOADED
          </span>
          <button
            onClick={reset}
            style={{
              marginLeft: 8,
              fontFamily: "'Press Start 2P', monospace",
              fontSize: 7,
              color: "#5ABCD8",
              background: "transparent",
              border: "2px solid #5ABCD8",
              borderRadius: 12,
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
            fontSize: 7,
            color: "#CC3344",
          }}>
            ⚠ {errorMsg}
          </span>
          <button
            onClick={reset}
            style={{
              marginLeft: 8,
              fontFamily: "'Press Start 2P', monospace",
              fontSize: 7,
              color: "#5ABCD8",
              background: "transparent",
              border: "2px solid #5ABCD8",
              borderRadius: 12,
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
