import { useState, useCallback } from "react";
import PhotoCapture from "./PhotoCapture";

/* ═══════════════════════════════════════════════════════
   SOLVER ENGINE — Heuristic + Exhaustive Enumeration
   
   Approach:
   1. Apply heuristic deduction rules to narrow cell possibilities
   2. Enumerate ALL valid complete boards consistent with hints + known cells
   3. For each unknown cell, compute probability distribution across all solutions
   4. Identify safe cells (never a bomb in any solution)
   5. Recommend the safest non-trivial flip (lowest bomb probability among cells
      that could be 2 or 3, since those are what you need to find)
═══════════════════════════════════════════════════════ */

/**
 * Apply heuristic deduction rules to narrow possibilities.
 * Each cell has a Set of possible values {0, 1, 2, 3}.
 * 
 * Heuristics:
 * H1: If remaining bombs + remaining points = remaining cells → all must be 1
 * H2: If remaining bombs = remaining cells → all must be 0
 * H3: If remaining bombs = 0 → no cell can be 0
 * H4: If remaining points = 0 and remaining bombs = remaining cells → all are 0
 * H5: If a cell can only be one value, pin it
 * H6: Iterative constraint propagation (if pinning changes things, re-run)
 */
function applyHeuristics(possible, rh, ch, known) {
  let changed = true;
  let iterations = 0;

  while (changed && iterations < 20) {
    changed = false;
    iterations++;

    // Process rows
    for (let r = 0; r < 5; r++) {
      const [targetPts, targetBombs] = rh[r];
      let knownPts = 0, knownBombs = 0, unknownIndices = [];

      for (let c = 0; c < 5; c++) {
        if (known[r][c] !== null) {
          knownPts += known[r][c];
          if (known[r][c] === 0) knownBombs++;
        } else if (possible[r][c].size === 1) {
          const val = [...possible[r][c]][0];
          knownPts += val;
          if (val === 0) knownBombs++;
        } else {
          unknownIndices.push(c);
        }
      }

      const remainPts = targetPts - knownPts;
      const remainBombs = targetBombs - knownBombs;
      const remainCells = unknownIndices.length;

      if (remainCells === 0) continue;

      // H2: All remaining must be bombs
      if (remainBombs === remainCells && remainPts === 0) {
        for (const c of unknownIndices) {
          if (possible[r][c].size !== 1 || ![...possible[r][c]][0] === 0) {
            possible[r][c] = new Set([0]);
            changed = true;
          }
        }
        continue;
      }

      // H3: No bombs remaining — remove 0 from all unknowns
      if (remainBombs === 0) {
        for (const c of unknownIndices) {
          if (possible[r][c].has(0)) {
            possible[r][c].delete(0);
            changed = true;
          }
        }
      }

      // H1: remaining bombs + remaining non-bomb points = remaining cells
      // and remaining non-bomb points = remaining cells - remaining bombs
      // If each non-bomb cell must contribute exactly 1 point → all non-bombs are 1
      const nonBombCells = remainCells - remainBombs;
      if (nonBombCells > 0 && remainPts === nonBombCells) {
        // All non-bomb unknowns must be 1
        for (const c of unknownIndices) {
          const prev = possible[r][c].size;
          const newSet = new Set();
          if (possible[r][c].has(0) && remainBombs > 0) newSet.add(0);
          if (possible[r][c].has(1)) newSet.add(1);
          if (newSet.size > 0 && newSet.size < prev) {
            possible[r][c] = newSet;
            changed = true;
          }
        }
      }

      // If remaining points > remaining non-bomb cells, some must be >1
      // If remaining points requires all to be max (3), force that
      if (nonBombCells > 0 && remainPts === nonBombCells * 3) {
        for (const c of unknownIndices) {
          if (possible[r][c].has(3) || possible[r][c].has(0)) {
            const newSet = new Set();
            if (possible[r][c].has(0) && remainBombs > 0) newSet.add(0);
            if (possible[r][c].has(3)) newSet.add(3);
            if (newSet.size > 0 && newSet.size < possible[r][c].size) {
              possible[r][c] = newSet;
              changed = true;
            }
          }
        }
      }

      // Remove values that are too large for remaining points
      for (const c of unknownIndices) {
        if (possible[r][c].size > 1) {
          const prev = possible[r][c].size;
          for (const v of [...possible[r][c]]) {
            if (v > remainPts && v !== 0) possible[r][c].delete(v);
          }
          if (possible[r][c].size < prev) changed = true;
        }
      }
    }

    // Process columns (same logic)
    for (let c = 0; c < 5; c++) {
      const [targetPts, targetBombs] = ch[c];
      let knownPts = 0, knownBombs = 0, unknownIndices = [];

      for (let r = 0; r < 5; r++) {
        if (known[r][c] !== null) {
          knownPts += known[r][c];
          if (known[r][c] === 0) knownBombs++;
        } else if (possible[r][c].size === 1) {
          const val = [...possible[r][c]][0];
          knownPts += val;
          if (val === 0) knownBombs++;
        } else {
          unknownIndices.push(r);
        }
      }

      const remainPts = targetPts - knownPts;
      const remainBombs = targetBombs - knownBombs;
      const remainCells = unknownIndices.length;

      if (remainCells === 0) continue;

      if (remainBombs === remainCells && remainPts === 0) {
        for (const r of unknownIndices) {
          if (possible[r][c].size !== 1) { possible[r][c] = new Set([0]); changed = true; }
        }
        continue;
      }
      if (remainBombs === 0) {
        for (const r of unknownIndices) {
          if (possible[r][c].has(0)) { possible[r][c].delete(0); changed = true; }
        }
      }
      const nonBombCells = remainCells - remainBombs;
      if (nonBombCells > 0 && remainPts === nonBombCells) {
        for (const r of unknownIndices) {
          const prev = possible[r][c].size;
          const newSet = new Set();
          if (possible[r][c].has(0) && remainBombs > 0) newSet.add(0);
          if (possible[r][c].has(1)) newSet.add(1);
          if (newSet.size > 0 && newSet.size < prev) { possible[r][c] = newSet; changed = true; }
        }
      }
      if (nonBombCells > 0 && remainPts === nonBombCells * 3) {
        for (const r of unknownIndices) {
          const newSet = new Set();
          if (possible[r][c].has(0) && remainBombs > 0) newSet.add(0);
          if (possible[r][c].has(3)) newSet.add(3);
          if (newSet.size > 0 && newSet.size < possible[r][c].size) { possible[r][c] = newSet; changed = true; }
        }
      }
      for (const r of unknownIndices) {
        if (possible[r][c].size > 1) {
          const prev = possible[r][c].size;
          for (const v of [...possible[r][c]]) {
            if (v > remainPts && v !== 0) possible[r][c].delete(v);
          }
          if (possible[r][c].size < prev) changed = true;
        }
      }
    }
  }

  return possible;
}

