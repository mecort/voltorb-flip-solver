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
function runSolver(rh, ch, known) {
  // known is a 5x5 array: null = unknown, 0-3 = revealed value
  const p = Array.from({ length: 5 }, (_, r) =>
    Array.from({ length: 5 }, (_, c) =>
      known[r][c] !== null ? new Set([known[r][c]]) : new Set([0, 1, 2, 3])
    )
  );
  const isUnique = solve(p, rh, ch);
  if (!isUnique) {
    const p2 = Array.from({ length: 5 }, (_, r) =>
      Array.from({ length: 5 }, (_, c) =>
        known[r][c] !== null ? new Set([known[r][c]]) : new Set([0, 1, 2, 3])
      )
    );
    constrain(p2, rh, ch);
    return { possible: p2, isUnique: false };
  }
  return { possible: p, isUnique: true };
}

/* ═══════════════════════════════════════════════════════
   RECOMMENDATION ENGINE
   
   For uncertain cells, rank them by:
   1. Lowest bomb probability (safest to flip)
   2. Highest expected multiplier value (most rewarding)
   
   Score = (1 - bombProb) * expectedValue
   where expectedValue = avg of non-zero possibilities
═══════════════════════════════════════════════════════ */
function getRecommendation(possible) {
  let bestScore = -1;
  let bestCell = null;

  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      const opts = possible[r][c];
      if (opts.size <= 1) continue; // Already known

      const values = [...opts];
      const bombProb = values.includes(0) ? 1 / values.length : 0;
      const nonZero = values.filter(v => v > 0);
      const expectedValue = nonZero.length > 0
        ? nonZero.reduce((a, b) => a + b, 0) / nonZero.length
        : 0;
      
      // Score: prefer low bomb risk and high value
      // Weight safety heavily (multiply by safety squared for emphasis)
      const safety = 1 - bombProb;
      const score = safety * safety * expectedValue;

      if (score > bestScore) {
        bestScore = score;
        bestCell = [r, c];
      }
    }
  }

  return bestCell;
}

