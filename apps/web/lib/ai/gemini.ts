// Thin Gemini REST client — no SDK dependency, matching the rest of this
// repo's pattern of calling third-party APIs directly with fetch
// (Razorpay's Orders API, #39) rather than pulling in a wrapper library.

// gemini-3.6-flash is a reasoning model — verified live that it burns
// several hundred "thinking" tokens (billed against maxOutputTokens)
// before writing a single word of the actual answer, truncating short
// replies to nothing even at maxOutputTokens: 1500. flash-lite has no
// hidden reasoning phase and is the right fit for a narration task this
// small (verified: a complete, well-formed reply in ~160 tokens, no
// truncation).
const GEMINI_MODEL = "gemini-3.5-flash-lite";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

export async function geminiGenerate(systemPrompt: string, userMessage: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY not configured");
  }

  const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: "user", parts: [{ text: userMessage }] }],
      generationConfig: { temperature: 0.4, maxOutputTokens: 500 },
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Gemini API error ${res.status}: ${detail}`);
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "";
  if (!text) {
    throw new Error("Gemini returned no text (possibly blocked by safety filters)");
  }
  return text;
}
