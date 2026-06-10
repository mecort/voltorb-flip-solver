import { describe, it, expect } from "vitest";
import { filterNumericWords, findHintPattern } from "./PhotoCapture";

/**
 * These tests validate the pattern-matching logic using simulated OCR output
 * matching what Tesseract would return for real Voltorb Flip screenshots.
 * 
 * We mock the OCR word positions based on the actual layout of the game screenshots.
 */

// Helper: create a word object as Tesseract would return it
function word(text, x, y, w = 20, h = 16) {
  return { text, x, y, w, h, cx: x + w / 2, cy: y + h / 2 };
}

describe("PhotoCapture — filterNumericWords", () => {
  it("filters to only valid numeric words (0-15)", () => {
    const words = [
      word("05", 100, 100),
      word("Hello", 200, 200),
      word("1", 300, 300),
      word("16", 400, 400), // too high
      word("3", 500, 500),
      word("00000", 600, 600), // "00000" → 0, which is valid but 5 chars
      word("Quit", 700, 700),
    ];
    const result = filterNumericWords(words);
    // Should keep "05"→5, "1"→1, "3"→3
    // "16" is > 15 so excluded
    // "00000" → 0 which is ≤15, so included
    expect(result.length).toBe(4);
    expect(result.map(r => r.value)).toContain(5);
    expect(result.map(r => r.value)).toContain(1);
    expect(result.map(r => r.value)).toContain(3);
    expect(result.map(r => r.value)).toContain(0);
  });

  it("handles OCR noise gracefully", () => {
    const words = [
      word("0S", 100, 100), // OCR error: S instead of 5
      word("l2", 200, 200), // OCR error: l instead of 1
      word("05", 300, 300), // Clean
    ];
    const result = filterNumericWords(words);
    // "0S" → cleaned to "0" → 0 (valid)
    // "l2" → cleaned to "2" → 2 (valid)
    // "05" → 5
    expect(result.length).toBe(3);
  });
});