/**
 * Enumerate all valid complete boards using row-by-row BFS.
 * Each row must satisfy its sum and bomb count.
 * Each column must satisfy its sum and bomb count.
 * Only values from `possible[r][c]` are tried for each cell.
 * 
 * Returns array of valid boards (each a 5x5 number array).
 * Caps at maxSolutions to avoid hanging on underconstrained boards.
 */
function enumerateSolutions(possible, rh, ch, known, maxSolutions = 5000) {
  const solutions = [];

  // Generate valid row assignments for each row
  function getRowCombos(r) {
    const [targetSum, targetBombs] = rh[r];
    const cells = [];
    for (let c = 0; c < 5; c++) {
      if (known[r][c] !== null) {
        cells.push([known[r][c]]);
      } else {
        cells.push([...possible[r][c]]);
      }
    }

    // Generate cartesian product filtered by row constraints
    let combos = [[]];
    for (let c = 0; c < 5; c++) {
      const next = [];
      for (const partial of combos) {
        for (const val of cells[c]) {
          next.push([...partial, val]);
        }
      }
      combos = next;
      // Early prune: too many bombs or sum already too high
      combos = combos.filter(combo => {
        const bombs = combo.filter(v => v === 0).length;
        const sum = combo.reduce((a, b) => a + b, 0);
        if (bombs > targetBombs) return false;
        if (sum > targetSum) return false;
        return true;
      });
    }

    // Final filter: exact match
    return combos.filter(combo => {
      const bombs = combo.filter(v => v === 0).length;
      const sum = combo.reduce((a, b) => a + b, 0);
      return bombs === targetBombs && sum === targetSum;
    });
  }

  // Get valid combos for each row
  const rowCombos = [];
  for (let r = 0; r < 5; r++) {
    const combos = getRowCombos(r);
    if (combos.length === 0) return []; // No valid solutions
    rowCombos.push(combos);
  }

  // BFS: try all combinations of row assignments that satisfy column constraints
  function search(r, board) {
    if (solutions.length >= maxSolutions) return;

    if (r === 5) {
      // Verify all columns
      for (let c = 0; c < 5; c++) {
        const col = board.map(row => row[c]);
        const sum = col.reduce((a, b) => a + b, 0);
        const bombs = col.filter(v => v === 0).length;
        if (sum !== ch[c][0] || bombs !== ch[c][1]) return;
      }
      solutions.push(board.map(row => [...row]));
      return;
    }

    // Prune: check partial column constraints
    for (const combo of rowCombos[r]) {
      // Quick column check: would adding this row make any column impossible?
      let valid = true;
      for (let c = 0; c < 5; c++) {
        const colSoFar = board.slice(0, r).map(row => row[c]);
        colSoFar.push(combo[c]);
        const partialSum = colSoFar.reduce((a, b) => a + b, 0);
        const partialBombs = colSoFar.filter(v => v === 0).length;
        if (partialSum > ch[c][0] || partialBombs > ch[c][1]) { valid = false; break; }
        // Check remaining rows can still satisfy column
        const remainRows = 5 - r - 1;
        if (partialBombs + remainRows < ch[c][1]) { valid = false; break; } // Not enough rows for remaining bombs
        const maxRemainPts = remainRows * 3;
        if (partialSum + maxRemainPts < ch[c][0]) { valid = false; break; } // Can't reach target sum
      }
      if (!valid) continue;

      board.push(combo);
      search(r + 1, board);
      board.pop();

      if (solutions.length >= maxSolutions) return;
    }
  }

  search(0, []);
  return solutions;
}

