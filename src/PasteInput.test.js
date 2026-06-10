import { describe, it, expect } from "vitest";
import { parsePasteInput } from "./PasteInput";

describe("PasteInput — parsePasteInput", () => {

  it("parses 20 space-separated numbers correctly", () => {
    const input = "5 1 3 2 5 1 4 1 8 0 5 0 5 2 4 1 3 3 8 0";
    const { error, rowResults, colResults } = parsePasteInput(input);

    expect(error).toBeNull();
    expect(rowResults).toEqual([
      { pts: "5", bombs: "1" },
      { pts: "3", bombs: "2" },
      { pts: "5", bombs: "1" },
      { pts: "4", bombs: "1" },
      { pts: "8", bombs: "0" },
    ]);
    expect(colResults).toEqual([
      { pts: "5", bombs: "0" },
      { pts: "5", bombs: "2" },
      { pts: "4", bombs: "1" },
      { pts: "3", bombs: "3" },
      { pts: "8", bombs: "0" },
    ]);
  });

  it("parses comma-separated numbers", () => {
    const input = "5,1,3,2,5,1,4,1,8,0,5,0,5,2,4,1,3,3,8,0";
    const { error, rowResults, colResults } = parsePasteInput(input);
    expect(error).toBeNull();
    expect(rowResults[0]).toEqual({ pts: "5", bombs: "1" });
    expect(colResults[4]).toEqual({ pts: "8", bombs: "0" });
  });

  it("parses newline-separated numbers", () => {
    const input = "5\n1\n3\n2\n5\n1\n4\n1\n8\n0\n5\n0\n5\n2\n4\n1\n3\n3\n8\n0";
    const { error, rowResults } = parsePasteInput(input);
    expect(error).toBeNull();
    expect(rowResults[0]).toEqual({ pts: "5", bombs: "1" });
  });

  it("parses mixed separators (spaces, commas, newlines, slashes)", () => {
    const input = "5/1, 3/2, 5/1, 4/1, 8/0\n5/0, 5/2, 4/1, 3/3, 8/0";
    const { error, rowResults, colResults } = parsePasteInput(input);
    expect(error).toBeNull();
    expect(rowResults[0]).toEqual({ pts: "5", bombs: "1" });
    expect(colResults[0]).toEqual({ pts: "5", bombs: "0" });
  });

  it("handles extra text around numbers (LLM verbose response)", () => {
    const input = "Here are the values: 5 1 3 2 5 1 4 1 8 0 5 0 5 2 4 1 3 3 8 0 - hope that helps!";
    const { error, rowResults } = parsePasteInput(input);
    expect(error).toBeNull();
    expect(rowResults[0]).toEqual({ pts: "5", bombs: "1" });
  });

  it("handles two-digit point values (10, 11, 12, 13, 14, 15)", () => {
    const input = "12 2 10 1 15 0 11 3 8 1 5 0 5 2 4 1 3 3 8 0";
    const { error, rowResults } = parsePasteInput(input);
    expect(error).toBeNull();
    expect(rowResults[0]).toEqual({ pts: "12", bombs: "2" });
    expect(rowResults[2]).toEqual({ pts: "15", bombs: "0" });
    expect(rowResults[3]).toEqual({ pts: "11", bombs: "3" });
  });

  it("returns error when fewer than 20 numbers provided", () => {
    const input = "5 1 3 2 5 1";
    const { error } = parsePasteInput(input);
    expect(error).toContain("6");
    expect(error).toContain("20");
  });

  it("returns error when empty input", () => {
    const { error } = parsePasteInput("");
    expect(error).toBeTruthy();
  });

  it("returns error when points exceed 15", () => {
    const input = "16 1 3 2 5 1 4 1 8 0 5 0 5 2 4 1 3 3 8 0";
    const { error } = parsePasteInput(input);
    expect(error).toContain("Row 1");
    expect(error).toContain("15");
  });

  it("returns error when bombs exceed 5", () => {
    const input = "5 6 3 2 5 1 4 1 8 0 5 0 5 2 4 1 3 3 8 0";
    const { error } = parsePasteInput(input);
    expect(error).toContain("Row 1");
    expect(error).toContain("bombs");
  });

  it("returns error when column points exceed 15", () => {
    const input = "5 1 3 2 5 1 4 1 8 0 5 0 5 2 4 1 3 3 16 0";
    const { error } = parsePasteInput(input);
    expect(error).toContain("Col 5");
  });

  it("ignores extra numbers beyond 20", () => {
    const input = "5 1 3 2 5 1 4 1 8 0 5 0 5 2 4 1 3 3 8 0 99 99 99";
    const { error, rowResults, colResults } = parsePasteInput(input);
    expect(error).toBeNull();
    expect(rowResults.length).toBe(5);
    expect(colResults.length).toBe(5);
  });

  it("handles zero values correctly", () => {
    const input = "0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0";
    const { error, rowResults, colResults } = parsePasteInput(input);
    expect(error).toBeNull();
    expect(rowResults[0]).toEqual({ pts: "0", bombs: "0" });
    expect(colResults[0]).toEqual({ pts: "0", bombs: "0" });
  });

  it("parses the exact format from the suggested prompt response", () => {
    // What Gemini/ChatGPT would likely return
    const input = "9 1 3 2 3 2 5 1 5 1 2 3 5 1 6 0 7 1 5 2";
    const { error, rowResults, colResults } = parsePasteInput(input);
    expect(error).toBeNull();
    expect(rowResults).toEqual([
      { pts: "9", bombs: "1" },
      { pts: "3", bombs: "2" },
      { pts: "3", bombs: "2" },
      { pts: "5", bombs: "1" },
      { pts: "5", bombs: "1" },
    ]);
    expect(colResults).toEqual([
      { pts: "2", bombs: "3" },
      { pts: "5", bombs: "1" },
      { pts: "6", bombs: "0" },
      { pts: "7", bombs: "1" },
      { pts: "5", bombs: "2" },
    ]);
  });
});