describe("PhotoCapture — findHintPattern", () => {

  /**
   * Screenshot 1: DS portrait mode
   * Expected:
   *   Row hints (right side, top→bottom): 05/1, 03/2, 05/1, 04/1, 08/1
   *   Col hints (bottom, left→right): 05/1, 05/1, 05/1, 04/2, 06/1
   * 
   * Image dimensions: ~480 x 860 (portrait DS)
   * The hint panels are on the right side (~x: 400-450) and bottom (~y: 780-840)
   */
  it("correctly identifies hints from DS portrait screenshot layout", () => {
    const imgW = 480, imgH = 860;

    // Row hints: right side, stacked vertically
    // Each pair: pts number above, bombs number below, at same X
    const rowX = 420; // Right side of image
    const rowStartY = 380; // First row hint starts here
    const rowSpacing = 72; // Vertical spacing between rows

    // Col hints: bottom of image, spread horizontally
    const colY = 800; // Bottom area
    const colStartX = 50;
    const colSpacing = 75;

    const numbers = [
      // Row hint pairs (pts on top, bombs below)
      // Row 1: 05/1
      { text: "05", value: 5, x: rowX, y: rowStartY, w: 22, h: 16, cx: rowX + 11, cy: rowStartY + 8 },
      { text: "1", value: 1, x: rowX + 5, y: rowStartY + 22, w: 12, h: 14, cx: rowX + 11, cy: rowStartY + 29 },
      // Row 2: 03/2
      { text: "03", value: 3, x: rowX, y: rowStartY + rowSpacing, w: 22, h: 16, cx: rowX + 11, cy: rowStartY + rowSpacing + 8 },
      { text: "2", value: 2, x: rowX + 5, y: rowStartY + rowSpacing + 22, w: 12, h: 14, cx: rowX + 11, cy: rowStartY + rowSpacing + 29 },
      // Row 3: 05/1
      { text: "05", value: 5, x: rowX, y: rowStartY + rowSpacing * 2, w: 22, h: 16, cx: rowX + 11, cy: rowStartY + rowSpacing * 2 + 8 },
      { text: "1", value: 1, x: rowX + 5, y: rowStartY + rowSpacing * 2 + 22, w: 12, h: 14, cx: rowX + 11, cy: rowStartY + rowSpacing * 2 + 29 },
      // Row 4: 04/1
      { text: "04", value: 4, x: rowX, y: rowStartY + rowSpacing * 3, w: 22, h: 16, cx: rowX + 11, cy: rowStartY + rowSpacing * 3 + 8 },
      { text: "1", value: 1, x: rowX + 5, y: rowStartY + rowSpacing * 3 + 22, w: 12, h: 14, cx: rowX + 11, cy: rowStartY + rowSpacing * 3 + 29 },
      // Row 5: 08/1
      { text: "08", value: 8, x: rowX, y: rowStartY + rowSpacing * 4, w: 22, h: 16, cx: rowX + 11, cy: rowStartY + rowSpacing * 4 + 8 },
      { text: "1", value: 1, x: rowX + 5, y: rowStartY + rowSpacing * 4 + 22, w: 12, h: 14, cx: rowX + 11, cy: rowStartY + rowSpacing * 4 + 29 },

      // Col hint pairs (pts on top, bombs below)
      // Col 1: 05/1
      { text: "05", value: 5, x: colStartX, y: colY, w: 22, h: 16, cx: colStartX + 11, cy: colY + 8 },
      { text: "1", value: 1, x: colStartX + 5, y: colY + 22, w: 12, h: 14, cx: colStartX + 11, cy: colY + 29 },
      // Col 2: 05/1
      { text: "05", value: 5, x: colStartX + colSpacing, y: colY, w: 22, h: 16, cx: colStartX + colSpacing + 11, cy: colY + 8 },
      { text: "1", value: 1, x: colStartX + colSpacing + 5, y: colY + 22, w: 12, h: 14, cx: colStartX + colSpacing + 11, cy: colY + 29 },
      // Col 3: 05/1
      { text: "05", value: 5, x: colStartX + colSpacing * 2, y: colY, w: 22, h: 16, cx: colStartX + colSpacing * 2 + 11, cy: colY + 8 },
      { text: "1", value: 1, x: colStartX + colSpacing * 2 + 5, y: colY + 22, w: 12, h: 14, cx: colStartX + colSpacing * 2 + 11, cy: colY + 29 },
      // Col 4: 04/2
      { text: "04", value: 4, x: colStartX + colSpacing * 3, y: colY, w: 22, h: 16, cx: colStartX + colSpacing * 3 + 11, cy: colY + 8 },
      { text: "2", value: 2, x: colStartX + colSpacing * 3 + 5, y: colY + 22, w: 12, h: 14, cx: colStartX + colSpacing * 3 + 11, cy: colY + 29 },
      // Col 5: 06/1
      { text: "06", value: 6, x: colStartX + colSpacing * 4, y: colY, w: 22, h: 16, cx: colStartX + colSpacing * 4 + 11, cy: colY + 8 },
      { text: "1", value: 1, x: colStartX + colSpacing * 4 + 5, y: colY + 22, w: 12, h: 14, cx: colStartX + colSpacing * 4 + 11, cy: colY + 29 },

      // Noise: other numbers in the image (scores, level, etc.)
      { text: "00000", value: 0, x: 350, y: 230, w: 80, h: 24, cx: 390, cy: 242 },
      { text: "00000", value: 0, x: 350, y: 300, w: 80, h: 24, cx: 390, cy: 312 },
      { text: "1", value: 1, x: 310, y: 30, w: 14, h: 18, cx: 317, cy: 39 }, // "Lv. 1"
    ];

    const result = findHintPattern(numbers, imgW, imgH);

    expect(result).not.toBeNull();

    // Verify row hints
    expect(result.rowResults).toEqual([
      { pts: "5", bombs: "1" },
      { pts: "3", bombs: "2" },
      { pts: "5", bombs: "1" },
      { pts: "4", bombs: "1" },
      { pts: "8", bombs: "1" },
    ]);

    // Verify col hints
    expect(result.colResults).toEqual([
      { pts: "5", bombs: "1" },
      { pts: "5", bombs: "1" },
      { pts: "5", bombs: "1" },
      { pts: "4", bombs: "2" },
      { pts: "6", bombs: "1" },
    ]);
  });

  /**
   * Screenshot 2: Landscape, partially revealed board
   * Expected:
   *   Row hints (right side, top→bottom): 09/1, 03/2, 03/2, 05/1, 05/1
   *   Col hints (bottom, left→right): 02/3, 05/1, 06/0, 07/1, 05/2
   * 
   * Image dimensions: ~1024 x 768 (landscape)
   */
  it("correctly identifies hints from landscape screenshot layout", () => {
    const imgW = 1024, imgH = 768;

    const rowX = 680; // Right side
    const rowStartY = 50;
    const rowSpacing = 130;

    const colY = 700;
    const colStartX = 60;
    const colSpacing = 130;

    const numbers = [
      // Row hints
      // Row 1: 09/1
      { text: "09", value: 9, x: rowX, y: rowStartY, w: 28, h: 20, cx: rowX + 14, cy: rowStartY + 10 },
      { text: "1", value: 1, x: rowX + 7, y: rowStartY + 28, w: 14, h: 18, cx: rowX + 14, cy: rowStartY + 37 },
      // Row 2: 03/2
      { text: "03", value: 3, x: rowX, y: rowStartY + rowSpacing, w: 28, h: 20, cx: rowX + 14, cy: rowStartY + rowSpacing + 10 },
      { text: "2", value: 2, x: rowX + 7, y: rowStartY + rowSpacing + 28, w: 14, h: 18, cx: rowX + 14, cy: rowStartY + rowSpacing + 37 },
      // Row 3: 03/2
      { text: "03", value: 3, x: rowX, y: rowStartY + rowSpacing * 2, w: 28, h: 20, cx: rowX + 14, cy: rowStartY + rowSpacing * 2 + 10 },
      { text: "2", value: 2, x: rowX + 7, y: rowStartY + rowSpacing * 2 + 28, w: 14, h: 18, cx: rowX + 14, cy: rowStartY + rowSpacing * 2 + 37 },
      // Row 4: 05/1
      { text: "05", value: 5, x: rowX, y: rowStartY + rowSpacing * 3, w: 28, h: 20, cx: rowX + 14, cy: rowStartY + rowSpacing * 3 + 10 },
      { text: "1", value: 1, x: rowX + 7, y: rowStartY + rowSpacing * 3 + 28, w: 14, h: 18, cx: rowX + 14, cy: rowStartY + rowSpacing * 3 + 37 },
      // Row 5: 05/1
      { text: "05", value: 5, x: rowX, y: rowStartY + rowSpacing * 4, w: 28, h: 20, cx: rowX + 14, cy: rowStartY + rowSpacing * 4 + 10 },
      { text: "1", value: 1, x: rowX + 7, y: rowStartY + rowSpacing * 4 + 28, w: 14, h: 18, cx: rowX + 14, cy: rowStartY + rowSpacing * 4 + 37 },

      // Col hints
      // Col 1: 02/3
      { text: "02", value: 2, x: colStartX, y: colY, w: 28, h: 20, cx: colStartX + 14, cy: colY + 10 },
      { text: "3", value: 3, x: colStartX + 7, y: colY + 28, w: 14, h: 18, cx: colStartX + 14, cy: colY + 37 },
      // Col 2: 05/1
      { text: "05", value: 5, x: colStartX + colSpacing, y: colY, w: 28, h: 20, cx: colStartX + colSpacing + 14, cy: colY + 10 },
      { text: "1", value: 1, x: colStartX + colSpacing + 7, y: colY + 28, w: 14, h: 18, cx: colStartX + colSpacing + 14, cy: colY + 37 },
      // Col 3: 06/0
      { text: "06", value: 6, x: colStartX + colSpacing * 2, y: colY, w: 28, h: 20, cx: colStartX + colSpacing * 2 + 14, cy: colY + 10 },
      { text: "0", value: 0, x: colStartX + colSpacing * 2 + 7, y: colY + 28, w: 14, h: 18, cx: colStartX + colSpacing * 2 + 14, cy: colY + 37 },
      // Col 4: 07/1
      { text: "07", value: 7, x: colStartX + colSpacing * 3, y: colY, w: 28, h: 20, cx: colStartX + colSpacing * 3 + 14, cy: colY + 10 },
      { text: "1", value: 1, x: colStartX + colSpacing * 3 + 7, y: colY + 28, w: 14, h: 18, cx: colStartX + colSpacing * 3 + 14, cy: colY + 37 },
      // Col 5: 05/2
      { text: "05", value: 5, x: colStartX + colSpacing * 4, y: colY, w: 28, h: 20, cx: colStartX + colSpacing * 4 + 14, cy: colY + 10 },
      { text: "2", value: 2, x: colStartX + colSpacing * 4 + 7, y: colY + 28, w: 14, h: 18, cx: colStartX + colSpacing * 4 + 14, cy: colY + 37 },

      // Noise: revealed card numbers on the board, "Close Memo", "1 2 3" selector
      { text: "2", value: 2, x: 230, y: 50, w: 20, h: 22, cx: 240, cy: 61 }, // revealed card
      { text: "1", value: 1, x: 230, y: 180, w: 20, h: 22, cx: 240, cy: 191 }, // revealed card
      { text: "1", value: 1, x: 230, y: 310, w: 20, h: 22, cx: 240, cy: 321 }, // revealed card
      { text: "1", value: 1, x: 230, y: 440, w: 20, h: 22, cx: 240, cy: 451 }, // revealed card
      { text: "1", value: 1, x: 230, y: 570, w: 20, h: 22, cx: 240, cy: 581 }, // revealed card
      { text: "1", value: 1, x: 830, y: 200, w: 18, h: 20, cx: 839, cy: 210 }, // memo panel "1"
      { text: "2", value: 2, x: 810, y: 340, w: 18, h: 20, cx: 819, cy: 350 }, // memo panel "2"
      { text: "3", value: 3, x: 870, y: 340, w: 18, h: 20, cx: 879, cy: 350 }, // memo panel "3"
    ];

    const result = findHintPattern(numbers, imgW, imgH);

    expect(result).not.toBeNull();

    // Verify row hints
    expect(result.rowResults).toEqual([
      { pts: "9", bombs: "1" },
      { pts: "3", bombs: "2" },
      { pts: "3", bombs: "2" },
      { pts: "5", bombs: "1" },
      { pts: "5", bombs: "1" },
    ]);

    // Verify col hints
    expect(result.colResults).toEqual([
      { pts: "2", bombs: "3" },
      { pts: "5", bombs: "1" },
      { pts: "6", bombs: "0" },
      { pts: "7", bombs: "1" },
      { pts: "5", bombs: "2" },
    ]);
  });

  it("returns null when not enough numbers are found", () => {
    const numbers = [
      { text: "5", value: 5, x: 100, y: 100, w: 10, h: 10, cx: 105, cy: 105 },
      { text: "3", value: 3, x: 100, y: 120, w: 10, h: 10, cx: 105, cy: 125 },
    ];
    const result = findHintPattern(numbers, 500, 500);
    expect(result).toBeNull();
  });

  it("ignores scattered numbers that don't form valid pairs", () => {
    // Numbers spread out randomly — no two form a valid pair
    const numbers = [
      { text: "5", value: 5, x: 100, y: 100, w: 10, h: 10, cx: 105, cy: 105 },
      { text: "3", value: 3, x: 300, y: 300, w: 10, h: 10, cx: 305, cy: 305 },
      { text: "7", value: 7, x: 500, y: 100, w: 10, h: 10, cx: 505, cy: 105 },
      { text: "2", value: 2, x: 100, y: 500, w: 10, h: 10, cx: 105, cy: 505 },
      { text: "4", value: 4, x: 400, y: 400, w: 10, h: 10, cx: 405, cy: 405 },
      { text: "1", value: 1, x: 200, y: 200, w: 10, h: 10, cx: 205, cy: 205 },
      { text: "6", value: 6, x: 450, y: 50, w: 10, h: 10, cx: 455, cy: 55 },
      { text: "8", value: 8, x: 50, y: 450, w: 10, h: 10, cx: 55, cy: 455 },
      { text: "9", value: 9, x: 250, y: 350, w: 10, h: 10, cx: 255, cy: 355 },
      { text: "0", value: 0, x: 350, y: 150, w: 10, h: 10, cx: 355, cy: 155 },
    ];
    const result = findHintPattern(numbers, 600, 600);
    // Should return null since no valid pairs form the expected spatial pattern
    expect(result).toBeNull();
  });

  it("handles duplicate values correctly (multiple 05/1 pairs)", () => {
    // Screenshot 1 has three 05/1 pairs in the columns — should still work
    const imgW = 480, imgH = 860;
    const rowX = 420;
    const colY = 800;

    // 5 row pairs all at same X, different Y
    const numbers = [];
    const rowPts = [5, 5, 5, 5, 5]; // All 05
    const rowBombs = [1, 1, 1, 1, 1]; // All 1

    for (let i = 0; i < 5; i++) {
      const y = 380 + i * 72;
      numbers.push({ text: "05", value: rowPts[i], x: rowX, y, w: 22, h: 16, cx: rowX + 11, cy: y + 8 });
      numbers.push({ text: String(rowBombs[i]), value: rowBombs[i], x: rowX + 5, y: y + 22, w: 12, h: 14, cx: rowX + 11, cy: y + 29 });
    }

    // 5 col pairs all at same Y, different X
    const colPts = [3, 3, 3, 3, 3];
    const colBombs = [2, 2, 2, 2, 2];
    for (let i = 0; i < 5; i++) {
      const x = 50 + i * 75;
      numbers.push({ text: "03", value: colPts[i], x, y: colY, w: 22, h: 16, cx: x + 11, cy: colY + 8 });
      numbers.push({ text: String(colBombs[i]), value: colBombs[i], x: x + 5, y: colY + 22, w: 12, h: 14, cx: x + 11, cy: colY + 29 });
    }

    const result = findHintPattern(numbers, imgW, imgH);
    expect(result).not.toBeNull();
    expect(result.rowResults.length).toBe(5);
    expect(result.colResults.length).toBe(5);
    expect(result.rowResults.every(r => r.pts === "5" && r.bombs === "1")).toBe(true);
    expect(result.colResults.every(r => r.pts === "3" && r.bombs === "2")).toBe(true);
  });
});