/**
 * Compute per-cell probability distributions from enumerated solutions.
 * Returns a 5x5 array of { counts: {0:n, 1:n, 2:n, 3:n}, total: n, bombProb: f, safe: bool }
 */
function computeProbabilities(solutions) {
  const probs = Array.from({ length: 5 }, () =>
    Array.from({ length: 5 }, () => ({ counts: { 0: 0, 1: 0, 2: 0, 3: 0 }, total: 0 }))
  );

  for (const board of solutions) {
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 5; c++) {
        probs[r][c].counts[board[r][c]]++;
        probs[r][c].total++;
      }
    }
  }

  // Compute derived fields
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      const p = probs[r][c];
      p.bombProb = p.total > 0 ? p.counts[0] / p.total : 0;
      p.safe = p.counts[0] === 0; // Never a bomb in any solution
    }
  }

  return probs;
}

/**
 * Main solver: combines heuristics + exhaustive enumeration.
 * Returns { possible, probs, solutions, safeCells, recommendation }
 */
function runSolver(rh, ch, known) {
  // Initialize possibility sets
  const possible = Array.from({ length: 5 }, (_, r) =>
    Array.from({ length: 5 }, (_, c) =>
      known[r][c] !== null ? new Set([known[r][c]]) : new Set([0, 1, 2, 3])
    )
  );

  // Step 1: Heuristic deduction
  applyHeuristics(possible, rh, ch, known);

  // Check for contradictions
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      if (possible[r][c].size === 0) {
        return { possible, probs: null, solutions: [], error: "No valid solution — check your hints" };
      }
    }
  }

  // Step 2: Enumerate all valid solutions
  const solutions = enumerateSolutions(possible, rh, ch, known);

  if (solutions.length === 0) {
    return { possible, probs: null, solutions: [], error: "No valid solution — check your hints" };
  }

  // Step 3: Compute probabilities
  const probs = computeProbabilities(solutions);

  // Step 4: Update possible sets from actual solutions (may be tighter than heuristics)
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      if (known[r][c] !== null) continue;
      const actualPossible = new Set();
      for (const [val, count] of Object.entries(probs[r][c].counts)) {
        if (count > 0) actualPossible.add(Number(val));
      }
      possible[r][c] = actualPossible;
    }
  }

  // Step 5: Find safe cells (never a bomb) and recommendation
  const safeCells = [];
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      if (known[r][c] !== null) continue;
      if (possible[r][c].size === 1) continue; // Already determined
      if (probs[r][c].safe) safeCells.push([r, c]);
    }
  }

  // Recommendation: among uncertain cells that could be 2 or 3,
  // find the one with lowest bomb probability.
  // If no 2/3 cells are uncertain, recommend safest overall.
  let recommendation = null;
  let bestScore = -1;

  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      if (known[r][c] !== null) continue;
      if (possible[r][c].size <= 1) continue;

      const p = probs[r][c];
      const couldBeHigh = p.counts[2] > 0 || p.counts[3] > 0;
      const safety = 1 - p.bombProb;

      // Priority: safe cells that could be 2/3 > safe cells > risky cells with high value
      let score;
      if (p.safe && couldBeHigh) {
        score = 1000 + (p.counts[2] + p.counts[3]) / p.total; // Best: safe + high value
      } else if (p.safe) {
        score = 500; // Safe but only 1s
      } else if (couldBeHigh) {
        score = safety * 100 + (p.counts[2] + p.counts[3]) / p.total; // Risky but rewarding
      } else {
        score = safety * 10; // Only 0s and 1s possible, low priority
      }

      if (score > bestScore) {
        bestScore = score;
        recommendation = [r, c];
      }
    }
  }

  const isUnique = solutions.length === 1;

  return { possible, probs, solutions, safeCells, recommendation, isUnique, error: null };
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

