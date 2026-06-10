import { useState, useRef } from "react";

/* ═══════════════════════════════════════════════════════
   VISION API-POWERED PHOTO CAPTURE
   
   Strategy:
   1. User takes/uploads a photo
   2. Convert to base64
   3. Send to /api/scan (Vercel serverless → Gemini Flash)
   4. Vision model reads the hint values from the image
   5. Fill into the board
   
   Falls back gracefully if the API is unavailable.
═══════════════════════════════════════════════════════ */

const API_URL = "/api/scan";

/**
 * Convert a File to a base64 data URL string.
 */
async function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Send image to the vision API and get back structured hint data.
 */
async function scanImage(base64Image) {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image: base64Image }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: "Request failed" }));

    if (response.status === 429) {
      throw new Error("Rate limit reached — wait a minute or use Quick Entry");
    }
    if (response.status === 403) {
      throw new Error("API quota exhausted — use Quick Entry mode instead");
    }

    throw new Error(err.error || `API returned ${response.status}`);
  }

  return response.json();
}

/**
 * Pattern matching functions (exported for testing).
 * Used as fallback and for unit tests.
 */
export function filterNumericWords(words) {
  const numeric = [];
  for (const word of words) {
    const cleaned = word.text.replace(/[^0-9]/g, "");
    if (!cleaned) continue;
    const num = parseInt(cleaned, 10);
    if (isNaN(num) || num > 15) continue;
    numeric.push({ ...word, value: num, cleaned });
  }
  return numeric;
}

export function findHintPattern(numbers, imgWidth, imgHeight) {
  if (numbers.length < 10) return null;

  const pairs = [];
  const used = new Set();

  for (let i = 0; i < numbers.length; i++) {
    if (used.has(i)) continue;
    for (let j = 0; j < numbers.length; j++) {
      if (i === j || used.has(j)) continue;
      const a = numbers[i];
      const b = numbers[j];

      const xTol = Math.max(a.w, b.w) * 1.5;
      const yGap = b.cy - a.cy;

      if (Math.abs(a.cx - b.cx) < xTol && yGap > 0 && yGap < Math.max(a.h, b.h) * 3) {
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
    rowHintPairs = byX.slice(0, 5).sort((a, b) => a.cy - b.cy);
  }

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

  const rowResults = (rowHintPairs || []).slice(0, 5).map(p => ({
    pts: String(p.pts),
    bombs: String(p.bombs),
  }));
  const colResults = (colHintPairs || []).slice(0, 5).map(p => ({
    pts: String(p.pts),
    bombs: String(p.bombs),
  }));

  while (rowResults.length < 5) rowResults.push({ pts: "", bombs: "" });
  while (colResults.length < 5) colResults.push({ pts: "", bombs: "" });

  return { rowResults, colResults, rowHintPairs, colHintPairs, allPairs: pairs };
}

/* ═══════════════════════════════════════════════════════
   COMPONENT
═══════════════════════════════════════════════════════ */
export default function PhotoCapture({ onHintsDetected }) {
  const [status, setStatus] = useState("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [debugInfo, setDebugInfo] = useState("");
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);

  const processImage = async (file) => {
    setStatus("processing");
    setErrorMsg("");
    setDebugInfo("");

    try {
      // Convert file to base64
      const base64 = await fileToBase64(file);

      // Call vision API
      const data = await scanImage(base64);

      // Convert API response to our hint format
      const rowResults = data.rows.map(r => ({
        pts: String(r.pts),
        bombs: String(r.bombs),
      }));
      const colResults = data.cols.map(r => ({
        pts: String(r.pts),
        bombs: String(r.bombs),
      }));

      const rowStr = rowResults.map(r => `${r.pts}/${r.bombs}`).join(", ");
      const colStr = colResults.map(r => `${r.pts}/${r.bombs}`).join(", ");
      setDebugInfo(`R:[${rowStr}] C:[${colStr}]`);

      setStatus("done");
      onHintsDetected(rowResults, colResults);
    } catch (e) {
      console.error("Scan error:", e);
      setErrorMsg(e.message || "Failed to scan image");
      setStatus("error");
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) processImage(file);
  };

  const reset = () => {
    setStatus("idle"); setErrorMsg(""); setDebugInfo("");
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (cameraInputRef.current) cameraInputRef.current.value = "";
  };

  return (
    <div>
      <input ref={fileInputRef} type="file" accept="image/*"
        onChange={handleFileChange} style={{ display: "none" }} />
      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment"
        onChange={handleFileChange} style={{ display: "none" }} />

      {status === "idle" && (
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => cameraInputRef.current?.click()} style={btnStyle}>📷 SNAP</button>
          <button onClick={() => fileInputRef.current?.click()} style={btnStyle}>📁 UPLOAD</button>
        </div>
      )}

      {status === "processing" && (
        <div style={{ textAlign: "center" }}>
          <div style={{
            fontFamily: "'Press Start 2P', monospace", fontSize: 7,
            color: "#FFF", marginBottom: 4,
          }}>ANALYZING...</div>
          <div style={{
            height: 4, background: "#1A5A3A", borderRadius: 4, overflow: "hidden",
          }}>
            <div style={{
              height: "100%", width: "60%",
              background: "linear-gradient(90deg, #D8A838, #E8C848)",
              borderRadius: 2,
              animation: "shimmerBar 1.5s ease-in-out infinite",
            }} />
          </div>
          <style>{`
            @keyframes shimmerBar {
              0% { transform: translateX(-100%); }
              100% { transform: translateX(200%); }
            }
          `}</style>
        </div>
      )}

      {status === "done" && (
        <div style={{ textAlign: "center" }}>
          <span style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 7, color: "#AAFFAA" }}>✓ VERIFY & SOLVE</span>
          <button onClick={reset} style={retryStyle}>RETRY</button>
          {debugInfo && <div style={{ fontFamily: "monospace", fontSize: 9, color: "#AAFFAA88", marginTop: 4, wordBreak: "break-all" }}>{debugInfo}</div>}
        </div>
      )}

      {status === "error" && (
        <div style={{ textAlign: "center" }}>
          <span style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 6, color: "#FFAAAA" }}>⚠ {errorMsg}</span>
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
