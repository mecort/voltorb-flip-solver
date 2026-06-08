import { useState, useRef } from "react";
import Tesseract from "tesseract.js";

/* ═══════════════════════════════════════════════════════
   SPATIAL TEXT EXTRACTION APPROACH
   
   Strategy:
   1. Run Tesseract on the full image to extract ALL text + bounding boxes
   2. Filter to only digit sequences (0-9)
   3. Find the spatial pattern: 5 vertically-aligned pairs on the right,
      5 horizontally-aligned pairs on the bottom
   4. Map those to row/col hints
   
   This works regardless of panel colors, image angle, or screenshot source
   because we're just looking for numbers in the right spatial arrangement.
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
 * Extract all words/numbers from the image with their bounding box positions.
 * Returns array of { text, x, y, w, h, cx, cy }
 */
async function extractAllText(canvas, onProgress) {
  const worker = await Tesseract.createWorker("eng", 1, {
    logger: (m) => {
      if (m.status === "recognizing text" && onProgress) {
        onProgress(Math.round(m.progress * 80));
      }
    },
  });

  // Use PSM 11 (sparse text) — works best for game UIs with scattered numbers
  await worker.setParameters({
    tessedit_pageseg_mode: "11",
  });

  const { data } = await worker.recognize(canvas);
  await worker.terminate();

  // Extract individual words with their bounding boxes
  const words = [];
  if (data.words) {
    for (const word of data.words) {
      const text = word.text.trim();
      if (!text) continue;
      const { x0, y0, x1, y1 } = word.bbox;
      words.push({
        text,
        x: x0, y: y0,
        w: x1 - x0, h: y1 - y0,
        cx: (x0 + x1) / 2,
        cy: (y0 + y1) / 2,
      });
    }
  }

  return words;
}

/**
 * Filter words to only those that look like valid hint numbers.
 * Points: 0-15 (often displayed as "03", "05", "08", "10", "12", etc.)
 * Bombs: 0-5 (single digit)
 * 
 * We look for words that are purely numeric and in valid ranges.
 */
function filterNumericWords(words) {
  const numeric = [];
  for (const word of words) {
    // Clean: strip non-digit chars, common OCR errors
    const cleaned = word.text.replace(/[^0-9]/g, "");
    if (!cleaned) continue;
    const num = parseInt(cleaned, 10);
    if (isNaN(num) || num > 15) continue; // Max valid value is 15
    numeric.push({ ...word, value: num, cleaned });
  }
  return numeric;
}

/**
 * Find the Voltorb Flip hint pattern in the detected numbers.
 * 
 * The pattern we're looking for:
 * - RIGHT COLUMN: 5 groups of 2 numbers stacked vertically (pts on top, bombs below)
 *   These are on the right side of the image, evenly spaced vertically
 * - BOTTOM ROW: 5 groups of 2 numbers stacked vertically (pts on top, bombs below)
 *   These are at the bottom of the image, evenly spaced horizontally
 * 
 * Each "group" is a pts number (0-15) directly above a bombs number (0-5)
 * at roughly the same X position.
 */
function findHintPattern(numbers, imgWidth, imgHeight) {
  if (numbers.length < 10) return null;

  // Sort numbers into potential pairs (two numbers at similar X, one above the other)
  const pairs = [];
  const used = new Set();

  for (let i = 0; i < numbers.length; i++) {
    if (used.has(i)) continue;
    for (let j = 0; j < numbers.length; j++) {
      if (i === j || used.has(j)) continue;
      const a = numbers[i];
      const b = numbers[j];

      // Same X position (within tolerance), a is above b
      const xTol = Math.max(a.w, b.w) * 1.5;
      const yGap = b.cy - a.cy;

      if (Math.abs(a.cx - b.cx) < xTol && yGap > 0 && yGap < Math.max(a.h, b.h) * 3) {
        // a is on top (pts), b is below (bombs)
        // Validate: pts should be 0-15, bombs should be 0-5
        if (a.value <= 15 && b.value <= 5) {
          pairs.push({
            pts: a.value,
            bombs: b.value,
            cx: (a.cx + b.cx) / 2,
            cy: (a.cy + b.cy) / 2,
            topY: a.cy,
            botY: b.cy,
            idxA: i, idxB: j,
          });
        }
      }
    }
  }

  if (pairs.length < 5) return null;

  // Find 5 pairs that form a vertical line (row hints — rightmost group)
  // and 5 pairs that form a horizontal line (col hints — bottommost group)
  
  // Sort pairs by X position to find the rightmost vertical group
  const byX = [...pairs].sort((a, b) => b.cx - a.cx);
  
  let rowHintPairs = null;
  for (let i = 0; i < Math.min(5, byX.length); i++) {
    const anchor = byX[i];
    const xTol = imgWidth * 0.08;
    const aligned = pairs
      .filter(p => Math.abs(p.cx - anchor.cx) < xTol)
      .sort((a, b) => a.cy - b.cy);
    if (aligned.length >= 5) {
      rowHintPairs = aligned.slice(0, 5);
      break;
    }
  }

  if (!rowHintPairs) {
    // Fallback: just take 5 rightmost pairs sorted by Y
    rowHintPairs = byX.slice(0, 5).sort((a, b) => a.cy - b.cy);
  }

  // Find col hints: from remaining pairs, find 5 at the bottom in a horizontal line
  const usedPairIndices = new Set(rowHintPairs.map(p => `${p.idxA}-${p.idxB}`));
  const remaining = pairs.filter(p => !usedPairIndices.has(`${p.idxA}-${p.idxB}`));

  let colHintPairs = null;
  const byY = [...remaining].sort((a, b) => b.cy - a.cy);
  for (let i = 0; i < Math.min(5, byY.length); i++) {
    const anchor = byY[i];
    const yTol = imgHeight * 0.06;
    const aligned = remaining
      .filter(p => Math.abs(p.cy - anchor.cy) < yTol)
      .sort((a, b) => a.cx - b.cx);
    if (aligned.length >= 5) {
      colHintPairs = aligned.slice(0, 5);
      break;
    }
  }

  if (!colHintPairs) {
    colHintPairs = byY.slice(0, 5).sort((a, b) => a.cx - b.cx);
  }

  // Convert to hint format
  const rowResults = (rowHintPairs || []).slice(0, 5).map(p => ({
    pts: String(p.pts),
    bombs: String(p.bombs),
  }));
  const colResults = (colHintPairs || []).slice(0, 5).map(p => ({
    pts: String(p.pts),
    bombs: String(p.bombs),
  }));

  // Pad to 5 if needed
  while (rowResults.length < 5) rowResults.push({ pts: "", bombs: "" });
  while (colResults.length < 5) colResults.push({ pts: "", bombs: "" });

  return { rowResults, colResults, rowHintPairs, colHintPairs, allPairs: pairs };
}