function GridCell({ opts, revealed, delay, isRecommended, isSafe, isKnown, knownValue, onFlip }) {
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

  // Uncertain cell — clickable
  const cs = CSTYLE["?"];
  const highlight = isRecommended ? "#FFD700" : isSafe ? "#00FF88" : null;
  return (
    <div className="grid-cell" onClick={onFlip} style={{
      background: highlight ? (isRecommended ? "#1A6A4A" : "#1A5A4A") : cs.bg,
      border: `2px solid ${highlight || cs.border}`,
      borderRadius: 3, position: "relative",
      display: "flex", alignItems: "center", justifyContent: "center",
      boxShadow: highlight
        ? `0 0 8px ${highlight}88, inset 0 0 4px ${highlight}44`
        : "inset 0 1px 2px rgba(0,0,0,0.1)",
      cursor: "pointer",
      opacity: revealed ? 1 : 0,
      transform: revealed ? "scale(1)" : "scale(0.3)",
      transition: `opacity 0.32s ${delay}ms, transform 0.32s ${delay}ms`,
      animation: isRecommended ? "pulse 1.5s ease-in-out infinite" : "none",
    }}>
      <span style={{
        fontFamily: "'Press Start 2P', monospace", fontSize: 11,
        color: highlight || cs.text,
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
      {isSafe && !isRecommended && (
        <div style={{
          position: "absolute", top: -2, left: -2,
          fontFamily: "'Press Start 2P', monospace", fontSize: 6,
          color: "#00FF88", textShadow: "0 0 4px #00FF8888",
        }}>✓</div>
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

function HintPanel({ value, onChange, colorIndex, ptsActive, bombsActive, onPtsFocus, onBombsFocus }) {
  const c = HINT_COLORS[colorIndex % 5];
  return (
    <div className="hint-panel" style={{
      background: c.bg, border: `2px solid ${ptsActive || bombsActive ? "#FFD700" : c.border}`,
      borderRadius: 3, display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      padding: "2px 0", gap: 0,
      boxShadow: (ptsActive || bombsActive)
        ? "0 0 8px #FFD70088, inset 0 1px 0 rgba(255,255,255,0.3)"
        : "inset 0 1px 0 rgba(255,255,255,0.3), 0 1px 2px rgba(0,0,0,0.2)",
    }}>
      <input
        type="number" min="0" max="15" inputMode="numeric"
        value={value.pts} placeholder="00"
        onChange={(e) => onChange({ ...value, pts: e.target.value })}
        onFocus={onPtsFocus}
        style={{
          width: "100%", border: "none",
          background: ptsActive ? "rgba(255,215,0,0.2)" : "transparent",
          fontFamily: "'Press Start 2P', monospace", fontSize: 11,
          color: c.label, textAlign: "center", outline: "none",
          padding: "1px 0", textShadow: "0 1px 1px rgba(0,0,0,0.4)",
          borderRadius: "2px 2px 0 0",
        }}
      />
      <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
        <VoltorbSmall />
        <input
          type="number" min="0" max="5" inputMode="numeric"
          value={value.bombs} placeholder="0"
          onChange={(e) => onChange({ ...value, bombs: e.target.value })}
          onFocus={onBombsFocus}
          style={{
            width: 18, border: "none",
            background: bombsActive ? "rgba(255,215,0,0.2)" : "transparent",
            fontFamily: "'Press Start 2P', monospace", fontSize: 10,
            color: c.label, textAlign: "center", outline: "none",
            padding: 0, textShadow: "0 1px 1px rgba(0,0,0,0.4)",
            borderRadius: 2,
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
  const [quickEntry, setQuickEntry] = useState(false);
  const [qeIndex, setQeIndex] = useState(0); // 0-19: which field is active

  // Quick entry: 20 fields total
  // 0-9: row hints (R1pts, R1bombs, R2pts, R2bombs, ..., R5pts, R5bombs)
  // 10-19: col hints (C1pts, C1bombs, ..., C5pts, C5bombs)
  const getQeLabel = (idx) => {
    if (idx < 10) {
      const row = Math.floor(idx / 2) + 1;
      const field = idx % 2 === 0 ? "PTS" : "BMB";
      return `R${row} ${field}`;
    } else {
      const col = Math.floor((idx - 10) / 2) + 1;
      const field = idx % 2 === 0 ? "PTS" : "BMB";
      return `C${col} ${field}`;
    }
  };

  const getQeValue = () => {
    if (qeIndex < 10) {
      const rowIdx = Math.floor(qeIndex / 2);
      return qeIndex % 2 === 0 ? rowH[rowIdx].pts : rowH[rowIdx].bombs;
    } else {
      const colIdx = Math.floor((qeIndex - 10) / 2);
      return qeIndex % 2 === 0 ? colH[colIdx].pts : colH[colIdx].bombs;
    }
  };

  const setQeValue = (val) => {
    if (qeIndex < 10) {
      const rowIdx = Math.floor(qeIndex / 2);
      const field = qeIndex % 2 === 0 ? "pts" : "bombs";
      const newRow = [...rowH];
      newRow[rowIdx] = { ...newRow[rowIdx], [field]: val };
      setRowH(newRow);
    } else {
      const colIdx = Math.floor((qeIndex - 10) / 2);
      const field = qeIndex % 2 === 0 ? "pts" : "bombs";
      const newCol = [...colH];
      newCol[colIdx] = { ...newCol[colIdx], [field]: val };
      setColH(newCol);
    }
  };

  // Handle numpad digit tap
  const handleNumpadTap = (digit) => {
    const isBombs = qeIndex % 2 === 1;
    const current = getQeValue();

    if (isBombs) {
      // Single digit for bombs — set and advance
      setQeValue(String(digit));
      advanceQe();
    } else {
      // Up to 2 digits for pts
      if (current.length < 2) {
        const newVal = current + String(digit);
        setQeValue(newVal);
        // Auto-advance if 2 digits or if first digit > 1 (can't be part of valid 2-digit ≤15)
        if (newVal.length === 2 || digit > 1) {
          // Small delay so the value renders before advancing
          setTimeout(() => advanceQe(), 100);
        }
      }
    }
  };

  const handleNumpadBack = () => {
    const current = getQeValue();
    if (current.length > 0) {
      setQeValue(current.slice(0, -1));
    } else if (qeIndex > 0) {
      setQeIndex(qeIndex - 1);
    }
  };

  const handleNumpadNext = () => {
    advanceQe();
  };

  const advanceQe = () => {
    if (qeIndex < 19) {
      setQeIndex(qeIndex + 1);
    } else {
      setQuickEntry(false);
    }
  };

  const startQuickEntry = () => {
    setQuickEntry(true);
    setQeIndex(0);
  };

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
      if (res.error) throw new Error(res.error);
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

  // Recommendation comes from the solver now
  const recommendation = result?.recommendation || null;

  const flipCount = result ? result.possible.flat().filter((s) => s.size === 1 && ([...s][0] === 2 || [...s][0] === 3)).length : 0;
  const bombCount = result ? result.possible.flat().filter((s) => s.size === 1 && [...s][0] === 0).length : 0;
  const unsureCount = result ? result.possible.flat().filter((s) => s.size > 1).length : 0;
  const safeCount = result?.safeCells?.length || 0;
  const solutionCount = result?.solutions?.length || 0;
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
              const isSafe = result?.safeCells?.some(([sr, sc]) => sr === r && sc === c);

              if (!result) return <CardCell key={c} />;

              return (
                <GridCell
                  key={c}
                  opts={result.possible[r][c]}
                  revealed={revealed}
                  delay={(r * N + c) * 28}
                  isRecommended={isRec}
                  isSafe={isSafe && !isRec}
                  isKnown={isKnownCell}
                  knownValue={known[r][c]}
                  onFlip={() => {
                    if (!isKnownCell && result.possible[r][c].size > 1) {
                      setFlipPicker({ r, c });
                    }
                  }}
                />
              );
            })}
            <HintPanel value={rowH[r]} colorIndex={r}
              onChange={(v) => { const n = [...rowH]; n[r] = v; setRowH(n); }}
              ptsActive={quickEntry && qeIndex === r * 2}
              bombsActive={quickEntry && qeIndex === r * 2 + 1}
              onPtsFocus={() => { if (quickEntry) setQeIndex(r * 2); }}
              onBombsFocus={() => { if (quickEntry) setQeIndex(r * 2 + 1); }}
            />
          </div>
        ))}

        {/* Column hints */}
        <div style={{ display: "flex", gap: 3 }}>
          {colH.map((h, c) => (
            <HintPanel key={c} value={h} colorIndex={c}
              onChange={(v) => { const n = [...colH]; n[c] = v; setColH(n); }}
              ptsActive={quickEntry && qeIndex === 10 + c * 2}
              bombsActive={quickEntry && qeIndex === 10 + c * 2 + 1}
              onPtsFocus={() => { if (quickEntry) setQeIndex(10 + c * 2); }}
              onBombsFocus={() => { if (quickEntry) setQeIndex(10 + c * 2 + 1); }}
            />
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
              }}>{result.isUnique ? "✓ SOLVED" : `${solutionCount} SOLUTIONS`}</span>
              <div style={{ display: "flex", gap: 6 }}>
                {safeCount > 0 && <span style={{ fontFamily: "'Press Start 2P',monospace", fontSize: 7, color: "#208848" }}>✓{safeCount}safe</span>}
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
        {result && !result.isUnique && (recommendation || safeCount > 0) && (
          <div style={{
            marginTop: 6, padding: "6px 10px",
            background: "#1A5A3A", borderRadius: 4,
            border: "1px solid #FFD70044",
          }}>
            {safeCount > 0 ? (
              <span style={{
                fontFamily: "'Press Start 2P',monospace", fontSize: 7, color: "#00FF88",
              }}>✓ {safeCount} SAFE CELL{safeCount > 1 ? "S" : ""} — TAP TO FLIP</span>
            ) : recommendation ? (
              <span style={{
                fontFamily: "'Press Start 2P',monospace", fontSize: 7, color: "#FFD700",
              }}>★ BEST GUESS: {result.probs ? `${Math.round((1 - result.probs[recommendation[0]][recommendation[1]].bombProb) * 100)}% safe` : "TAP GOLD CELL"}</span>
            ) : null}
            {knownCount > 0 && (
              <span style={{
                fontFamily: "'Press Start 2P',monospace", fontSize: 6, color: "#A0E8C0",
                display: "block", marginTop: 3,
              }}>{knownCount} flipped</span>
            )}
          </div>
        )}

        {/* ═══ QUICK ENTRY ═══ */}
        {quickEntry && (
          <div style={{
            marginTop: 8, padding: "8px 10px",
            background: "#1A5A3A", borderRadius: 4,
            border: "2px solid #FFD70066",
          }}>
            {/* Current field label + value display */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{
                fontFamily: "'Press Start 2P', monospace", fontSize: 8, color: "#FFD700",
              }}>{getQeLabel(qeIndex)}</span>
              <div style={{
                fontFamily: "'Press Start 2P', monospace", fontSize: 18, color: "#FFF",
                background: "#0A3A2A", border: "2px solid #FFD700",
                borderRadius: 4, padding: "4px 12px", minWidth: 44, textAlign: "center",
              }}>
                {getQeValue() || "_"}
              </div>
              <span style={{
                fontFamily: "'Press Start 2P', monospace", fontSize: 6, color: "#A0E8C0",
              }}>{qeIndex + 1}/20</span>
            </div>

            {/* Custom numpad */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 4 }}>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map((d) => (
                <button key={d} onClick={() => handleNumpadTap(d)} style={{
                  height: 40, borderRadius: 4,
                  fontFamily: "'Press Start 2P', monospace", fontSize: 12,
                  color: "#FFF", background: "#2A7A5A",
                  border: "2px solid #1A5A3A", cursor: "pointer",
                  boxShadow: "0 2px 0 #1A4A3A",
                  transition: "transform 0.05s",
                }}
                  onTouchStart={(e) => { e.currentTarget.style.transform = "translateY(2px)"; e.currentTarget.style.boxShadow = "none"; }}
                  onTouchEnd={(e) => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = "0 2px 0 #1A4A3A"; }}
                  onMouseDown={(e) => { e.currentTarget.style.transform = "translateY(2px)"; e.currentTarget.style.boxShadow = "none"; }}
                  onMouseUp={(e) => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = "0 2px 0 #1A4A3A"; }}
                >{d}</button>
              ))}
              {/* Back button */}
              <button onClick={handleNumpadBack} style={{
                height: 40, borderRadius: 4,
                fontFamily: "'Press Start 2P', monospace", fontSize: 9,
                color: "#FF8888", background: "#2A4A3A",
                border: "2px solid #1A3A2A", cursor: "pointer",
                boxShadow: "0 2px 0 #0A2A1A",
              }}
                onTouchStart={(e) => { e.currentTarget.style.transform = "translateY(2px)"; }}
                onTouchEnd={(e) => { e.currentTarget.style.transform = ""; }}
                onMouseDown={(e) => { e.currentTarget.style.transform = "translateY(2px)"; }}
                onMouseUp={(e) => { e.currentTarget.style.transform = ""; }}
              >◄ DEL</button>
              {/* Next button */}
              <button onClick={handleNumpadNext} style={{
                height: 40, borderRadius: 4,
                fontFamily: "'Press Start 2P', monospace", fontSize: 9,
                color: "#FFD700", background: "#2A4A3A",
                border: "2px solid #FFD70044", cursor: "pointer",
                boxShadow: "0 2px 0 #0A2A1A",
              }}
                onTouchStart={(e) => { e.currentTarget.style.transform = "translateY(2px)"; }}
                onTouchEnd={(e) => { e.currentTarget.style.transform = ""; }}
                onMouseDown={(e) => { e.currentTarget.style.transform = "translateY(2px)"; }}
                onMouseUp={(e) => { e.currentTarget.style.transform = ""; }}
              >NEXT ►</button>
            </div>

            {/* Close button */}
            <div style={{ display: "flex", justifyContent: "center", marginTop: 6 }}>
              <button onClick={() => setQuickEntry(false)} style={{
                fontFamily: "'Press Start 2P', monospace", fontSize: 7,
                color: "#A0E8C0", background: "transparent",
                border: "1px solid #A0E8C044", borderRadius: 4,
                padding: "5px 12px", cursor: "pointer",
              }}>DONE</button>
            </div>
          </div>
        )}

        {/* ═══ BUTTONS ═══ */}
        <div style={{ display: "flex", gap: 8, marginTop: 10, justifyContent: "center", flexWrap: "wrap" }}>
          <GameBtn label="SOLVE" variant="primary" onClick={handleSolve} />
          {!quickEntry && <GameBtn label="QUICK" variant="gold" onClick={startQuickEntry} />}
          <GameBtn label="DEMO" variant="secondary" onClick={loadDemo} />
          <GameBtn label="CLEAR" variant="danger" onClick={clearAll} />
        </div>

        {/* ═══ PHOTO CAPTURE ═══ */}
        <PhotoCapture onHintsDetected={handlePhotoHints} />

      </div>
    </div>
  );
}
