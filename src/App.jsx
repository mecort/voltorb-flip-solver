import { useState, useCallback } from "react";

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

function SuicuneSilhouette() {
  return (
    <svg viewBox="0 0 88 60" width={66} height={45} style={{ opacity: 0.28 }}>
      {/* Body */}
      <ellipse cx="52" cy="38" rx="24" ry="13" fill="#1E4CC8" />
      {/* Head */}
      <ellipse cx="25" cy="28" rx="14" ry="12" fill="#1E4CC8" />
      {/* Muzzle */}
      <ellipse cx="14" cy="32" rx="7" ry="5.5" fill="#C8D8FF" />
      {/* Eye */}
      <circle cx="22" cy="24" r="2.8" fill="#990011" />
      <circle cx="22.8" cy="23.2" r="0.9" fill="white" />
      {/* Ears */}
      <polygon points="20,17 24,8 29,16" fill="#1E4CC8" />
      <polygon points="22,17 25,11 28,16" fill="#3366DD" />
      {/* Crystal crest */}
      <polygon points="24,15 20,6 27,6 32,13" fill="#8855BB" />
      <polygon points="28,13 26,5 32,5 35,11" fill="#AA77DD" opacity="0.8" />
      {/* Flowing ribbons */}
      <path d="M33 20 Q52 6 70 13 Q78 18 73 23 Q63 16 46 20" fill="#6633AA" opacity="0.9" />
      <path d="M35 25 Q55 12 72 19 Q80 24 75 29 Q65 22 48 25" fill="#9966CC" opacity="0.65" />
      <path d="M36 30 Q56 20 73 26 Q80 31 75 35 Q66 29 50 30" fill="#BB99EE" opacity="0.4" />
      {/* Diamond markings */}
      <polygon points="44,30 47,25 50,30 47,35" fill="white" opacity="0.7" />
      <polygon points="57,32 60,27 63,32 60,37" fill="white" opacity="0.7" />
      {/* Legs */}
      <rect x="34" y="48" width="6" height="12" rx="2.5" fill="#143A99" />
      <rect x="45" y="49" width="6" height="11" rx="2.5" fill="#143A99" />
      <rect x="57" y="49" width="6" height="11" rx="2.5" fill="#143A99" />
      <rect x="67" y="48" width="6" height="12" rx="2.5" fill="#143A99" />
      {/* Tail */}
      <path d="M75 38 Q86 30 82 44" stroke="#1E4CC8" strokeWidth="4.5" fill="none" strokeLinecap="round" />
    </svg>
  );
}

/* ═══════════════════════════════════════════════════════
   CRYSTAL BOX BORDERS
═══════════════════════════════════════════════════════ */
function CornerMarks({ color = "#00CCBB", size = 6 }) {
  const corners = [
    { top: -2, left: -2 }, { top: -2, right: -2 },
    { bottom: -2, left: -2 }, { bottom: -2, right: -2 },
  ];
  return (
    <>
      {corners.map((pos, i) => (
        <div key={i} style={{ position: "absolute", width: size, height: size, background: color, ...pos }} />
      ))}
    </>
  );
}

/* ═══════════════════════════════════════════════════════
   GAME CELLS
═══════════════════════════════════════════════════════ */
const CSTYLE = {
  0: { bg: "#240812", border: "#FF3344", text: "#FF8899", glow: "#FF334488" },
  1: { bg: "#080F1E", border: "#2A4060", text: "#5577AA", glow: "none" },
  2: { bg: "#071612", border: "#1ABB55", text: "#22FF88", glow: "#1ABB5566" },
  3: { bg: "#181400", border: "#BBAA00", text: "#FFEE22", glow: "#BBAA0066" },
  "?": { bg: "#070D18", border: "#162840", text: "#233350", glow: "none" },
};

