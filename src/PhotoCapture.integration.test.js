import { describe, it, expect } from "vitest";
import { filterNumericWords, findHintPattern } from "./PhotoCapture";

/**
 * Integration tests for the vision API photo capture.
 * 
 * These are skipped by default since they require:
 * 1. A running Vercel dev server with GEMINI_API_KEY configured
 * 2. Real API calls (costs money, needs network)
 * 
 * To run locally:
 * 1. Set GEMINI_API_KEY in .env
 * 2. Run `vercel dev` in another terminal
 * 3. Change describe.skip to describe below
 * 
 * The unit tests in PhotoCapture.test.js validate the pattern logic without API calls.
 */

describe.skip("PhotoCapture Integration — Vision API", () => {

  const API_URL = "http://localhost:3000/api/scan";

  it("screenshot-1: returns correct hints via vision API", async () => {
    const { readFileSync } = await import("fs");
    const { resolve } = await import("path");
    const imagePath = resolve(__dirname, "test-images/screenshot-1.png");
    const imageBuffer = readFileSync(imagePath);
    const base64 = `data:image/png;base64,${imageBuffer.toString("base64")}`;

    const response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: base64 }),
    });

    expect(response.ok).toBe(true);
    const data = await response.json();

    // Expected: Row: 05/1, 03/2, 05/1, 04/1, 08/1  Col: 05/1, 05/1, 05/1, 04/2, 06/1
    expect(data.rows).toEqual([
      { pts: 5, bombs: 1 },
      { pts: 3, bombs: 2 },
      { pts: 5, bombs: 1 },
      { pts: 4, bombs: 1 },
      { pts: 8, bombs: 1 },
    ]);
    expect(data.cols).toEqual([
      { pts: 5, bombs: 1 },
      { pts: 5, bombs: 1 },
      { pts: 5, bombs: 1 },
      { pts: 4, bombs: 2 },
      { pts: 6, bombs: 1 },
    ]);
  }, 30000);

  it("screenshot-2: returns correct hints via vision API", async () => {
    const { readFileSync } = await import("fs");
    const { resolve } = await import("path");
    const imagePath = resolve(__dirname, "test-images/screenshot-2.png");
    const imageBuffer = readFileSync(imagePath);
    const base64 = `data:image/png;base64,${imageBuffer.toString("base64")}`;

    const response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: base64 }),
    });

    expect(response.ok).toBe(true);
    const data = await response.json();

    // Expected: Row: 09/1, 03/2, 03/2, 05/1, 05/1  Col: 02/3, 05/1, 06/0, 07/1, 05/2
    expect(data.rows).toEqual([
      { pts: 9, bombs: 1 },
      { pts: 3, bombs: 2 },
      { pts: 3, bombs: 2 },
      { pts: 5, bombs: 1 },
      { pts: 5, bombs: 1 },
    ]);
    expect(data.cols).toEqual([
      { pts: 2, bombs: 3 },
      { pts: 5, bombs: 1 },
      { pts: 6, bombs: 0 },
      { pts: 7, bombs: 1 },
      { pts: 5, bombs: 2 },
    ]);
  }, 30000);
});