/* ═══════════════════════════════════════════════════════
   SVG SPRITES
═══════════════════════════════════════════════════════ */
function VoltorbSprite({ size = 22 }) {
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

function VoltorbSmall() {
  return (
    <svg viewBox="0 0 32 32" width={14} height={14}>
      <circle cx="16" cy="16" r="12" fill="#DD4455" stroke="#AA2233" strokeWidth="2" />
      <line x1="4" y1="16" x2="28" y2="16" stroke="#FF9999" strokeWidth="2" />
      <circle cx="16" cy="16" r="4" fill="white" />
      <circle cx="16" cy="16" r="2" fill="#AA2233" />
    </svg>
  );
}

/* ═══════════════════════════════════════════════════════
   INTERACTIVE GRID CELL
═══════════════════════════════════════════════════════ */
const CSTYLE = {
  0: { bg: "#FFDDDD", border: "#DD4455", text: "#CC2233" },
  1: { bg: "#E8F0F8", border: "#6090B0", text: "#4A7090" },
  2: { bg: "#DDFFDD", border: "#40AA60", text: "#208848" },
  3: { bg: "#FFFADD", border: "#C0A020", text: "#8A6A00" },
  "?": { bg: "#2A7A5A", border: "#1A5A3A", text: "#4ABA8A" },
};

function GridCell({ opts, revealed, delay, isRecommended, isKnown, knownValue, onFlip }) {
  const solved = opts?.size === 1;
  const val = solved ? [...opts][0] : null;

  // If this cell was manually flipped by user
  if (isKnown) {
    const cs = CSTYLE[knownValue];
    return (
      <div className="grid-cell" style={{
        background: cs.bg, border: `2px solid ${cs.border}`,
        borderRadius: 3, display: "flex", alignItems: "center", justifyContent: "center",
        boxShadow: "inset 0 1px 2px rgba(0,0,0,0.1)",
      }}>
        {knownValue === 0 ? (
          <VoltorbSprite size={22} />
        ) : (
          <span style={{
            fontFamily: "'Press Start 2P', monospace",
            fontSize: 16, color: cs.text,
          }}>{knownValue}</span>
        )}
      </div>
    );
  }

  // Solver determined this cell
  if (solved && val !== null) {
    const cs = CSTYLE[val];
    return (
      <div className="grid-cell" style={{
        background: cs.bg, border: `2px solid ${cs.border}`,
        borderRadius: 3, display: "flex", alignItems: "center", justifyContent: "center",
        boxShadow: "inset 0 1px 2px rgba(0,0,0,0.1)",
        opacity: revealed ? 1 : 0,
        transform: revealed ? "scale(1)" : "scale(0.3)",
        transition: `opacity 0.32s ${delay}ms, transform 0.32s ${delay}ms`,
      }}>
        {val === 0 ? (
          <VoltorbSprite size={22} />
        ) : (
          <span style={{
            fontFamily: "'Press Start 2P', monospace",
            fontSize: 16, color: cs.text,
          }}>{val}</span>
        )}
      </div>
    );
  }

  // Uncertain cell — clickable if recommended or any uncertain cell
  const cs = CSTYLE["?"];
  return (
    <div className="grid-cell" onClick={onFlip} style={{
      background: isRecommended ? "#1A6A4A" : cs.bg,
      border: `2px solid ${isRecommended ? "#FFD700" : cs.border}`,
      borderRadius: 3, position: "relative",
      display: "flex", alignItems: "center", justifyContent: "center",
      boxShadow: isRecommended
        ? "0 0 8px #FFD70088, inset 0 0 4px #FFD70044"
        : "inset 0 1px 2px rgba(0,0,0,0.1)",
      cursor: "pointer",
      opacity: revealed ? 1 : 0,
      transform: revealed ? "scale(1)" : "scale(0.3)",
      transition: `opacity 0.32s ${delay}ms, transform 0.32s ${delay}ms`,
      animation: isRecommended ? "pulse 1.5s ease-in-out infinite" : "none",
    }}>
      <span style={{
        fontFamily: "'Press Start 2P', monospace", fontSize: 11,
        color: isRecommended ? "#FFD700" : cs.text,
      }}>?</span>
      {opts && (
        <div style={{
          position: "absolute", bottom: 2, right: 2,
          display: "flex", flexWrap: "wrap", gap: 1, width: 14, justifyContent: "flex-end",
        }}>
          {[...opts].sort().map((v) => (
            <div key={v} style={{
              width: 4, height: 4, borderRadius: "50%",
              background: v===0?"#DD4455":v===3?"#C0A020":v===2?"#40AA60":"#6090B0",
            }} />
          ))}
        </div>
      )}
      {isRecommended && (
        <div style={{
          position: "absolute", top: -2, left: -2,
          fontFamily: "'Press Start 2P', monospace", fontSize: 6,
          color: "#FFD700", textShadow: "0 0 4px #FFD70088",
        }}>★</div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   FLIP PICKER — Modal to input what value was revealed
═══════════════════════════════════════════════════════ */
function FlipPicker({ cell, opts, onSelect, onCancel }) {
  const values = opts ? [...opts].sort() : [0, 1, 2, 3];
  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 1000,
    }} onClick={onCancel}>
      <div style={{
        background: "#FFFFFF", borderRadius: 8, padding: 16,
        boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
        textAlign: "center", minWidth: 200,
      }} onClick={(e) => e.stopPropagation()}>
        <div style={{
          fontFamily: "'Press Start 2P', monospace", fontSize: 9,
          color: "#333", marginBottom: 12,
        }}>
          FLIP R{cell[0]+1} C{cell[1]+1}
        </div>
        <div style={{
          fontFamily: "'Press Start 2P', monospace", fontSize: 7,
          color: "#888", marginBottom: 12,
        }}>
          What was revealed?
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
          {values.map((v) => {
            const cs = CSTYLE[v];
            return (
              <button key={v} onClick={() => onSelect(v)} style={{
                width: 48, height: 48, borderRadius: 6,
                background: cs.bg, border: `3px solid ${cs.border}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                cursor: "pointer", boxShadow: "0 2px 6px rgba(0,0,0,0.2)",
                transition: "transform 0.1s",
              }}
                onMouseDown={(e) => { e.currentTarget.style.transform = "scale(0.9)"; }}
                onMouseUp={(e) => { e.currentTarget.style.transform = ""; }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = ""; }}
              >
                {v === 0 ? (
                  <VoltorbSprite size={24} />
                ) : (
                  <span style={{
                    fontFamily: "'Press Start 2P', monospace",
                    fontSize: 18, color: cs.text,
                  }}>{v}</span>
                )}
              </button>
            );
          })}
        </div>
        <button onClick={onCancel} style={{
          marginTop: 12, fontFamily: "'Press Start 2P', monospace", fontSize: 7,
          color: "#888", background: "transparent", border: "1px solid #DDD",
          borderRadius: 4, padding: "6px 12px", cursor: "pointer",
        }}>CANCEL</button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   CARD CELL — face-down card
═══════════════════════════════════════════════════════ */
function CardCell() {
  return (
    <div className="grid-cell" style={{
      background: "linear-gradient(135deg, #2A8A6A 25%, #1A7A5A 25%, #1A7A5A 50%, #2A8A6A 50%, #2A8A6A 75%, #1A7A5A 75%)",
      backgroundSize: "8px 8px",
      border: "2px solid #1A5A3A",
      borderRadius: 3,
      boxShadow: "inset 0 1px 2px rgba(0,0,0,0.2), 0 1px 0 rgba(255,255,255,0.1)",
    }} />
  );
}

/* ═══════════════════════════════════════════════════════
   HINT PANEL
═══════════════════════════════════════════════════════ */
const HINT_COLORS = [
  { bg: "#E87860", border: "#C85848", label: "#FFF" },
  { bg: "#58B868", border: "#389848", label: "#FFF" },
  { bg: "#D8A040", border: "#B88020", label: "#FFF" },
  { bg: "#5088D8", border: "#3868B8", label: "#FFF" },
  { bg: "#A868C8", border: "#8848A8", label: "#FFF" },
];

function HintPanel({ value, onChange, colorIndex }) {
  const c = HINT_COLORS[colorIndex % 5];
  return (
    <div className="hint-panel" style={{
      background: c.bg, border: `2px solid ${c.border}`,
      borderRadius: 3, display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      padding: "2px 0", gap: 0,
      boxShadow: "inset 0 1px 0 rgba(255,255,255,0.3), 0 1px 2px rgba(0,0,0,0.2)",
    }}>
      <input
        type="number" min="0" max="15" inputMode="numeric"
        value={value.pts} placeholder="00"
        onChange={(e) => onChange({ ...value, pts: e.target.value })}
        style={{
          width: "100%", border: "none", background: "transparent",
          fontFamily: "'Press Start 2P', monospace", fontSize: 11,
          color: c.label, textAlign: "center", outline: "none",
          padding: "1px 0", textShadow: "0 1px 1px rgba(0,0,0,0.4)",
        }}
      />
      <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
        <VoltorbSmall />
        <input
          type="number" min="0" max="5" inputMode="numeric"
          value={value.bombs} placeholder="0"
          onChange={(e) => onChange({ ...value, bombs: e.target.value })}
          style={{
            width: 18, border: "none", background: "transparent",
            fontFamily: "'Press Start 2P', monospace", fontSize: 10,
            color: c.label, textAlign: "center", outline: "none",
            padding: 0, textShadow: "0 1px 1px rgba(0,0,0,0.4)",
          }}
        />
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   BUTTON
═══════════════════════════════════════════════════════ */
function GameBtn({ label, variant = "primary", onClick }) {
  const styles = {
    primary: { bg: "linear-gradient(180deg, #50C878, #38A858)", border: "#288838", color: "#FFF" },
    secondary: { bg: "linear-gradient(180deg, #5098D8, #3878B8)", border: "#285898", color: "#FFF" },
    danger: { bg: "linear-gradient(180deg, #E86858, #C84838)", border: "#A82828", color: "#FFF" },
    gold: { bg: "linear-gradient(180deg, #D8A838, #B88818)", border: "#987008", color: "#FFF" },
  };
  const s = styles[variant] || styles.primary;

  return (
    <button onClick={onClick} style={{
      fontFamily: "'Press Start 2P', monospace", fontSize: 8,
      color: s.color, background: s.bg, border: `2px solid ${s.border}`,
      borderRadius: 4, padding: "8px 12px", cursor: "pointer",
      boxShadow: "0 2px 4px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.3)",
      transition: "transform 0.08s",
      textShadow: "0 1px 1px rgba(0,0,0,0.3)",
    }}
      onMouseDown={(e) => { e.currentTarget.style.transform = "translateY(1px) scale(0.96)"; }}
      onMouseUp={(e) => { e.currentTarget.style.transform = ""; }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = ""; }}
    >{label}</button>
  );
}

/* ═══════════════════════════════════════════════════════
   RANDOM BOARD GENERATOR
═══════════════════════════════════════════════════════ */
const N = 5;
const mkHints = () => Array.from({ length: N }, () => ({ pts: "", bombs: "" }));
const mkKnown = () => Array.from({ length: N }, () => Array.from({ length: N }, () => null));

function generateRandomBoard() {
  const totalBombs = 5 + Math.floor(Math.random() * 6);
  const cells = new Array(25).fill(1);
  const indices = Array.from({ length: 25 }, (_, i) => i);
  for (let i = 0; i < totalBombs; i++) {
    const pick = Math.floor(Math.random() * (25 - i)) + i;
    [indices[i], indices[pick]] = [indices[pick], indices[i]];
  }
  for (let i = 0; i < totalBombs; i++) cells[indices[i]] = 0;

  const nonBombIndices = [];
  for (let i = 0; i < 25; i++) if (cells[i] !== 0) nonBombIndices.push(i);
  for (let i = nonBombIndices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [nonBombIndices[i], nonBombIndices[j]] = [nonBombIndices[j], nonBombIndices[i]];
  }
  const numMult = Math.min(3 + Math.floor(Math.random() * 4), nonBombIndices.length);
  for (let i = 0; i < numMult; i++) cells[nonBombIndices[i]] = Math.random() < 0.6 ? 2 : 3;

  const grid = [];
  for (let r = 0; r < 5; r++) grid.push(cells.slice(r * 5, r * 5 + 5));

  const rowHints = grid.map((row) => ({
    pts: String(row.reduce((a, b) => a + b, 0)),
    bombs: String(row.filter((v) => v === 0).length),
  }));
  const colHints = Array.from({ length: 5 }, (_, c) => {
    const col = grid.map((row) => row[c]);
    return { pts: String(col.reduce((a, b) => a + b, 0)), bombs: String(col.filter((v) => v === 0).length) };
  });
  return { rowHints, colHints };
}

/* ═══════════════════════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════════════════════ */
export default function VoltorbGBA() {
  const [rowH, setRowH] = useState(mkHints());
  const [colH, setColH] = useState(mkHints());
  const [known, setKnown] = useState(mkKnown()); // 5x5: null or 0-3
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [flipPicker, setFlipPicker] = useState(null); // {r, c} or null

  const loadDemo = () => {
    const { rowHints, colHints } = generateRandomBoard();
    setRowH(rowHints); setColH(colHints); setKnown(mkKnown());
    setResult(null); setError(""); setRevealed(false);
  };
  const handlePhotoHints = (rowResults, colResults) => {
    setRowH(rowResults); setColH(colResults); setKnown(mkKnown());
    setResult(null); setError(""); setRevealed(false);
  };
  const clearAll = () => {
    setRowH(mkHints()); setColH(mkHints()); setKnown(mkKnown());
    setResult(null); setError(""); setRevealed(false);
  };

  const doSolve = useCallback((currentKnown) => {
    setRevealed(false); setError(""); setResult(null);
    try {
      const rh = rowH.map((h, i) => {
        const p = parseInt(h.pts), b = parseInt(h.bombs);
        if (isNaN(p) || isNaN(b)) throw new Error(`Row ${i+1}: fill pts + bombs`);
        if (b < 0 || b > 5) throw new Error(`Row ${i+1}: bombs 0–5`);
        return [p, b];
      });
      const ch = colH.map((h, i) => {
        const p = parseInt(h.pts), b = parseInt(h.bombs);
        if (isNaN(p) || isNaN(b)) throw new Error(`Col ${i+1}: fill pts + bombs`);
        if (b < 0 || b > 5) throw new Error(`Col ${i+1}: bombs 0–5`);
        return [p, b];
      });
      const res = runSolver(rh, ch, currentKnown);
      if (res.possible.some((row) => row.some((s) => s.size === 0)))
        throw new Error("No valid solution — check hints");
      setResult(res);
      setTimeout(() => setRevealed(true), 60);
    } catch (e) { setError(e.message); }
  }, [rowH, colH]);

  const handleSolve = () => doSolve(known);

  // Handle cell flip: user reveals a value
  const handleFlipSelect = (value) => {
    if (!flipPicker) return;
    const { r, c } = flipPicker;
    const newKnown = known.map(row => [...row]);
    newKnown[r][c] = value;
    setKnown(newKnown);
    setFlipPicker(null);

    // Re-solve with the new information
    doSolve(newKnown);
  };

  // Undo a flip
  const handleUndoFlip = (r, c) => {
    const newKnown = known.map(row => [...row]);
    newKnown[r][c] = null;
    setKnown(newKnown);
    doSolve(newKnown);
  };

  // Calculate recommendation
  const recommendation = result && !result.isUnique ? getRecommendation(result.possible) : null;

  const flipCount = result ? result.possible.flat().filter((s) => s.size === 1 && ([...s][0] === 2 || [...s][0] === 3)).length : 0;
  const bombCount = result ? result.possible.flat().filter((s) => s.size === 1 && [...s][0] === 0).length : 0;
  const unsureCount = result ? result.possible.flat().filter((s) => s.size > 1).length : 0;
  const knownCount = known.flat().filter(v => v !== null).length;

  return (
    <div style={{
      minHeight: "100vh", background: "#2A6A4A",
      display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", padding: "12px 8px",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap');
        * { box-sizing: border-box; }
        body { margin: 0; background: #2A6A4A; }
        input[type=number]::-webkit-inner-spin-button,
        input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; }
        input[type=number] { -moz-appearance: textfield; }
        .grid-cell { width: 44px; height: 44px; flex-shrink: 0; }
        .hint-panel { width: 44px; height: 44px; flex-shrink: 0; }
        @media (max-width: 400px) {
          .grid-cell { width: 38px; height: 38px; }
          .hint-panel { width: 38px; height: 38px; }
        }
        @media (max-width: 340px) {
          .grid-cell { width: 32px; height: 32px; }
          .hint-panel { width: 32px; height: 32px; }
        }
        @keyframes pulse {
          0%, 100% { box-shadow: 0 0 4px #FFD70066, inset 0 0 2px #FFD70033; }
          50% { box-shadow: 0 0 12px #FFD700AA, inset 0 0 6px #FFD70066; }
        }
      `}</style>

      {/* Flip picker modal */}
      {flipPicker && result && (
        <FlipPicker
          cell={[flipPicker.r, flipPicker.c]}
          opts={result.possible[flipPicker.r][flipPicker.c]}
          onSelect={handleFlipSelect}
          onCancel={() => setFlipPicker(null)}
        />
      )}

      {/* ═══ TITLE BAR ═══ */}
      <div style={{
        background: "linear-gradient(180deg, #3A8A5A 0%, #2A7A4A 100%)",
        border: "2px solid #1A5A3A", borderRadius: "8px 8px 0 0",
        padding: "8px 16px", width: "100%", maxWidth: 380, textAlign: "center",
      }}>
        <div style={{
          fontFamily: "'Press Start 2P', monospace", fontSize: 11,
          color: "#FFFFFF", textShadow: "0 2px 2px rgba(0,0,0,0.4)",
        }}>VOLTORB FLIP</div>
        <div style={{
          fontFamily: "'Press Start 2P', monospace", fontSize: 7,
          color: "#A0E8C0", marginTop: 3,
        }}>SOLVER</div>
      </div>

      {/* ═══ GAME BOARD ═══ */}
      <div style={{
        background: "#3A9A6A", border: "2px solid #1A5A3A",
        borderTop: "none", borderRadius: "0 0 8px 8px",
        padding: "10px", width: "100%", maxWidth: 380,
        boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
      }}>

        {/* Grid + Row hints */}
        {Array.from({ length: N }, (_, r) => (
          <div key={r} style={{ display: "flex", gap: 3, marginBottom: 3 }}>
            {Array.from({ length: N }, (_, c) => {
              const isKnownCell = known[r][c] !== null;
              const isRec = recommendation && recommendation[0] === r && recommendation[1] === c;

              if (!result) return <CardCell key={c} />;

              return (
                <GridCell
                  key={c}
                  opts={result.possible[r][c]}
                  revealed={revealed}
                  delay={(r * N + c) * 28}
                  isRecommended={isRec}
                  isKnown={isKnownCell}
                  knownValue={known[r][c]}
                  onFlip={() => {
                    // Only allow flipping uncertain cells
                    if (!isKnownCell && result.possible[r][c].size > 1) {
                      setFlipPicker({ r, c });
                    }
                  }}
                />
              );
            })}
            <HintPanel value={rowH[r]} colorIndex={r}
              onChange={(v) => { const n = [...rowH]; n[r] = v; setRowH(n); }} />
          </div>
        ))}

        {/* Column hints */}
        <div style={{ display: "flex", gap: 3 }}>
          {colH.map((h, c) => (
            <HintPanel key={c} value={h} colorIndex={c}
              onChange={(v) => { const n = [...colH]; n[c] = v; setColH(n); }} />
          ))}
        </div>

        {/* ═══ STATUS BAR ═══ */}
        <div style={{
          marginTop: 10, minHeight: 26,
          background: "#FFFFFF", border: "2px solid #1A5A3A",
          borderRadius: 4, padding: "6px 10px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          flexWrap: "wrap", gap: 4,
        }}>
          {error ? (
            <span style={{ fontFamily: "'Press Start 2P',monospace", fontSize: 7, color: "#CC2233" }}>⚠ {error}</span>
          ) : result ? (
            <>
              <span style={{
                fontFamily: "'Press Start 2P',monospace", fontSize: 8,
                color: result.isUnique ? "#208848" : "#B88020",
              }}>{result.isUnique ? "✓ SOLVED" : "~ PARTIAL"}</span>
              <div style={{ display: "flex", gap: 6 }}>
                <span style={{ fontFamily: "'Press Start 2P',monospace", fontSize: 7, color: "#208848" }}>★{flipCount}</span>
                <span style={{ fontFamily: "'Press Start 2P',monospace", fontSize: 7, color: "#CC2233" }}>✗{bombCount}</span>
                <span style={{ fontFamily: "'Press Start 2P',monospace", fontSize: 7, color: "#3868B8" }}>?{unsureCount}</span>
              </div>
            </>
          ) : (
            <span style={{ fontFamily: "'Press Start 2P',monospace", fontSize: 7, color: "#88AA88" }}>
              ENTER HINTS → SOLVE
            </span>
          )}
        </div>

        {/* ═══ RECOMMENDATION HINT ═══ */}
        {result && !result.isUnique && recommendation && (
          <div style={{
            marginTop: 6, padding: "6px 10px",
            background: "#1A5A3A", borderRadius: 4,
            border: "1px solid #FFD70044",
          }}>
            <span style={{
              fontFamily: "'Press Start 2P',monospace", fontSize: 7, color: "#FFD700",
            }}>★ TAP GOLD CELL TO FLIP</span>
            {knownCount > 0 && (
              <span style={{
                fontFamily: "'Press Start 2P',monospace", fontSize: 6, color: "#A0E8C0",
                display: "block", marginTop: 3,
              }}>{knownCount} flipped</span>
            )}
          </div>
        )}

        {/* ═══ BUTTONS ═══ */}
        <div style={{ display: "flex", gap: 8, marginTop: 10, justifyContent: "center", flexWrap: "wrap" }}>
          <GameBtn label="SOLVE" variant="primary" onClick={handleSolve} />
          <GameBtn label="RANDOM" variant="secondary" onClick={loadDemo} />
          <GameBtn label="CLEAR" variant="danger" onClick={clearAll} />
        </div>

        {/* ═══ PHOTO CAPTURE ═══ */}
        <PhotoCapture onHintsDetected={handlePhotoHints} />

      </div>
    </div>
  );
}
