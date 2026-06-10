import { useState } from "react";

/* ═══════════════════════════════════════════════════════
   PASTE INPUT — LLM-assisted board entry
   
   Users upload their screenshot to any AI chatbot,
   copy a pre-built prompt, and paste the response here.
   
   Expected format: 20 numbers in order
   (row1pts row1bombs row2pts row2bombs ... col5pts col5bombs)
   
   The parser is very forgiving — accepts any separator
   (spaces, commas, newlines, slashes, pipes, etc.)
═══════════════════════════════════════════════════════ */

const PROMPT_TEXT = `Read this Voltorb Flip screenshot. List 20 numbers in this exact order: Row 1 points, Row 1 bombs, Row 2 points, Row 2 bombs, Row 3 points, Row 3 bombs, Row 4 points, Row 4 bombs, Row 5 points, Row 5 bombs, Column 1 points, Column 1 bombs, Column 2 points, Column 2 bombs, Column 3 points, Column 3 bombs, Column 4 points, Column 4 bombs, Column 5 points, Column 5 bombs. Points range 0-15, bombs range 0-5. Return ONLY the 20 numbers separated by spaces, nothing else.`;

/**
 * Parse a string of 20 numbers into row/col hints.
 * Very forgiving: splits on any non-digit character.
 */
export function parsePasteInput(text) {
  // Extract all numbers from the text
  const numbers = text.match(/\d+/g);
  
  if (!numbers || numbers.length < 20) {
    return { error: `Found ${numbers?.length || 0} numbers, need exactly 20.`, rowResults: null, colResults: null };
  }

  const values = numbers.slice(0, 20).map(Number);

  // Validate ranges
  const rowResults = [];
  const colResults = [];

  for (let i = 0; i < 5; i++) {
    const pts = values[i * 2];
    const bombs = values[i * 2 + 1];
    if (pts > 15) return { error: `Row ${i+1} points (${pts}) exceeds max of 15.`, rowResults: null, colResults: null };
    if (bombs > 5) return { error: `Row ${i+1} bombs (${bombs}) exceeds max of 5.`, rowResults: null, colResults: null };
    rowResults.push({ pts: String(pts), bombs: String(bombs) });
  }

  for (let i = 0; i < 5; i++) {
    const pts = values[10 + i * 2];
    const bombs = values[10 + i * 2 + 1];
    if (pts > 15) return { error: `Col ${i+1} points (${pts}) exceeds max of 15.`, rowResults: null, colResults: null };
    if (bombs > 5) return { error: `Col ${i+1} bombs (${bombs}) exceeds max of 5.`, rowResults: null, colResults: null };
    colResults.push({ pts: String(pts), bombs: String(bombs) });
  }

  return { error: null, rowResults, colResults };
}

