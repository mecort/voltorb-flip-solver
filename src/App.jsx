import { useState, useCallback } from "react";
import PhotoCapture from "./PhotoCapture";

/* ═══════════════════════════════════════════════════════
   SOLVER ENGINE
═══════════════════════════════════════════════════════ */
function cartesian(arrays) {
  return arrays.reduce(
    (acc, arr) => acc.flatMap((a) => arr.map((v) => [...a, v])),
    [[]]
  );
}
function getValidCombos([targetSum, targetBombs], cellsPossible) {
  return cartesian(cellsPossible.map((s) => [...s])).filter(
    (c) =>
      c.filter((v) => v === 0).length === targetBombs &&
      c.reduce((a, b) => a + b, 0) === targetSum
  );
}
function deepCopy(p) {
  return p.map((row) => row.map((s) => new Set(s)));
}
function constrain(possible, rh, ch) {
  let changed = true;
  while (changed) {
    changed = false;
    for (let r = 0; r < 5; r++) {
      const valid = getValidCombos(rh[r], possible[r]);
      if (!valid.length) return false;
      for (let c = 0; c < 5; c++) {
        const reach = new Set(valid.map((v) => v[c]));
        const inter = new Set([...reach].filter((v) => possible[r][c].has(v)));
        if (!inter.size) return false;
        if (inter.size !== possible[r][c].size) { possible[r][c] = inter; changed = true; }
      }
    }
    for (let c = 0; c < 5; c++) {
      const valid = getValidCombos(ch[c], possible.map((row) => row[c]));
      if (!valid.length) return false;
      for (let r = 0; r < 5; r++) {
        const reach = new Set(valid.map((v) => v[r]));
        const inter = new Set([...reach].filter((v) => possible[r][c].has(v)));
        if (!inter.size) return false;
        if (inter.size !== possible[r][c].size) { possible[r][c] = inter; changed = true; }
      }
    }
  }
  return true;
}
function solve(possible, rh, ch) {
  if (!constrain(possible, rh, ch)) return false;
  let best = null, bestSz = 5;
  for (let r = 0; r < 5; r++)
    for (let c = 0; c < 5; c++) {
      const sz = possible[r][c].size;
      if (sz === 0) return false;
      if (sz > 1 && sz < bestSz) { bestSz = sz; best = [r, c]; }
    }
  if (!best) return true;
  const [br, bc] = best;
  for (const val of [...possible[br][bc]].sort()) {
    const saved = deepCopy(possible);
    possible[br][bc] = new Set([val]);
    if (solve(possible, rh, ch)) return true;
    for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) possible[r][c] = saved[r][c];
  }
  return false;
}
function runSolver(rh, ch) {
  const p = Array.from({ length: 5 }, () =>
    Array.from({ length: 5 }, () => new Set([0, 1, 2, 3]))
  );
  const isUnique = solve(p, rh, ch);
  if (!isUnique) {
    const p2 = Array.from({ length: 5 }, () =>
      Array.from({ length: 5 }, () => new Set([0, 1, 2, 3]))
    );
    constrain(p2, rh, ch);
    return { possible: p2, isUnique: false };
  }
  return { possible: p, isUnique: true };
}

/* ═══════════════════════════════════════════════════════
   SVG SPRITES
═══════════════════════════════════════════════════════ */
function VoltorbSprite({ size = 28 }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size}>
      <defs>
        <radialGradient id="vbody" cx="40%" cy="35%">
          <stop offset="0%" stopColor="#FF6677" />
          <stop offset="100%" stopColor="#AA1122" />
        </radialGradient>
      </defs>
      <circle cx="16" cy="16" r="13" fill="url(#vbody)" stroke="#FF4455" strokeWidth="1.5" />
      <line x1="3" y1="16" x2="29" y2="16" stroke="#FF9999" strokeWidth="1.8" />
      <circle cx="16" cy="16" r="4.5" fill="white" stroke="#FF6677" strokeWidth="1.2" />
      <circle cx="16" cy="16" r="2.2" fill="#CC2233" />
      <ellipse cx="11" cy="10" rx="2.5" ry="1.8" fill="white" opacity="0.25" />
    </svg>
  );
}

