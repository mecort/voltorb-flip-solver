import { describe, it, expect } from "vitest";
import { runSolver, applyHeuristics, enumerateSolutions, computeProbabilities } from "./solver";

// Helper: create empty 5x5 known grid
const emptyKnown = () => Array.from({ length: 5 }, () => Array(5).fill(null));

describe("Solver Engine", () => {

  describe("runSolver — basic cases", () => {

    it("returns error for impossible hints", () => {
      // Row sums add to more than column sums allow
      const rh = [[15, 0], [15, 0], [15, 0], [15, 0], [15, 0]]; // 75 total
      const ch = [[1, 0], [1, 0], [1, 0], [1, 0], [1, 0]]; // 5 total — impossible
      const result = runSolver(rh, ch, emptyKnown());
      expect(result.error).toBeTruthy();
      expect(result.solutions.length).toBe(0);
    });

    it("solves a board with unique solution (all 1s, no bombs)", () => {
      // 5 points per row/col, 0 bombs each — every cell must be 1
      const rh = [[5, 0], [5, 0], [5, 0], [5, 0], [5, 0]];
      const ch = [[5, 0], [5, 0], [5, 0], [5, 0], [5, 0]];
      const result = runSolver(rh, ch, emptyKnown());

      expect(result.error).toBeNull();
      expect(result.isUnique).toBe(true);
      expect(result.solutions.length).toBe(1);

      // Every cell should be 1
      const board = result.solutions[0];
      for (let r = 0; r < 5; r++) {
        for (let c = 0; c < 5; c++) {
          expect(board[r][c]).toBe(1);
        }
      }
    });

    it("solves a board where all cells are bombs", () => {
      // 0 points, 5 bombs per row/col
      const rh = [[0, 5], [0, 5], [0, 5], [0, 5], [0, 5]];
      const ch = [[0, 5], [0, 5], [0, 5], [0, 5], [0, 5]];
      const result = runSolver(rh, ch, emptyKnown());

      expect(result.error).toBeNull();
      expect(result.isUnique).toBe(true);
      const board = result.solutions[0];
      for (let r = 0; r < 5; r++) {
        for (let c = 0; c < 5; c++) {
          expect(board[r][c]).toBe(0);
        }
      }
    });

    it("finds multiple solutions for ambiguous board", () => {
      // From the game: typical level 1 board
      const rh = [[3, 2], [5, 1], [5, 2], [4, 1], [8, 0]];
      const ch = [[5, 0], [5, 2], [4, 1], [3, 3], [8, 0]];
      const result = runSolver(rh, ch, emptyKnown());

      expect(result.error).toBeNull();
      expect(result.solutions.length).toBeGreaterThan(0);
      // Verify every solution satisfies row/col constraints
      for (const board of result.solutions) {
        for (let r = 0; r < 5; r++) {
          const rowSum = board[r].reduce((a, b) => a + b, 0);
          const rowBombs = board[r].filter(v => v === 0).length;
          expect(rowSum).toBe(rh[r][0]);
          expect(rowBombs).toBe(rh[r][1]);
        }
        for (let c = 0; c < 5; c++) {
          const col = board.map(row => row[c]);
          const colSum = col.reduce((a, b) => a + b, 0);
          const colBombs = col.filter(v => v === 0).length;
          expect(colSum).toBe(ch[c][0]);
          expect(colBombs).toBe(ch[c][1]);
        }
      }
    });
  });

  describe("runSolver — with known cells", () => {

    it("respects known cell values", () => {
      const rh = [[5, 0], [5, 0], [5, 0], [5, 0], [5, 0]];
      const ch = [[5, 0], [5, 0], [5, 0], [5, 0], [5, 0]];
      const known = emptyKnown();
      known[0][0] = 1; // Pin one cell

      const result = runSolver(rh, ch, known);
      expect(result.error).toBeNull();

      // All solutions must have 1 at [0][0]
      for (const board of result.solutions) {
        expect(board[0][0]).toBe(1);
      }
    });

    it("detects contradiction when known cell conflicts with hints", () => {
      // All cells must be 1 (5 pts, 0 bombs), but we pin [0][0] = 3
      const rh = [[5, 0], [5, 0], [5, 0], [5, 0], [5, 0]];
      const ch = [[5, 0], [5, 0], [5, 0], [5, 0], [5, 0]];
      const known = emptyKnown();
      known[0][0] = 3; // Impossible: row 0 sums to 5 but this alone is 3

      const result = runSolver(rh, ch, known);
      expect(result.error).toBeTruthy();
    });

    it("narrows solutions when cells are revealed", () => {
      const rh = [[3, 2], [5, 1], [5, 2], [4, 1], [8, 0]];
      const ch = [[5, 0], [5, 2], [4, 1], [3, 3], [8, 0]];

      // Solve without known
      const res1 = runSolver(rh, ch, emptyKnown());
      expect(res1.solutions.length).toBeGreaterThan(1);

      // Reveal a cell and re-solve — should have fewer solutions
      const known = emptyKnown();
      known[0][0] = res1.solutions[0][0][0]; // Use value from first solution
      const res2 = runSolver(rh, ch, known);

      expect(res2.error).toBeNull();
      expect(res2.solutions.length).toBeLessThanOrEqual(res1.solutions.length);
      // All solutions must have the known value
      for (const board of res2.solutions) {
        expect(board[0][0]).toBe(known[0][0]);
      }
    });
  });

  describe("Heuristics", () => {

    it("H3: removes 0 when row has no remaining bombs", () => {
      const rh = [[5, 0], [5, 0], [5, 0], [5, 0], [5, 0]];
      const ch = [[5, 0], [5, 0], [5, 0], [5, 0], [5, 0]];
      const known = emptyKnown();
      const possible = Array.from({ length: 5 }, () =>
        Array.from({ length: 5 }, () => new Set([0, 1, 2, 3]))
      );

      applyHeuristics(possible, rh, ch, known);

      // No cell should have 0 in its possible set (0 bombs in every row/col)
      for (let r = 0; r < 5; r++) {
        for (let c = 0; c < 5; c++) {
          expect(possible[r][c].has(0)).toBe(false);
        }
      }
    });

    it("H2: marks all remaining as bombs when needed", () => {
      // Row 0: 0 points, 5 bombs — all must be 0
      const rh = [[0, 5], [5, 0], [5, 0], [5, 0], [5, 0]];
      const ch = [[4, 1], [4, 1], [4, 1], [4, 1], [4, 1]];
      const known = emptyKnown();
      const possible = Array.from({ length: 5 }, () =>
        Array.from({ length: 5 }, () => new Set([0, 1, 2, 3]))
      );

      applyHeuristics(possible, rh, ch, known);

      // Row 0 should all be {0}
      for (let c = 0; c < 5; c++) {
        expect([...possible[0][c]]).toEqual([0]);
      }
    });

    it("H1: marks cells as 0 or 1 when remaining pts equals remaining non-bomb cells", () => {
      // Row: 3 pts, 2 bombs → 3 non-bomb cells contribute 3 pts → each must be 1
      const rh = [[3, 2], [5, 0], [5, 0], [5, 0], [5, 0]];
      const ch = [[4, 1], [4, 1], [4, 0], [4, 0], [4, 0]]; // rough hints
      const known = emptyKnown();
      const possible = Array.from({ length: 5 }, () =>
        Array.from({ length: 5 }, () => new Set([0, 1, 2, 3]))
      );

      applyHeuristics(possible, rh, ch, known);

      // Row 0 cells should only have {0, 1} (since 3 pts / 3 non-bomb cells = 1 each)
      for (let c = 0; c < 5; c++) {
        expect(possible[0][c].has(2)).toBe(false);
        expect(possible[0][c].has(3)).toBe(false);
      }
    });
  });

  describe("Probabilities and recommendations", () => {

    it("computes correct bomb probability", () => {
      // Simple case: 2 solutions, cell is bomb in one
      const solutions = [
        [[0, 1, 1, 1, 1], [1, 1, 1, 1, 1], [1, 1, 1, 1, 1], [1, 1, 1, 1, 1], [1, 1, 1, 1, 1]],
        [[1, 1, 1, 1, 0], [1, 1, 1, 1, 1], [1, 1, 1, 1, 1], [1, 1, 1, 1, 1], [1, 1, 1, 1, 1]],
      ];
      const probs = computeProbabilities(solutions);

      expect(probs[0][0].bombProb).toBe(0.5); // Bomb in 1 of 2 solutions
      expect(probs[0][4].bombProb).toBe(0.5);
      expect(probs[0][2].bombProb).toBe(0); // Never a bomb
      expect(probs[0][2].safe).toBe(true);
    });

    it("identifies safe cells correctly", () => {
      const rh = [[3, 2], [5, 1], [5, 2], [4, 1], [8, 0]];
      const ch = [[5, 0], [5, 2], [4, 1], [3, 3], [8, 0]];
      const result = runSolver(rh, ch, emptyKnown());

      expect(result.error).toBeNull();

      // Safe cells should never be bombs in any solution
      for (const [r, c] of result.safeCells) {
        expect(result.probs[r][c].bombProb).toBe(0);
        expect(result.probs[r][c].safe).toBe(true);
      }
    });

    it("recommends safe cells with high value potential first", () => {
      const rh = [[3, 2], [5, 1], [5, 2], [4, 1], [8, 0]];
      const ch = [[5, 0], [5, 2], [4, 1], [3, 3], [8, 0]];
      const result = runSolver(rh, ch, emptyKnown());

      if (result.recommendation && result.safeCells.length > 0) {
        const [rr, rc] = result.recommendation;
        // Recommendation should be a safe cell if any safe cells exist
        const recIsSafe = result.probs[rr][rc].safe;
        if (result.safeCells.some(([sr, sc]) => {
          const p = result.probs[sr][sc];
          return p.counts[2] > 0 || p.counts[3] > 0;
        })) {
          // If there are safe cells with high value, rec should be one of them
          expect(recIsSafe).toBe(true);
        }
      }
    });

    it("row 5 with 0 bombs and 8 pts: col 5 cells in that row are all safe", () => {
      // Row 5 (index 4) has 0 bombs → no cell in that row can be a bomb
      const rh = [[3, 2], [5, 1], [5, 2], [4, 1], [8, 0]];
      const ch = [[5, 0], [5, 2], [4, 1], [3, 3], [8, 0]];
      const result = runSolver(rh, ch, emptyKnown());

      expect(result.error).toBeNull();
      // Row 4 has 0 bombs — every cell in row 4 should have bombProb = 0
      for (let c = 0; c < 5; c++) {
        expect(result.probs[4][c].bombProb).toBe(0);
      }
    });
  });

  describe("Solution validity", () => {

    it("all enumerated solutions satisfy row and column constraints", () => {
      const rh = [[5, 1], [3, 2], [5, 1], [4, 1], [8, 1]];
      const ch = [[5, 1], [5, 1], [5, 1], [4, 2], [6, 1]];
      const result = runSolver(rh, ch, emptyKnown());

      if (result.error) return; // Skip if no solutions

      for (const board of result.solutions) {
        for (let r = 0; r < 5; r++) {
          const rowSum = board[r].reduce((a, b) => a + b, 0);
          const rowBombs = board[r].filter(v => v === 0).length;
          expect(rowSum).toBe(rh[r][0]);
          expect(rowBombs).toBe(rh[r][1]);
        }
        for (let c = 0; c < 5; c++) {
          const col = board.map(row => row[c]);
          expect(col.reduce((a, b) => a + b, 0)).toBe(ch[c][0]);
          expect(col.filter(v => v === 0).length).toBe(ch[c][1]);
        }
      }
    });

    it("all cell values are 0, 1, 2, or 3", () => {
      const rh = [[5, 1], [3, 2], [5, 1], [4, 1], [8, 1]];
      const ch = [[5, 1], [5, 1], [5, 1], [4, 2], [6, 1]];
      const result = runSolver(rh, ch, emptyKnown());

      if (result.error) return;

      for (const board of result.solutions) {
        for (let r = 0; r < 5; r++) {
          for (let c = 0; c < 5; c++) {
            expect([0, 1, 2, 3]).toContain(board[r][c]);
          }
        }
      }
    });
  });

  describe("Edge cases", () => {

    it("handles a board with maximum bombs (20)", () => {
      // 4 bombs per row, 4 per col, minimal points
      const rh = [[1, 4], [1, 4], [1, 4], [1, 4], [1, 4]];
      const ch = [[1, 4], [1, 4], [1, 4], [1, 4], [1, 4]];
      const result = runSolver(rh, ch, emptyKnown());

      expect(result.error).toBeNull();
      expect(result.solutions.length).toBeGreaterThan(0);

      // Each solution should have exactly 20 bombs and 5 non-zero cells
      for (const board of result.solutions) {
        const totalBombs = board.flat().filter(v => v === 0).length;
        expect(totalBombs).toBe(20);
      }
    });

    it("handles high-value board (all 3s, no bombs)", () => {
      const rh = [[15, 0], [15, 0], [15, 0], [15, 0], [15, 0]];
      const ch = [[15, 0], [15, 0], [15, 0], [15, 0], [15, 0]];
      const result = runSolver(rh, ch, emptyKnown());

      expect(result.error).toBeNull();
      expect(result.isUnique).toBe(true);
      expect(result.solutions[0].flat().every(v => v === 3)).toBe(true);
    });

    it("handles mixed board from screenshot example", () => {
      // From the wikihow screenshot: R:03/2, 05/1, 05/2, 04/1, 08/0  C:05/0, 05/2, 04/1, 03/3, 08/0
      const rh = [[3, 2], [5, 1], [5, 2], [4, 1], [8, 0]];
      const ch = [[5, 0], [5, 2], [4, 1], [3, 3], [8, 0]];
      const result = runSolver(rh, ch, emptyKnown());

      expect(result.error).toBeNull();
      expect(result.solutions.length).toBeGreaterThan(0);
      expect(result.probs).not.toBeNull();

      // Column 0 has 0 bombs → all cells in col 0 are safe
      for (let r = 0; r < 5; r++) {
        expect(result.probs[r][0].bombProb).toBe(0);
      }
      // Column 4 has 0 bombs → all cells in col 4 are safe
      for (let r = 0; r < 5; r++) {
        expect(result.probs[r][4].bombProb).toBe(0);
      }
      // Row 4 has 0 bombs → all cells in row 4 are safe
      for (let c = 0; c < 5; c++) {
        expect(result.probs[4][c].bombProb).toBe(0);
      }
    });
  });
});
