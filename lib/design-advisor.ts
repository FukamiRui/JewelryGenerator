import type { SupabaseClient } from "@supabase/supabase-js";

// Reuses the same provider as lib/claude-prompt.ts (Groq/Llama — despite
// that file's name, this project doesn't actually call Anthropic anywhere;
// ANTHROPIC_API_KEY has been unused since prompts moved to per-material
// tags). No new API key required.
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "llama-3.3-70b-versatile";

const SYSTEM_PROMPT = `You are a friendly, expert jewelry design consultant. A customer has
generated several AI design variations in a chat with a jewelry shop but hasn't found one they
love yet. Given the prompts behind their past attempts, suggest ONE concrete, specific thing to
try differently next — a metal, stone, finish, or overall style change, or suggest they upload a
reference photo instead if their request seems hard to describe in words. 2-3 sentences, warm,
no preamble, no markdown.`;

const FALLBACK_TIPS = [
  "Try a different metal tone next — rose gold, yellow gold, and platinum can change the whole feel of the same setting.",
  "If the stone looks off, adjust the estimated size and regenerate — small changes in scale read very differently in the render.",
  "Simplifying often helps: one main stone and one finish tends to look more intentional than combining several details at once.",
  "If it's hard to put into words, try uploading a reference photo below — showing what you mean is often faster than describing it.",
];

function randomFallback(): string {
  return FALLBACK_TIPS[Math.floor(Math.random() * FALLBACK_TIPS.length)];
}

interface AttemptRow {
  designs: { generated_prompt: string | null } | null;
}

export async function generateDesignAdvice(
  supabase: SupabaseClient,
  conversationId: string
): Promise<string> {
  const { data: messages } = await supabase
    .from("messages")
    .select("designs(generated_prompt)")
    .eq("conversation_id", conversationId)
    .eq("sender_type", "customer")
    .not("design_id", "is", null)
    .order("created_at", { ascending: true })
    .limit(10);

  const prompts = ((messages ?? []) as unknown as AttemptRow[])
    .map((m) => m.designs?.generated_prompt)
    .filter((p): p is string => !!p);

  if (!GROQ_API_KEY || prompts.length === 0) {
    return randomFallback();
  }

  try {
    const res = await fetch(GROQ_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        max_tokens: 200,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: `Attempts so far, in order:\n${prompts.map((p, i) => `${i + 1}. ${p}`).join("\n")}`,
          },
        ],
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) throw new Error(`Groq API request failed: ${res.status}`);

    const data = await res.json();
    const text: string | undefined = data.choices?.[0]?.message?.content?.trim();
    return text || randomFallback();
  } catch (err) {
    console.warn("[design-advisor] Groq call failed, using fallback tip:", err);
    return randomFallback();
  }
}