export default function PasteInput({ onHintsDetected }) {
  const [isOpen, setIsOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const handleCopyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(PROMPT_TEXT);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: select text for manual copy
      const el = document.createElement("textarea");
      el.value = PROMPT_TEXT;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleSubmit = () => {
    setError("");
    const { error: parseError, rowResults, colResults } = parsePasteInput(pasteText);
    
    if (parseError) {
      setError(parseError);
      return;
    }

    onHintsDetected(rowResults, colResults);
    setPasteText("");
    setIsOpen(false);
  };

  const handleClose = () => {
    setIsOpen(false);
    setPasteText("");
    setError("");
  };

  if (!isOpen) {
    return (
      <button onClick={() => setIsOpen(true)} style={btnStyle}>
        📋 PASTE
      </button>
    );
  }

  return (
    <div style={{
      marginTop: 8, padding: "10px",
      background: "#1A5A3A", borderRadius: 4,
      border: "2px solid #A0E8C066",
    }}>
      {/* Instructions */}
      <div style={{
        fontFamily: "'Press Start 2P', monospace", fontSize: 6,
        color: "#A0E8C0", marginBottom: 8, lineHeight: 1.6,
      }}>
        1. COPY PROMPT BELOW<br />
        2. PASTE IN YOUR AI CHAT WITH SCREENSHOT<br />
        3. PASTE AI RESPONSE HERE
      </div>

      {/* Copy prompt button */}
      <button onClick={handleCopyPrompt} style={{
        width: "100%", padding: "8px",
        fontFamily: "'Press Start 2P', monospace", fontSize: 7,
        color: copied ? "#AAFFAA" : "#FFF",
        background: copied ? "#2A6A4A" : "#2A5A4A",
        border: `2px solid ${copied ? "#AAFFAA44" : "#A0E8C044"}`,
        borderRadius: 4, cursor: "pointer",
        marginBottom: 8, textAlign: "center",
        transition: "all 0.2s",
      }}>
        {copied ? "✓ COPIED!" : "📋 COPY PROMPT TO CLIPBOARD"}
      </button>

      {/* Paste area */}
      <textarea
        value={pasteText}
        onChange={(e) => setPasteText(e.target.value)}
        placeholder="Paste AI response here (20 numbers)..."
        style={{
          width: "100%", height: 60, resize: "vertical",
          fontFamily: "monospace", fontSize: 12,
          color: "#FFF", background: "#0A3A2A",
          border: "2px solid #A0E8C044", borderRadius: 4,
          padding: "8px", outline: "none",
        }}
      />

      {/* Error */}
      {error && (
        <div style={{
          fontFamily: "'Press Start 2P', monospace", fontSize: 6,
          color: "#FFAAAA", marginTop: 4,
        }}>⚠ {error}</div>
      )}

      {/* Preview of parsed values */}
      {pasteText && !error && (() => {
        const nums = pasteText.match(/\d+/g);
        if (nums && nums.length >= 20) {
          const vals = nums.slice(0, 20).map(Number);
          return (
            <div style={{
              fontFamily: "monospace", fontSize: 9,
              color: "#A0E8C088", marginTop: 4,
            }}>
              R: {vals.slice(0, 10).reduce((acc, v, i) => {
                if (i % 2 === 0) acc.push(`${v}/`);
                else acc[acc.length - 1] += v;
                return acc;
              }, []).join(", ")}
              <br />
              C: {vals.slice(10, 20).reduce((acc, v, i) => {
                if (i % 2 === 0) acc.push(`${v}/`);
                else acc[acc.length - 1] += v;
                return acc;
              }, []).join(", ")}
            </div>
          );
        }
        return null;
      })()}

      {/* Action buttons */}
      <div style={{ display: "flex", gap: 8, marginTop: 8, justifyContent: "center" }}>
        <button onClick={handleSubmit} style={{
          fontFamily: "'Press Start 2P', monospace", fontSize: 8,
          color: "#FFF", background: "linear-gradient(180deg, #50C878, #38A858)",
          border: "2px solid #288838", borderRadius: 4,
          padding: "8px 14px", cursor: "pointer",
          boxShadow: "0 2px 4px rgba(0,0,0,0.3)",
        }}>FILL BOARD</button>
        <button onClick={handleClose} style={{
          fontFamily: "'Press Start 2P', monospace", fontSize: 7,
          color: "#A0E8C0", background: "transparent",
          border: "1px solid #A0E8C044", borderRadius: 4,
          padding: "6px 12px", cursor: "pointer",
        }}>CANCEL</button>
      </div>
    </div>
  );
}

const btnStyle = {
  fontFamily: "'Press Start 2P', monospace", fontSize: 8,
  color: "#FFF", background: "linear-gradient(180deg, #6878B8, #4858A8)",
  border: "2px solid #384898", borderRadius: 4,
  padding: "8px 12px", cursor: "pointer",
  boxShadow: "0 2px 4px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.3)",
  textShadow: "0 1px 1px rgba(0,0,0,0.3)",
};