/* ═══════════════════════════════════════════════════════
   COMPONENT
═══════════════════════════════════════════════════════ */
export default function PhotoCapture({ onHintsDetected }) {
  const [status, setStatus] = useState("idle");
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState("");
  const [debugInfo, setDebugInfo] = useState("");
  const [debugImg, setDebugImg] = useState(null);
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);

  const processImage = async (file) => {
    setStatus("processing");
    setProgress(0);
    setErrorMsg("");
    setDebugInfo("");
    setDebugImg(null);

    try {
      const canvas = await loadImageToCanvas(file);
      setProgress(5);

      // 1. Extract all text from image
      const words = await extractAllText(canvas, setProgress);
      setProgress(85);

      // 2. Filter to numeric values
      const numbers = filterNumericWords(words);

      // 3. Find the hint pattern
      const result = findHintPattern(numbers, canvas.width, canvas.height);

      // 4. Generate debug overlay
      const dCanvas = document.createElement("canvas");
      dCanvas.width = canvas.width;
      dCanvas.height = canvas.height;
      const dCtx = dCanvas.getContext("2d");
      dCtx.drawImage(canvas, 0, 0);

      // Draw all detected numbers (small yellow dots)
      dCtx.fillStyle = "#FFFF0088";
      for (const n of numbers) {
        dCtx.fillRect(n.x, n.y, n.w, n.h);
      }

      if (result) {
        // Draw row hint pairs (green boxes)
        dCtx.strokeStyle = "#00FF00";
        dCtx.lineWidth = Math.max(2, canvas.width * 0.003);
        for (const p of (result.rowHintPairs || [])) {
          const pn = numbers[p.idxA];
          const bn = numbers[p.idxB];
          if (pn && bn) {
            const x = Math.min(pn.x, bn.x) - 2;
            const y = pn.y - 2;
            const w = Math.max(pn.w, bn.w) + 4;
            const h = (bn.y + bn.h) - pn.y + 4;
            dCtx.strokeRect(x, y, w, h);
          }
        }

        // Draw col hint pairs (blue boxes)
        dCtx.strokeStyle = "#00AAFF";
        for (const p of (result.colHintPairs || [])) {
          const pn = numbers[p.idxA];
          const bn = numbers[p.idxB];
          if (pn && bn) {
            const x = Math.min(pn.x, bn.x) - 2;
            const y = pn.y - 2;
            const w = Math.max(pn.w, bn.w) + 4;
            const h = (bn.y + bn.h) - pn.y + 4;
            dCtx.strokeRect(x, y, w, h);
          }
        }
      }

      setDebugImg(dCanvas.toDataURL("image/jpeg", 0.5));
      setProgress(100);

      if (!result) {
        const msg = `Found ${numbers.length} numbers but couldn't match the hint pattern. Need 5 right + 5 bottom pairs.`;
        setErrorMsg(msg);
        setDebugInfo(`Detected numbers: ${numbers.map(n => n.value).join(", ")}`);
        setStatus("error");
        return;
      }

      const { rowResults, colResults } = result;

      const filledCount = [...rowResults, ...colResults].filter(r => r.pts !== "" || r.bombs !== "").length;
      const rowStr = rowResults.map(r => `${r.pts || "?"}/${r.bombs || "?"}`).join(", ");
      const colStr = colResults.map(r => `${r.pts || "?"}/${r.bombs || "?"}`).join(", ");
      setDebugInfo(`R:[${rowStr}] C:[${colStr}] (${numbers.length} nums, ${result.allPairs.length} pairs)`);

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
    setStatus("idle"); setProgress(0); setErrorMsg(""); setDebugInfo(""); setDebugImg(null);
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
          <div style={{
            fontFamily: "'Press Start 2P', monospace", fontSize: 7,
            color: "#FFF", marginBottom: 4,
          }}>SCANNING... {progress}%</div>
          <div style={{
            height: 8, background: "#1A5A3A",
            border: "2px solid #0A3A2A", borderRadius: 4, overflow: "hidden",
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
          {debugInfo && <div style={{ fontFamily: "monospace", fontSize: 9, color: "#FFAAAA88", marginTop: 4, wordBreak: "break-all" }}>{debugInfo}</div>}
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
