import { describe, it, expect, vi, beforeEach } from "vitest";
import handler from "./scan.js";

// Mock response object
function mockRes() {
  const res = {
    statusCode: null,
    headers: {},
    body: null,
    setHeader(key, val) { res.headers[key] = val; return res; },
    status(code) { res.statusCode = code; return res; },
    json(data) { res.body = data; return res; },
    end() { return res; },
  };
  return res;
}

// Mock request object
function mockReq(method, body = {}) {
  return { method, body };
}

describe("API /api/scan", () => {

  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns 405 for non-POST methods", async () => {
    const req = mockReq("GET");
    const res = mockRes();
    await handler(req, res);
    expect(res.statusCode).toBe(405);
    expect(res.body.error).toBe("Method not allowed");
  });

  it("returns 200 for OPTIONS (CORS preflight)", async () => {
    const req = mockReq("OPTIONS");
    const res = mockRes();
    await handler(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.headers["Access-Control-Allow-Origin"]).toBe("*");
  });

  it("returns 500 when GEMINI_API_KEY is not set", async () => {
    vi.stubGlobal("process", { env: {} });
    const req = mockReq("POST", { image: "base64data" });
    const res = mockRes();
    await handler(req, res);
    expect(res.statusCode).toBe(500);
    expect(res.body.error).toBe("GEMINI_API_KEY not configured");
  });

  it("returns 400 when no image is provided", async () => {
    vi.stubGlobal("process", { env: { GEMINI_API_KEY: "test-key" } });
    const req = mockReq("POST", {});
    const res = mockRes();
    await handler(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toContain("No image provided");
  });

  it("returns 429 with user-friendly message on rate limit", async () => {
    vi.stubGlobal("process", { env: { GEMINI_API_KEY: "test-key" } });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => "Rate limit exceeded",
    }));

    const req = mockReq("POST", { image: "data:image/png;base64,abc123" });
    const res = mockRes();
    await handler(req, res);

    expect(res.statusCode).toBe(429);
    expect(res.body.error).toContain("Rate limit");
    expect(res.body.error).toContain("Quick Entry");
    expect(res.body.retryable).toBe(true);
  });

  it("returns 403 with user-friendly message on quota exhausted", async () => {
    vi.stubGlobal("process", { env: { GEMINI_API_KEY: "test-key" } });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      text: async () => "Quota exceeded",
    }));

    const req = mockReq("POST", { image: "data:image/png;base64,abc123" });
    const res = mockRes();
    await handler(req, res);

    expect(res.statusCode).toBe(403);
    expect(res.body.error).toContain("quota");
    expect(res.body.retryable).toBe(false);
  });

  it("returns 502 on other Gemini API errors", async () => {
    vi.stubGlobal("process", { env: { GEMINI_API_KEY: "test-key" } });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => "Internal server error",
    }));

    const req = mockReq("POST", { image: "data:image/png;base64,abc123" });
    const res = mockRes();
    await handler(req, res);

    expect(res.statusCode).toBe(502);
    expect(res.body.error).toBe("Vision API request failed");
  });

  it("returns 502 when Gemini returns empty response", async () => {
    vi.stubGlobal("process", { env: { GEMINI_API_KEY: "test-key" } });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ candidates: [] }),
    }));

    const req = mockReq("POST", { image: "data:image/png;base64,abc123" });
    const res = mockRes();
    await handler(req, res);

    expect(res.statusCode).toBe(502);
    expect(res.body.error).toBe("No response from vision API");
  });

  it("returns 502 when Gemini returns invalid JSON structure", async () => {
    vi.stubGlobal("process", { env: { GEMINI_API_KEY: "test-key" } });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: '{"rows": []}' }] } }],
      }),
    }));

    const req = mockReq("POST", { image: "data:image/png;base64,abc123" });
    const res = mockRes();
    await handler(req, res);

    expect(res.statusCode).toBe(502);
    expect(res.body.error).toContain("Invalid response structure");
  });

  it("returns 200 with valid hint data on successful response", async () => {
    const validResponse = {
      rows: [
        { pts: 5, bombs: 1 }, { pts: 3, bombs: 2 }, { pts: 5, bombs: 1 },
        { pts: 4, bombs: 1 }, { pts: 8, bombs: 0 },
      ],
      cols: [
        { pts: 5, bombs: 1 }, { pts: 5, bombs: 1 }, { pts: 5, bombs: 1 },
        { pts: 4, bombs: 2 }, { pts: 6, bombs: 1 },
      ],
    };

    vi.stubGlobal("process", { env: { GEMINI_API_KEY: "test-key" } });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: JSON.stringify(validResponse) }] } }],
      }),
    }));

    const req = mockReq("POST", { image: "data:image/png;base64,abc123" });
    const res = mockRes();
    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.rows).toHaveLength(5);
    expect(res.body.cols).toHaveLength(5);
    expect(res.body.rows[0]).toEqual({ pts: 5, bombs: 1 });
    expect(res.body.cols[4]).toEqual({ pts: 6, bombs: 1 });
  });

  it("handles markdown-wrapped JSON from Gemini", async () => {
    const validResponse = {
      rows: [
        { pts: 5, bombs: 1 }, { pts: 3, bombs: 2 }, { pts: 5, bombs: 1 },
        { pts: 4, bombs: 1 }, { pts: 8, bombs: 0 },
      ],
      cols: [
        { pts: 5, bombs: 0 }, { pts: 5, bombs: 2 }, { pts: 4, bombs: 1 },
        { pts: 3, bombs: 3 }, { pts: 8, bombs: 0 },
      ],
    };

    vi.stubGlobal("process", { env: { GEMINI_API_KEY: "test-key" } });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{
          content: { parts: [{ text: "```json\n" + JSON.stringify(validResponse) + "\n```" }] },
        }],
      }),
    }));

    const req = mockReq("POST", { image: "data:image/png;base64,abc123" });
    const res = mockRes();
    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.rows[0]).toEqual({ pts: 5, bombs: 1 });
  });

  it("clamps out-of-range values to valid bounds", async () => {
    vi.stubGlobal("process", { env: { GEMINI_API_KEY: "test-key" } });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{
          content: {
            parts: [{
              text: JSON.stringify({
                rows: [
                  { pts: 20, bombs: 7 }, { pts: -1, bombs: -2 }, { pts: 5, bombs: 1 },
                  { pts: 4, bombs: 1 }, { pts: 8, bombs: 0 },
                ],
                cols: [
                  { pts: 5, bombs: 0 }, { pts: 5, bombs: 2 }, { pts: 4, bombs: 1 },
                  { pts: 3, bombs: 3 }, { pts: 8, bombs: 0 },
                ],
              }),
            }],
          },
        }],
      }),
    }));

    const req = mockReq("POST", { image: "data:image/png;base64,abc123" });
    const res = mockRes();
    await handler(req, res);

    expect(res.statusCode).toBe(200);
    // pts clamped to 0-15, bombs clamped to 0-5
    expect(res.body.rows[0].pts).toBe(15);
    expect(res.body.rows[0].bombs).toBe(5);
    expect(res.body.rows[1].pts).toBe(0);
    expect(res.body.rows[1].bombs).toBe(0);
  });

  it("returns 500 on unexpected errors", async () => {
    vi.stubGlobal("process", { env: { GEMINI_API_KEY: "test-key" } });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network timeout")));

    const req = mockReq("POST", { image: "data:image/png;base64,abc123" });
    const res = mockRes();
    await handler(req, res);

    expect(res.statusCode).toBe(500);
    expect(res.body.error).toBe("Network timeout");
  });
});
