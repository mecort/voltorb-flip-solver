/**
 * Vercel Serverless Function: /api/scan
 * 
 * Accepts a Voltorb Flip screenshot (as base64 or multipart upload),
 * sends it to Google Gemini Flash for vision analysis,
 * returns the extracted row/col hint values.
 * 
 * Environment variable required: GEMINI_API_KEY
 */

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "4mb",
    },
  },
};

const GEMINI_MODEL = "gemini-2.0-flash";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const PROMPT = `You are analyzing a screenshot from the Pokémon game "Voltorb Flip". 

The game board has a 5x5 grid of cards. On the RIGHT side of the grid, there are 5 hint panels (one per row). At the BOTTOM of the grid, there are 5 hint panels (one per column).

Each hint panel shows two numbers:
- The top number is the POINTS total for that row/column (sum of all non-Voltorb cards, range 0-15)
- The bottom number (next to a Voltorb icon) is the BOMB COUNT (number of Voltorbs in that row/column, range 0-5)

Please extract all 10 hint panel values and return them in this exact JSON format:
{
  "rows": [
    {"pts": <number>, "bombs": <number>},
    {"pts": <number>, "bombs": <number>},
    {"pts": <number>, "bombs": <number>},
    {"pts": <number>, "bombs": <number>},
    {"pts": <number>, "bombs": <number>}
  ],
  "cols": [
    {"pts": <number>, "bombs": <number>},
    {"pts": <number>, "bombs": <number>},
    {"pts": <number>, "bombs": <number>},
    {"pts": <number>, "bombs": <number>},
    {"pts": <number>, "bombs": <number>}
  ]
}

Rows are ordered top to bottom. Columns are ordered left to right.
Return ONLY the JSON, no other text.`;

export default async function handler(req, res) {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "GEMINI_API_KEY not configured" });
  }

  try {
    const { image } = req.body;

    if (!image) {
      return res.status(400).json({ error: "No image provided. Send { image: '<base64 data>' }" });
    }

    // Strip data URL prefix if present
    const base64Data = image.replace(/^data:image\/\w+;base64,/, "");

    // Call Gemini API
    const geminiResponse = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: PROMPT },
            {
              inline_data: {
                mime_type: "image/png",
                data: base64Data,
              },
            },
          ],
        }],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 512,
        },
      }),
    });

    if (!geminiResponse.ok) {
      const errText = await geminiResponse.text();
      console.error("Gemini API error:", errText);

      if (geminiResponse.status === 429) {
        return res.status(429).json({
          error: "Rate limit reached. Please wait a minute and try again, or use Quick Entry mode.",
          retryable: true,
        });
      }
      if (geminiResponse.status === 403) {
        return res.status(403).json({
          error: "API quota exhausted or key invalid. Use Quick Entry mode instead.",
          retryable: false,
        });
      }

      return res.status(502).json({ error: "Vision API request failed", details: errText });
    }

    const geminiData = await geminiResponse.json();

    // Extract the text response
    const textContent = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!textContent) {
      return res.status(502).json({ error: "No response from vision API" });
    }

    // Parse JSON from response (handle markdown code blocks)
    let jsonStr = textContent.trim();
    if (jsonStr.startsWith("```")) {
      jsonStr = jsonStr.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
    }

    const parsed = JSON.parse(jsonStr);

    // Validate structure
    if (!parsed.rows || !parsed.cols || parsed.rows.length !== 5 || parsed.cols.length !== 5) {
      return res.status(502).json({ error: "Invalid response structure from vision API", raw: textContent });
    }

    // Validate ranges
    for (const hint of [...parsed.rows, ...parsed.cols]) {
      if (typeof hint.pts !== "number" || typeof hint.bombs !== "number") {
        return res.status(502).json({ error: "Non-numeric values in response", raw: textContent });
      }
      hint.pts = Math.max(0, Math.min(15, hint.pts));
      hint.bombs = Math.max(0, Math.min(5, hint.bombs));
    }

    return res.status(200).json(parsed);
  } catch (e) {
    console.error("Scan error:", e);
    return res.status(500).json({ error: e.message || "Internal server error" });
  }
}