function CrystalCell({ opts, revealed, delay }) {
  const solved = opts?.size === 1;
  const val = solved ? [...opts][0] : null;
  const cs = val !== null ? CSTYLE[val] : CSTYLE["?"];

  return (
    <div style={{
      width: 50, height: 50, flexShrink: 0,
      background: cs.bg, border: `2px solid ${cs.border}`,
      borderRadius: 3, position: "relative",
      display: "flex", alignItems: "center", justifyContent: "center",
      boxShadow: cs.glow !== "none" ? `0 0 7px ${cs.glow}, inset 0 0 3px ${cs.glow}` : "none",
      opacity: revealed ? 1 : 0,
      transform: revealed ? "scale(1) rotateY(0deg)" : "scale(0.3) rotateY(90deg)",
      transition: `opacity 0.32s ${delay}ms, transform 0.32s ${delay}ms`,
    }}>
      <CornerMarks color={cs.border} size={5} />
      {val === 0 ? (
        <VoltorbSprite size={30} />
      ) : solved ? (
        <span style={{
          fontFamily: "'Press Start 2P', monospace",
          fontSize: 22, color: cs.text,
          textShadow: cs.glow !== "none" ? `0 0 10px ${cs.text}` : "none",
        }}>{val}</span>
      ) : (
        <>
          <span style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 14, color: "#1A2840" }}>?</span>
          {opts && (
            <div style={{
              position: "absolute", bottom: 3, right: 3,
              display: "flex", flexWrap: "wrap", gap: 2, width: 14, justifyContent: "flex-end",
            }}>
              {[...opts].sort().map((v) => (
                <div key={v} style={{
                  width: 4, height: 4, borderRadius: "50%",
                  background: v===0?"#FF3344":v===3?"#FFEE22":v===2?"#22FF88":"#2A4060",
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
   HINT INPUT CELLS
═══════════════════════════════════════════════════════ */
function HintCell({ value, onChange, width = 50 }) {
  const base = {
    flex: 1, width: "100%", border: "none", background: "transparent",
    fontFamily: "'Press Start 2P', monospace", fontSize: 8,
    textAlign: "center", outline: "none", padding: "1px 0",
  };
  return (
    <div style={{
      width, height: 50, flexShrink: 0,
      background: "#040A14", border: "1.5px solid #162436",
      borderRadius: 3, display: "flex", flexDirection: "column", overflow: "hidden",
    }}>
      <input type="number" min="0" max="15"
        value={value.pts} placeholder="pt"
        onChange={(e) => onChange({ ...value, pts: e.target.value })}
        style={{ ...base, color: "#00FFDD", borderBottom: "1px solid #162436" }} />
      <input type="number" min="0" max="5"
        value={value.bombs} placeholder="💣"
        onChange={(e) => onChange({ ...value, bombs: e.target.value })}
        style={{ ...base, color: "#FF6677" }} />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   HARDWARE WIDGETS
═══════════════════════════════════════════════════════ */
function Dpad() {
  const armStyle = {
    position: "absolute", background: "linear-gradient(to bottom, #1A1050, #100C3A)",
    boxShadow: "inset 0 2px 5px #00000099, inset 0 -1px 2px #FFFFFF0A",
  };
  return (
    <div style={{ position: "relative", width: 74, height: 74 }}>
      <div style={{ ...armStyle, left: 0, top: 25, width: 74, height: 24, borderRadius: 3 }} />
      <div style={{ ...armStyle, left: 25, top: 0, width: 24, height: 74, borderRadius: 3 }} />
      <div style={{ position: "absolute", left: 29, top: 29, width: 16, height: 16, background: "#0C0830", borderRadius: 2 }} />
      {[{s:{left:5,top:31},t:"◄"},{s:{right:5,top:31},t:"►"},{s:{top:5,left:31},t:"▲"},{s:{bottom:5,left:31},t:"▼"}]
        .map(({ s, t }, i) => (
          <div key={i} style={{
            position: "absolute", color: "#231558",
            fontFamily: "monospace", fontSize: 11,
            width: 12, height: 12, display: "flex",
            alignItems: "center", justifyContent: "center", ...s,
          }}>{t}</div>
        ))}
    </div>
  );
}

function RoundBtn({ label, color, bg, size, top, left, onClick }) {
  return (
    <button onClick={onClick} style={{
      position: "absolute", top, left,
      width: size, height: size, borderRadius: "50%",
      background: `radial-gradient(circle at 36% 30%, ${color}BB, ${bg})`,
      border: `2px solid ${color}`,
      boxShadow: `0 4px 10px #00000099, 0 1px 0 ${color}33, inset 0 1px 0 ${color}44`,
      color: "white", fontFamily: "'Press Start 2P', monospace", fontSize: 8,
      cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
      transition: "transform 0.07s, box-shadow 0.07s",
    }}
      onMouseDown={(e) => { e.currentTarget.style.transform = "translateY(2px) scale(0.92)"; e.currentTarget.style.boxShadow = `0 1px 4px #00000099`; }}
      onMouseUp={(e) => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = `0 4px 10px #00000099, inset 0 1px 0 ${color}44`; }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = `0 4px 10px #00000099, inset 0 1px 0 ${color}44`; }}
    >{label}</button>
  );
}

function OvalBtn({ label, onClick }) {
  return (
    <button onClick={onClick} style={{
      width: 60, height: 16, background: "linear-gradient(to bottom, #1C1258, #100C3A)",
      border: "1px solid #2A1A6A", borderRadius: 10,
      color: "#7766BB", fontFamily: "'Press Start 2P', monospace", fontSize: 6,
      cursor: "pointer", boxShadow: "inset 0 2px 4px #00000099, 0 1px 0 #FFFFFF08",
      transform: "rotate(-9deg)", display: "flex", alignItems: "center", justifyContent: "center",
    }}
      onMouseDown={(e) => { e.currentTarget.style.transform = "rotate(-9deg) translateY(1px)"; }}
      onMouseUp={(e) => { e.currentTarget.style.transform = "rotate(-9deg)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = "rotate(-9deg)"; }}
    >{label}</button>
  );
}

/* ═══════════════════════════════════════════════════════
   SCREEN BUTTON (in-game UI)
═══════════════════════════════════════════════════════ */
function ScreenBtn({ label, fg, bg, onClick }) {
  return (
    <button onClick={onClick} style={{
      fontFamily: "'Press Start 2P', monospace", fontSize: 7,
      color: fg, background: bg, border: `1.5px solid ${fg}44`,
      borderRadius: 2, padding: "5px 10px", cursor: "pointer",
      boxShadow: `0 0 6px ${fg}22`,
    }}
      onMouseDown={(e) => { e.currentTarget.style.transform = "translateY(1px) scale(0.94)"; }}
      onMouseUp={(e) => { e.currentTarget.style.transform = ""; }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = ""; }}
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
      minHeight: "100vh", background: "#06040E",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: "24px 12px",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap');
        * { box-sizing: border-box; }
        body { margin: 0; background: #06040E; }
        input[type=number]::-webkit-inner-spin-button,
        input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; }
        input[type=number] { -moz-appearance: textfield; }

        @keyframes sparkle {
          0%,100% { opacity:1;  transform:scale(1)   rotate(0deg);   }
          33%      { opacity:.3; transform:scale(.55) rotate(20deg);  }
          66%      { opacity:.8; transform:scale(1.1) rotate(-12deg); }
        }
        @keyframes led {
          0%,100% { opacity:1;   box-shadow:0 0 7px #00EE77,0 0 14px #00EE7755; }
          50%      { opacity:.65; box-shadow:0 0 3px #00EE77; }
        }
        @keyframes screenPulse {
          0%,100% { box-shadow:inset 0 0 0 1px #142840,0 0 18px #00FFCC0D; }
          50%      { box-shadow:inset 0 0 0 1px #142840,0 0 30px #00FFCC1A; }
        }
        @keyframes shimmer {
          0%   { background-position:200% center; }
          100% { background-position:-200% center; }
        }
      `}</style>

      {/* ════ GBA SHELL ════ */}
      <div style={{
        background: `
          radial-gradient(ellipse at 30% 20%, #8866DD22 0%, transparent 50%),
          linear-gradient(155deg, #8A5EDD 0%, #6040CC 15%, #4828B8 40%, #3A1EA8 65%, #2C1490 100%)
        `,
        borderRadius: "22px 22px 56px 56px",
        position: "relative", maxWidth: 720, width: "100%",
        boxShadow: [
          "0 20px 70px rgba(0,0,0,0.95)",
          "0 6px 10px rgba(0,0,0,0.9)",
          "inset 0 2px 0 rgba(255,255,255,0.16)",
          "inset 2px 0 0 rgba(255,255,255,0.07)",
          "inset -2px 0 0 rgba(0,0,0,0.3)",
          "inset 0 -8px 20px rgba(0,0,0,0.6)",
        ].join(","),
      }}>

        {/* ── L / R SHOULDER BUTTONS ── */}
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          {[
            { label: "L", radius: "10px 5px 0 0", shadow: "inset 2px 0 0 rgba(255,255,255,0.1)" },
            { label: "R", radius: "5px 10px 0 0", shadow: "inset -2px 0 0 rgba(255,255,255,0.1)" },
          ].map(({ label, radius, shadow }) => (
            <div key={label} style={{
              width: 118, height: 22,
              background: "linear-gradient(to bottom, #7050C8, #3A1EA8)",
              borderRadius: radius,
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: `inset 0 2px 0 rgba(255,255,255,0.12), 0 -3px 6px rgba(0,0,0,0.5), ${shadow}`,
            }}>
              <span style={{ fontFamily: "'Press Start 2P',monospace", fontSize: 8, color: "#AA88EE" }}>{label}</span>
            </div>
          ))}
        </div>

        {/* ── VOLUME SLIDER NOTCH ── */}
        <div style={{ position: "absolute", left: 18, top: 36, width: 8, height: 28, background: "#200E60", borderRadius: 4, boxShadow: "inset 0 2px 4px #00000099" }}>
          <div style={{ width: "100%", height: 10, background: "#3A2280", borderRadius: 4, marginTop: 8 }} />
        </div>

        {/* ── MAIN ROW ── */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "10px 20px 6px" }}>

          {/* LEFT: D-Pad */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, minWidth: 82, flexShrink: 0 }}>
            <Dpad />
          </div>

          {/* CENTER: Screen bezel */}
          <div style={{
            flex: 1,
            background: "linear-gradient(to bottom, #0C0620, #08041A)",
            borderRadius: 8, padding: 10,
            boxShadow: "inset 0 5px 16px rgba(0,0,0,0.97), inset 0 0 0 1px #2A166A, inset 0 1px 0 rgba(255,255,255,0.04)",
            position: "relative",
          }}>
            {/* Power LED */}
            <div style={{
              position: "absolute", top: 11, right: 14,
              width: 7, height: 7, borderRadius: "50%", background: "#00EE77",
              animation: "led 2.4s ease-in-out infinite",
            }} />

            {/* ── LCD SCREEN ── */}
            <div style={{
              background: "#050C16", borderRadius: 4,
              animation: "screenPulse 4s ease-in-out infinite",
              overflow: "hidden", position: "relative",
            }}>
              {/* Scanlines */}
              <div style={{
                position: "absolute", inset: 0, zIndex: 10, pointerEvents: "none",
                background: "repeating-linear-gradient(to bottom,transparent 0px,transparent 2px,rgba(0,0,0,0.07) 2px,rgba(0,0,0,0.07) 3px)",
              }} />
              {/* LCD tint */}
              <div style={{
                position: "absolute", inset: 0, zIndex: 9, pointerEvents: "none",
                background: "radial-gradient(ellipse at 50% 40%, rgba(0,200,180,0.03) 0%, transparent 70%)",
              }} />

              <div style={{ padding: "10px 12px", position: "relative" }}>

                {/* ── CRYSTAL TITLE ── */}
                <div style={{ textAlign: "center", marginBottom: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
                    {[0, 1, 2, 3].map((i) => (
                      <span key={i} style={{
                        fontSize: 9, color: "#00FFCC", display: "inline-block",
                        animation: `sparkle ${1.1 + i * 0.38}s ease-in-out infinite`,
                        animationDelay: `${i * 0.18}s`,
                      }}>✦</span>
                    ))}
                    <span style={{
                      fontFamily: "'Press Start 2P',monospace", fontSize: 12,
                      letterSpacing: 2, color: "#F2EEFF",
                      textShadow: "0 0 14px #7755FF44, 0 0 3px #9988FF22",
                    }}>VOLTORB FLIP</span>
                    {[3, 2, 1, 0].map((i) => (
                      <span key={i} style={{
                        fontSize: 9, color: "#00FFCC", display: "inline-block",
                        animation: `sparkle ${1.8 - i * 0.28}s ease-in-out infinite`,
                        animationDelay: `${i * 0.22}s`,
                      }}>✦</span>
                    ))}
                  </div>
                  <div style={{
                    fontFamily: "'Press Start 2P',monospace", fontSize: 7,
                    letterSpacing: 4, marginTop: 3,
                    background: "linear-gradient(90deg,#00BBAA,#55DDFF,#AA88FF,#00BBAA)",
                    backgroundSize: "200% auto",
                    WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
                    animation: "shimmer 4s linear infinite",
                  }}>POKÉMON CRYSTAL ED.</div>
                </div>

                {/* ── GRID (Crystal Box) ── */}
                <div style={{
                  border: "2px solid #00BBAA", borderRadius: 3,
                  background: "#040B14", padding: 8,
                  position: "relative",
                  boxShadow: "0 0 12px #00BBAA33, inset 0 0 8px #00000088",
                }}>
                  <CornerMarks color="#00BBAA" size={7} />

                  {/* Hint legend */}
                  <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginBottom: 4, paddingRight: 2 }}>
                    <span style={{ fontFamily: "'Press Start 2P',monospace", fontSize: 6, color: "#00FFDD" }}>▲PTS</span>
                    <span style={{ fontFamily: "'Press Start 2P',monospace", fontSize: 6, color: "#FF6677" }}>▼BMB</span>
                  </div>

                  {/* Column hints */}
                  <div style={{ display: "flex", gap: 4, marginBottom: 4, marginLeft: 74 }}>
                    {colH.map((h, c) => (
                      <HintCell key={c} value={h} width={50}
                        onChange={(v) => { const n = [...colH]; n[c] = v; setColH(n); }} />
                    ))}
                  </div>

                  {/* Grid rows */}
                  {Array.from({ length: N }, (_, r) => (
                    <div key={r} style={{ display: "flex", gap: 4, marginBottom: r < 4 ? 4 : 0 }}>
                      <HintCell value={rowH[r]} width={70}
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
                  marginTop: 6, minHeight: 26,
                  border: "1px solid #122032", borderRadius: 2,
                  background: "#030910", padding: "4px 8px",
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                }}>
                  {error ? (
                    <span style={{ fontFamily: "'Press Start 2P',monospace", fontSize: 6, color: "#FF4455" }}>⚠ {error}</span>
                  ) : result ? (
                    <>
                      <span style={{
                        fontFamily: "'Press Start 2P',monospace", fontSize: 7,
                        color: result.isUnique ? "#00FF88" : "#FFEE22",
                      }}>{result.isUnique ? "✓ SOLVED!" : "~ PARTIAL"}</span>
                      <span style={{ fontFamily: "'Press Start 2P',monospace", fontSize: 7, color: "#22FF88" }}>★{flipCount}</span>
                      <span style={{ fontFamily: "'Press Start 2P',monospace", fontSize: 7, color: "#FF4455" }}>✗{bombCount}</span>
                      <span style={{ fontFamily: "'Press Start 2P',monospace", fontSize: 7, color: "#4488FF" }}>?{unsureCount}</span>
                    </>
                  ) : (
                    <span style={{ fontFamily: "'Press Start 2P',monospace", fontSize: 6, color: "#1A3050", letterSpacing: 1 }}>
                      ENTER HINTS — PRESS A OR START
                    </span>
                  )}
                </div>

                {/* ── IN-SCREEN BUTTONS ── */}
                <div style={{ display: "flex", gap: 6, marginTop: 6, justifyContent: "center" }}>
                  <ScreenBtn label="SOLVE" fg="#00FF88" bg="#04140A" onClick={handleSolve} />
                  <ScreenBtn label="DEMO"  fg="#44AAFF" bg="#04101A" onClick={loadDemo} />
                  <ScreenBtn label="CLR"   fg="#FF6677" bg="#14040A" onClick={clearAll} />
                </div>

              </div>{/* /screen padding */}
            </div>{/* /LCD */}
          </div>{/* /bezel */}

          {/* RIGHT: A/B + guide */}
          <div style={{ minWidth: 90, flexShrink: 0, position: "relative", height: 90 }}>
            <RoundBtn label="B" color="#5544EE" bg="#2211AA" size={36} top={30} left={2}  onClick={clearAll}  />
            <RoundBtn label="A" color="#EE2244" bg="#AA0022" size={42} top={6}  left={48} onClick={handleSolve} />
            <span style={{
              position: "absolute", bottom: -8, left: "50%", transform: "translateX(-50%)",
              fontFamily: "'Press Start 2P',monospace", fontSize: 6, color: "#3A2280", whiteSpace: "nowrap",
            }}>A=SOLVE  B=CLR</span>
          </div>

        </div>{/* /main row */}

        {/* ── BOTTOM BAR ── */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "4px 28px 22px",
        }}>
          {/* Select + Start */}
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <OvalBtn label="SELECT" onClick={loadDemo} />
            <OvalBtn label="START"  onClick={handleSolve} />
          </div>

          {/* Suicune label */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
            <SuicuneSilhouette />
            <span style={{ fontFamily: "'Press Start 2P',monospace", fontSize: 5, color: "#2E1890", letterSpacing: 3 }}>
              GAME BOY ADVANCE
            </span>
          </div>

          {/* Speaker grille */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 6px)", gap: "4px 3px" }}>
            {Array.from({ length: 28 }).map((_, i) => {
              const row = Math.floor(i / 7), col = i % 7;
              const corner = (row === 0 && (col === 0 || col === 6)) || (row === 3 && (col === 0 || col === 6));
              return corner ? <div key={i} /> : (
                <div key={i} style={{
                  width: 5, height: 6, borderRadius: "50% / 40%",
                  background: "#1C1260",
                  boxShadow: "inset 0 1px 2px #00000088, inset 0 -0.5px 0 #FFFFFF08",
                }} />
              );
            })}
          </div>
        </div>

        {/* ── HEADPHONE PORT NOTCH ── */}
        <div style={{
          position: "absolute", bottom: 14, left: "50%", transform: "translateX(-50%)",
          width: 10, height: 10, background: "#0A0626",
          borderRadius: "50%", boxShadow: "inset 0 2px 4px #000000AA",
        }} />

      </div>{/* /GBA shell */}
    </div>
  );
}
