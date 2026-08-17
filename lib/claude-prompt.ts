import type { Category, Material } from "@/types/domain";

if (!process.env.GROQ_API_KEY) {
  throw new Error("Missing GROQ_API_KEY — check .env.local");
}
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "llama-3.3-70b-versatile"; // free-tier model on Groq

const SYSTEM_PROMPT = `You are a world-class jewelry artisan and prompt engineer.
Given the selected category, metal, gemstone(s), and finish for a piece of jewelry,
combine them into a single English prompt for FLUX.1 [pro] that maximizes photorealism:
describe metallic luster, gemstone clarity and brilliance, prong/setting detail, and
reflected light. Output ONLY the prompt text — no explanation, no markdown, no preamble.`;

interface BuildPromptInput {
  category: Category;
  metal: Material;
  gemstones: Material[];
  finish: Material | null;
}

export async function buildFluxPrompt(input: BuildPromptInput): Promise<string> {
  const { category, metal, gemstones, finish } = input;

  const conditionSummary = [
    `Category: ${category.name} (${category.ai_prompt_tag})`,
    `Metal: ${metal.name} (${metal.ai_prompt_tag})`,
    gemstones.length > 0
      ? `Gemstones: ${gemstones.map((g) => `${g.name} (${g.ai_prompt_tag})`).join(", ")}`
      : "Gemstones: none",
    finish ? `Finish: ${finish.name} (${finish.ai_prompt_tag})` : "Finish: default",
  ].join("\n");

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
        max_tokens: 400,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: conditionSummary },
        ],
      }),
      signal: AbortSignal.timeout(20_000),
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "TimeoutError") {
      throw new Error("Prompt generation timed out. Please try again.");
    }
    throw new Error(`Could not reach the prompt generation service: ${(err as Error).message}`);
  }

  if (!res.ok) {
    if (res.status === 401) throw new Error("Groq API rejected the request — check GROQ_API_KEY.");
    if (res.status === 429) throw new Error("Groq API rate limit reached. Please try again shortly.");
    const errText = await res.text().catch(() => "");
    throw new Error(`Groq API request failed (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const text: string | undefined = data.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("Groq API returned an empty prompt.");

  return text;
}
