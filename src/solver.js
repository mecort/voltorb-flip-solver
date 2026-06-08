/* ═══════════════════════════════════════════════════════
   VOLTORB FLIP SOLVER ENGINE
   
   Heuristic + Exhaustive Enumeration approach.
   Exported for use in App and tests.
═══════════════════════════════════════════════════════ */

export function applyHeuristics(possible, rh, ch, known) {
  let changed = true;
  let iterations = 0;

  while (changed && iterations < 20) {
    changed = false;
    iterations++;

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

      if (remainBombs === remainCells && remainPts === 0) {
        for (const c of unknownIndices) {
          if (possible[r][c].size !== 1 || [...possible[r][c]][0] !== 0) {
            possible[r][c] = new Set([0]);
            changed = true;
          }
        }
        continue;
      }

      if (remainBombs === 0) {
        for (const c of unknownIndices) {
          if (possible[r][c].has(0)) { possible[r][c].delete(0); changed = true; }
        }
      }

      const nonBombCells = remainCells - remainBombs;
      if (nonBombCells > 0 && remainPts === nonBombCells) {
        for (const c of unknownIndices) {
          const prev = possible[r][c].size;
          const newSet = new Set();
          if (possible[r][c].has(0) && remainBombs > 0) newSet.add(0);
          if (possible[r][c].has(1)) newSet.add(1);
          if (newSet.size > 0 && newSet.size < prev) { possible[r][c] = newSet; changed = true; }
        }
      }

      if (nonBombCells > 0 && remainPts === nonBombCells * 3) {
        for (const c of unknownIndices) {
          const newSet = new Set();
          if (possible[r][c].has(0) && remainBombs > 0) newSet.add(0);
          if (possible[r][c].has(3)) newSet.add(3);
          if (newSet.size > 0 && newSet.size < possible[r][c].size) { possible[r][c] = newSet; changed = true; }
        }
      }

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

export function enumerateSolutions(possible, rh, ch, known, maxSolutions = 5000) {
  const solutions = [];

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

    let combos = [[]];
    for (let c = 0; c < 5; c++) {
      const next = [];
      for (const partial of combos) {
        for (const val of cells[c]) {
          next.push([...partial, val]);
        }
      }
      combos = next;
      combos = combos.filter(combo => {
        const bombs = combo.filter(v => v === 0).length;
        const sum = combo.reduce((a, b) => a + b, 0);
        return bombs <= targetBombs && sum <= targetSum;
      });
    }

    return combos.filter(combo => {
      const bombs = combo.filter(v => v === 0).length;
      const sum = combo.reduce((a, b) => a + b, 0);
      return bombs === targetBombs && sum === targetSum;
    });
  }

  const rowCombos = [];
  for (let r = 0; r < 5; r++) {
    const combos = getRowCombos(r);
    if (combos.length === 0) return [];
    rowCombos.push(combos);
  }

  function search(r, board) {
    if (solutions.length >= maxSolutions) return;

    if (r === 5) {
      for (let c = 0; c < 5; c++) {
        const col = board.map(row => row[c]);
        const sum = col.reduce((a, b) => a + b, 0);
        const bombs = col.filter(v => v === 0).length;
        if (sum !== ch[c][0] || bombs !== ch[c][1]) return;
      }
      solutions.push(board.map(row => [...row]));
      return;
    }

    for (const combo of rowCombos[r]) {
      let valid = true;
      for (let c = 0; c < 5; c++) {
        const colSoFar = board.slice(0, r).map(row => row[c]);
        colSoFar.push(combo[c]);
        const partialSum = colSoFar.reduce((a, b) => a + b, 0);
        const partialBombs = colSoFar.filter(v => v === 0).length;
        if (partialSum > ch[c][0] || partialBombs > ch[c][1]) { valid = false; break; }
        const remainRows = 5 - r - 1;
        if (partialBombs + remainRows < ch[c][1]) { valid = false; break; }
        const maxRemainPts = remainRows * 3;
        if (partialSum + maxRemainPts < ch[c][0]) { valid = false; break; }
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

export function computeProbabilities(solutions) {
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

  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      const p = probs[r][c];
      p.bombProb = p.total > 0 ? p.counts[0] / p.total : 0;
      p.safe = p.counts[0] === 0;
    }
  }

  return probs;
}

export function runSolver(rh, ch, known) {
  const possible = Array.from({ length: 5 }, (_, r) =>
    Array.from({ length: 5 }, (_, c) =>
      known[r][c] !== null ? new Set([known[r][c]]) : new Set([0, 1, 2, 3])
    )
  );

  applyHeuristics(possible, rh, ch, known);

  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      if (possible[r][c].size === 0) {
        return { possible, probs: null, solutions: [], error: "No valid solution — check your hints" };
      }
    }
  }

  const solutions = enumerateSolutions(possible, rh, ch, known);

  if (solutions.length === 0) {
    return { possible, probs: null, solutions: [], error: "No valid solution — check your hints" };
  }

  const probs = computeProbabilities(solutions);

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

  const safeCells = [];
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      if (known[r][c] !== null) continue;
      if (possible[r][c].size === 1) continue;
      if (probs[r][c].safe) safeCells.push([r, c]);
    }
  }

  let recommendation = null;
  let bestScore = -1;

  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      if (known[r][c] !== null) continue;
      if (possible[r][c].size <= 1) continue;

      const p = probs[r][c];
      const couldBeHigh = p.counts[2] > 0 || p.counts[3] > 0;
      const safety = 1 - p.bombProb;

      let score;
      if (p.safe && couldBeHigh) {
        score = 1000 + (p.counts[2] + p.counts[3]) / p.total;
      } else if (p.safe) {
        score = 500;
      } else if (couldBeHigh) {
        score = safety * 100 + (p.counts[2] + p.counts[3]) / p.total;
      } else {
        score = safety * 10;
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