/* ═══════════════════════════════════════════════════════
   GAME CELLS — Teal/HGSS touchscreen style
═══════════════════════════════════════════════════════ */
const CSTYLE = {
  0: { bg: "#FFF0F0", border: "#E84050", text: "#CC2233", glow: "#E8405044" },
  1: { bg: "#F0F8FF", border: "#7BA8C8", text: "#4A7A9A", glow: "none" },
  2: { bg: "#F0FFF4", border: "#40B868", text: "#208848", glow: "#40B86844" },
  3: { bg: "#FFFEF0", border: "#C8A820", text: "#9A7A00", glow: "#C8A82044" },
  "?": { bg: "#E8F8F6", border: "#88CCBB", text: "#88CCBB", glow: "none" },
};

function CrystalCell({ opts, revealed, delay }) {
  const solved = opts?.size === 1;
  const val = solved ? [...opts][0] : null;
  const cs = val !== null ? CSTYLE[val] : CSTYLE["?"];

  return (
    <div className="grid-cell" style={{
      background: cs.bg, border: `2px solid ${cs.border}`,
      borderRadius: 4, position: "relative",
      display: "flex", alignItems: "center", justifyContent: "center",
      boxShadow: cs.glow !== "none" ? `0 2px 8px ${cs.glow}` : "0 1px 3px rgba(0,0,0,0.08)",
      opacity: revealed ? 1 : 0,
      transform: revealed ? "scale(1) rotateY(0deg)" : "scale(0.3) rotateY(90deg)",
      transition: `opacity 0.32s ${delay}ms, transform 0.32s ${delay}ms`,
    }}>
      {val === 0 ? (
        <VoltorbSprite size={24} />
      ) : solved ? (
        <span style={{
          fontFamily: "'Press Start 2P', monospace",
          fontSize: 18, color: cs.text,
          textShadow: cs.glow !== "none" ? `0 0 6px ${cs.glow}` : "none",
        }}>{val}</span>
      ) : (
        <>
          <span style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 12, color: "#88CCBB" }}>?</span>
          {opts && (
            <div style={{
              position: "absolute", bottom: 2, right: 2,
              display: "flex", flexWrap: "wrap", gap: 1, width: 12, justifyContent: "flex-end",
            }}>
              {[...opts].sort().map((v) => (
                <div key={v} style={{
                  width: 4, height: 4, borderRadius: "50%",
                  background: v===0?"#E84050":v===3?"#C8A820":v===2?"#40B868":"#7BA8C8",
                }} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   HINT INPUT CELLS — Clean white panels like HGSS touchscreen
═══════════════════════════════════════════════════════ */
function HintCell({ value, onChange, isRow }) {
  const base = {
    flex: 1, width: "100%", border: "none", background: "transparent",
    fontFamily: "'Press Start 2P', monospace", fontSize: 9,
    textAlign: "center", outline: "none", padding: "2px 0",
  };
  return (
    <div className={isRow ? "hint-cell-row" : "hint-cell-col"} style={{
      background: "#FFFFFF", border: "2px solid #88CCBB",
      borderRadius: 4, display: "flex", flexDirection: "column", overflow: "hidden",
      boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
    }}>
      <input type="number" min="0" max="15" inputMode="numeric"
        value={value.pts} placeholder="pt"
        onChange={(e) => onChange({ ...value, pts: e.target.value })}
        style={{ ...base, color: "#2A8A7A", borderBottom: "1px solid #CCEEEE" }} />
      <input type="number" min="0" max="5" inputMode="numeric"
        value={value.bombs} placeholder="💣"
        onChange={(e) => onChange({ ...value, bombs: e.target.value })}
        style={{ ...base, color: "#CC3344" }} />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   SCREEN BUTTON — Teal pill buttons like HGSS UI
═══════════════════════════════════════════════════════ */
function ScreenBtn({ label, variant = "primary", onClick }) {
  const styles = {
    primary: { bg: "#40B898", color: "#FFFFFF", border: "#2A9A78" },
    secondary: { bg: "#5ABCD8", color: "#FFFFFF", border: "#3A9AB8" },
    danger: { bg: "#E86A5A", color: "#FFFFFF", border: "#C84A3A" },
  };
  const s = styles[variant] || styles.primary;

  return (
    <button onClick={onClick} style={{
      fontFamily: "'Press Start 2P', monospace", fontSize: 8,
      color: s.color, background: s.bg, border: `2px solid ${s.border}`,
      borderRadius: 16, padding: "8px 14px", cursor: "pointer",
      boxShadow: "0 2px 4px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.3)",
      transition: "transform 0.1s, box-shadow 0.1s",
    }}
      onMouseDown={(e) => { e.currentTarget.style.transform = "translateY(1px) scale(0.96)"; e.currentTarget.style.boxShadow = "0 1px 2px rgba(0,0,0,0.2)"; }}
      onMouseUp={(e) => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = "0 2px 4px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.3)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = "0 2px 4px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.3)"; }}
    >{label}</button>
  );
}

/* ═══════════════════════════════════════════════════════
   APP CONSTANTS
═══════════════════════════════════════════════════════ */
const N = 5;
const mkHints = () => Array.from({ length: N }, () => ({ pts: "", bombs: "" }));
const DEMO = {
  row: [{ pts:"5",bombs:"1" },{ pts:"7",bombs:"1" },{ pts:"7",bombs:"1" },{ pts:"5",bombs:"1" },{ pts:"7",bombs:"1" }],
  col: [{ pts:"4",bombs:"2" },{ pts:"7",bombs:"1" },{ pts:"5",bombs:"1" },{ pts:"7",bombs:"1" },{ pts:"8",bombs:"0" }],
};

/* ═══════════════════════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════════════════════ */
export default function VoltorbGBA() {
  const [rowH, setRowH] = useState(mkHints());
  const [colH, setColH] = useState(mkHints());
  const [result, setResult] = useState(null);
  const [error, setError]   = useState("");
  const [revealed, setRevealed] = useState(false);

  const loadDemo = () => {
    setRowH(DEMO.row.map((h) => ({ ...h })));
    setColH(DEMO.col.map((h) => ({ ...h })));
    setResult(null); setError(""); setRevealed(false);
  };
  const handlePhotoHints = (rowResults, colResults) => {
    setRowH(rowResults);
    setColH(colResults);
    setResult(null); setError(""); setRevealed(false);
  };
  const clearAll = () => {
    setRowH(mkHints()); setColH(mkHints());
    setResult(null); setError(""); setRevealed(false);
  };
  const handleSolve = useCallback(() => {
    setRevealed(false); setError(""); setResult(null);
    try {
      const rh = rowH.map((h, i) => {
        const p = parseInt(h.pts), b = parseInt(h.bombs);
        if (isNaN(p) || isNaN(b)) throw new Error(`Row ${i+1}: fill pts + bombs`);
        if (b < 0 || b > 5)       throw new Error(`Row ${i+1}: bombs must be 0–5`);
        return [p, b];
      });
      const ch = colH.map((h, i) => {
        const p = parseInt(h.pts), b = parseInt(h.bombs);
        if (isNaN(p) || isNaN(b)) throw new Error(`Col ${i+1}: fill pts + bombs`);
        if (b < 0 || b > 5)       throw new Error(`Col ${i+1}: bombs must be 0–5`);
        return [p, b];
      });
      const res = runSolver(rh, ch);
      if (res.possible.some((row) => row.some((s) => s.size === 0)))
        throw new Error("No valid solution — check your hints");
      setResult(res);
      setTimeout(() => setRevealed(true), 60);
    } catch (e) { setError(e.message); }
  }, [rowH, colH]);

  const flipCount  = result ? result.possible.flat().filter((s) => s.size === 1 && ([...s][0] === 2 || [...s][0] === 3)).length : 0;
  const bombCount  = result ? result.possible.flat().filter((s) => s.size === 1 && [...s][0] === 0).length : 0;
  const unsureCount= result ? result.possible.flat().filter((s) => s.size > 1).length : 0;

  /* ── RENDER ── */
  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(180deg, #3A2E28 0%, #4A3E34 30%, #5A4E40 60%, #3A3028 100%)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: "16px 8px",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap');
        * { box-sizing: border-box; }
        body { margin: 0; background: #3A2E28; }
        input[type=number]::-webkit-inner-spin-button,
        input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; }
        input[type=number] { -moz-appearance: textfield; }

        @keyframes shimmer {
          0%   { background-position: 200% center; }
          100% { background-position: -200% center; }
        }
        @keyframes float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-2px); }
        }

        /* Responsive grid cells */
        .grid-cell {
          width: 44px;
          height: 44px;
          flex-shrink: 0;
        }
        .hint-cell-row {
          width: 56px;
          height: 44px;
          flex-shrink: 0;
        }
        .hint-cell-col {
          width: 44px;
          height: 44px;
          flex-shrink: 0;
        }

        /* Mobile: shrink cells to fit */
        @media (max-width: 420px) {
          .grid-cell {
            width: 38px;
            height: 38px;
          }
          .hint-cell-row {
            width: 48px;
            height: 38px;
          }
          .hint-cell-col {
            width: 38px;
            height: 38px;
          }
        }
        @media (max-width: 360px) {
          .grid-cell {
            width: 32px;
            height: 32px;
          }
          .hint-cell-row {
            width: 42px;
            height: 32px;
          }
          .hint-cell-col {
            width: 32px;
            height: 32px;
          }
        }
      `}</style>

      {/* ════ 3DS-INSPIRED SHELL ════ */}
      <div style={{
        background: "linear-gradient(180deg, #F8F4EE 0%, #EDE8E0 50%, #E0DAD0 100%)",
        borderRadius: 18,
        position: "relative", maxWidth: 440, width: "100%",
        boxShadow: [
          "0 16px 48px rgba(0,0,0,0.5)",
          "0 4px 12px rgba(0,0,0,0.3)",
          "inset 0 1px 0 rgba(255,255,255,0.8)",
          "inset 0 -2px 6px rgba(0,0,0,0.05)",
        ].join(","),
        padding: "16px 12px",
      }}>

        {/* ── TOP SCREEN BEZEL (decorative header) ── */}
        <div style={{
          background: "linear-gradient(135deg, #6B8F4A 0%, #4A7A3A 50%, #3A6A2A 100%)",
          borderRadius: 10,
          padding: "10px 12px",
          marginBottom: 10,
          position: "relative",
          overflow: "hidden",
          boxShadow: "inset 0 2px 8px rgba(0,0,0,0.3), 0 2px 4px rgba(0,0,0,0.1)",
        }}>
          {/* Pixel tree decorations */}
          <div style={{ position: "absolute", top: 4, right: 8, opacity: 0.3 }}>
            <svg viewBox="0 0 24 32" width={16} height={22}>
              <polygon points="12,2 4,14 20,14" fill="#2A5A1A" />
              <polygon points="12,8 6,18 18,18" fill="#2A5A1A" />
              <rect x="10" y="18" width="4" height="6" fill="#5A3A20" />
            </svg>
          </div>
          <div style={{ position: "absolute", bottom: 4, left: 10, opacity: 0.2 }}>
            <svg viewBox="0 0 24 32" width={12} height={16}>
              <polygon points="12,2 4,14 20,14" fill="#2A5A1A" />
              <polygon points="12,8 6,18 18,18" fill="#2A5A1A" />
              <rect x="10" y="18" width="4" height="6" fill="#5A3A20" />
            </svg>
          </div>

          {/* Title */}
          <div style={{ textAlign: "center" }}>
            <div style={{
              fontFamily: "'Press Start 2P', monospace", fontSize: 11,
              color: "#FFFFFF", letterSpacing: 1,
              textShadow: "0 2px 4px rgba(0,0,0,0.4), 0 0 8px rgba(255,255,200,0.2)",
            }}>VOLTORB FLIP</div>
            <div style={{
              fontFamily: "'Press Start 2P', monospace", fontSize: 7,
              marginTop: 4, letterSpacing: 2,
              background: "linear-gradient(90deg, #FFE088, #FFF0B0, #FFD060, #FFE088)",
              backgroundSize: "200% auto",
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
              animation: "shimmer 5s linear infinite",
            }}>HEARTGOLD · SOULSILVER</div>
          </div>
        </div>

        {/* ── HINGE LINE ── */}
        <div style={{
          height: 3, background: "linear-gradient(90deg, transparent, #C8C0B4 20%, #B8B0A4 50%, #C8C0B4 80%, transparent)",
          borderRadius: 2, marginBottom: 10,
        }} />

        {/* ── TOUCHSCREEN AREA ── */}
        <div style={{
          background: "linear-gradient(180deg, #B0F0E8 0%, #90E8D8 100%)",
          borderRadius: 10,
          padding: "12px 10px",
          border: "2px solid #78D0C0",
          boxShadow: "inset 0 2px 8px rgba(0,200,180,0.2), 0 1px 3px rgba(0,0,0,0.1)",
        }}>

          {/* ── GRID AREA ── */}
          <div style={{
            background: "#FFFFFF",
            borderRadius: 8,
            padding: "8px 6px",
            border: "2px solid #A8E0D4",
            boxShadow: "inset 0 1px 4px rgba(0,0,0,0.05)",
          }}>
            {/* Hint legend */}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginBottom: 4, paddingRight: 4 }}>
              <span style={{ fontFamily: "'Press Start 2P',monospace", fontSize: 6, color: "#2A8A7A" }}>▲PTS</span>
              <span style={{ fontFamily: "'Press Start 2P',monospace", fontSize: 6, color: "#CC3344" }}>▼BMB</span>
            </div>

            {/* Column hints */}
            <div style={{ display: "flex", gap: 3, marginBottom: 3, paddingLeft: "calc(56px + 3px)" }}>
              {colH.map((h, c) => (
                <HintCell key={c} value={h} isRow={false}
                  onChange={(v) => { const n = [...colH]; n[c] = v; setColH(n); }} />
              ))}
            </div>

            {/* Grid rows */}
            {Array.from({ length: N }, (_, r) => (
              <div key={r} style={{ display: "flex", gap: 3, marginBottom: r < 4 ? 3 : 0 }}>
                <HintCell value={rowH[r]} isRow={true}
                  onChange={(v) => { const n = [...rowH]; n[r] = v; setRowH(n); }} />
                {Array.from({ length: N }, (_, c) => (
                  <CrystalCell key={c}
                    opts={result?.possible[r][c]}
                    revealed={revealed}
                    delay={(r * N + c) * 28} />
                ))}
              </div>
            ))}
          </div>

          {/* ── STATUS BAR ── */}
          <div style={{
            marginTop: 8, minHeight: 28,
            background: "#FFFFFF", border: "2px solid #A8E0D4",
            borderRadius: 6, padding: "6px 10px",
            display: "flex", alignItems: "center", justifyContent: "space-between",
            flexWrap: "wrap", gap: 4,
          }}>
            {error ? (
              <span style={{ fontFamily: "'Press Start 2P',monospace", fontSize: 7, color: "#CC3344" }}>⚠ {error}</span>
            ) : result ? (
              <>
                <span style={{
                  fontFamily: "'Press Start 2P',monospace", fontSize: 8,
                  color: result.isUnique ? "#2A9A68" : "#B8880A",
                }}>{result.isUnique ? "✓ SOLVED" : "~ PARTIAL"}</span>
                <div style={{ display: "flex", gap: 8 }}>
                  <span style={{ fontFamily: "'Press Start 2P',monospace", fontSize: 7, color: "#2A9A68" }}>★{flipCount}</span>
                  <span style={{ fontFamily: "'Press Start 2P',monospace", fontSize: 7, color: "#CC3344" }}>✗{bombCount}</span>
                  <span style={{ fontFamily: "'Press Start 2P',monospace", fontSize: 7, color: "#4488BB" }}>?{unsureCount}</span>
                </div>
              </>
            ) : (
              <span style={{ fontFamily: "'Press Start 2P',monospace", fontSize: 7, color: "#88BBAA", letterSpacing: 0.5 }}>
                ENTER HINTS → SOLVE
              </span>
            )}
          </div>

          {/* ── BUTTONS ── */}
          <div style={{ display: "flex", gap: 8, marginTop: 10, justifyContent: "center", flexWrap: "wrap" }}>
            <ScreenBtn label="SOLVE" variant="primary" onClick={handleSolve} />
            <ScreenBtn label="DEMO" variant="secondary" onClick={loadDemo} />
            <ScreenBtn label="CLEAR" variant="danger" onClick={clearAll} />
          </div>

          {/* ── PHOTO CAPTURE ── */}
          <PhotoCapture onHintsDetected={handlePhotoHints} />

        </div>{/* /touchscreen */}

        {/* ── BOTTOM CONTROLS (decorative) ── */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          marginTop: 12, padding: "0 8px",
        }}>
          {/* D-Pad hint */}
          <div style={{
            width: 36, height: 36, position: "relative",
          }}>
            <div style={{
              position: "absolute", left: 0, top: 12, width: 36, height: 12,
              background: "#D8D0C4", borderRadius: 2,
              boxShadow: "inset 0 1px 3px rgba(0,0,0,0.2)",
            }} />
            <div style={{
              position: "absolute", left: 12, top: 0, width: 12, height: 36,
              background: "#D8D0C4", borderRadius: 2,
              boxShadow: "inset 0 1px 3px rgba(0,0,0,0.2)",
            }} />
          </div>

          {/* Branding */}
          <span style={{
            fontFamily: "'Press Start 2P', monospace", fontSize: 5,
            color: "#B8B0A4", letterSpacing: 2,
          }}>POKÉMON HGSS SOLVER</span>

          {/* Face buttons hint */}
          <div style={{ display: "flex", gap: 4 }}>
            {["#3868C8", "#40A840", "#D84040", "#D8A020"].map((c, i) => (
              <div key={i} style={{
                width: 10, height: 10, borderRadius: "50%", background: c,
                boxShadow: "inset 0 1px 2px rgba(0,0,0,0.3)",
              }} />
            ))}
          </div>
        </div>

      </div>{/* /3DS shell */}
    </div>
  );
}
