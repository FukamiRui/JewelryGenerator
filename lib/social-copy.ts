const GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";

// Checked lazily, not at module load — see lib/stripe.ts for why.
function getGroqApiKey(): string {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("Missing GROQ_API_KEY — check .env.local");
  return key;
}
const GROQ_MODEL = "openai/gpt-oss-120b";

export type SocialPlatform = "tiktok" | "twitter" | "reels";

const PLATFORM_GUIDANCE: Record<SocialPlatform, string> = {
  tiktok: "TikTok: casual, punchy, hook in the first few words, 1-2 short sentences max.",
  reels: "Instagram Reels: warm and aspirational, 1-2 short sentences, can be slightly longer than TikTok.",
  twitter: "X/Twitter: concise, under 200 characters total including hashtags, no fluff.",
};

const SYSTEM_PROMPT = `You are a jewelry shop's social media assistant. Given a piece's title and/or
materials and a target platform, write a short caption and a list of relevant hashtags for that
piece's video post. Match the platform's tone and length. Output ONLY valid JSON in this exact
shape, no markdown, no code fences: {"caption": "...", "hashtags": ["#tag1", "#tag2", ...]}.
Include 5-8 hashtags mixing broad jewelry tags (e.g. #finejewelry, #handmadejewelry) with
piece-specific ones. Hashtags must start with # and contain no spaces.`;

export interface SocialCaptionResult {
  caption: string;
  hashtags: string[];
}

interface SocialCaptionInput {
  title?: string;
  materials?: string;
  categoryName?: string;
  platform: SocialPlatform;
}

export async function generateSocialCaption(input: SocialCaptionInput): Promise<SocialCaptionResult> {
  const { title, materials, categoryName, platform } = input;
  if (!title && !materials && !categoryName) {
    throw new Error("Give it at least a title, materials, or category to work from.");
  }

  const summary = [
    `Platform: ${platform} — ${PLATFORM_GUIDANCE[platform]}`,
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
        Authorization: `Bearer ${getGroqApiKey()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        max_tokens: 300,
        temperature: 0.8,
        reasoning_effort: "low",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: summary },
        ],
      }),
      signal: AbortSignal.timeout(20_000),
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "TimeoutError") {
      throw new Error("Caption generation timed out. Please try again.");
    }
    throw new Error(`Could not reach the caption generation service: ${(err as Error).message}`);
  }

  if (!res.ok) {
    if (res.status === 401) throw new Error("Groq API rejected the request — check GROQ_API_KEY.");
    if (res.status === 429) throw new Error("Groq API rate limit reached. Please try again shortly.");
    const errText = await res.text().catch(() => "");
    throw new Error(`Groq API request failed (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const text: string | undefined = data.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("Groq API returned an empty caption.");

  let parsed: { caption?: string; hashtags?: string[] };
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Groq API returned an unparseable caption.");
  }
  if (!parsed.caption || !Array.isArray(parsed.hashtags)) {
    throw new Error("Groq API response was missing caption or hashtags.");
  }

  return { caption: parsed.caption, hashtags: parsed.hashtags };
}
