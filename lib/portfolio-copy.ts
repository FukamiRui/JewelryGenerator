if (!process.env.GROQ_API_KEY) {
  throw new Error("Missing GROQ_API_KEY — check .env.local");
}
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "openai/gpt-oss-120b"; // Groq no longer serves llama-3.3-70b-versatile as of late 2025

const SYSTEM_PROMPT = `You are a jewelry shop's copywriter. Given a piece's title and/or materials,
write one short, warm portfolio caption (1-2 sentences, under 240 characters) that a customer
browsing the shop's page would read. Plain English, no hashtags, no emoji, no markdown, no quotes
around the output. Output ONLY the caption text.`;

interface PortfolioCopyInput {
  title?: string;
  materials?: string;
  categoryName?: string;
}

export async function generatePortfolioDescription(input: PortfolioCopyInput): Promise<string> {
  const { title, materials, categoryName } = input;
  if (!title && !materials && !categoryName) {
    throw new Error("Give it at least a title, materials, or category to work from.");
  }

  const summary = [
    title ? `Title: ${title}` : null,
    categoryName ? `Category: ${categoryName}` : null,
    materials ? `Materials: ${materials}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  let res: Response;
  try {
    res = await fetch(GROQ_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        max_tokens: 200,
        temperature: 0.8,
        reasoning_effort: "low", // gpt-oss is a reasoning model — without this, reasoning tokens can eat the whole budget and leave content empty
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: summary },
        ],
      }),
      signal: AbortSignal.timeout(20_000),
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "TimeoutError") {
      throw new Error("Description generation timed out. Please try again.");
    }
    throw new Error(`Could not reach the description generation service: ${(err as Error).message}`);
  }

  if (!res.ok) {
    if (res.status === 401) throw new Error("Groq API rejected the request — check GROQ_API_KEY.");
    if (res.status === 429) throw new Error("Groq API rate limit reached. Please try again shortly.");
    const errText = await res.text().catch(() => "");
    throw new Error(`Groq API request failed (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const text: string | undefined = data.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("Groq API returned an empty description.");

  return text.replace(/^["']|["']$/g, "");
}
