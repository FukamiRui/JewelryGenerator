// Configurable because fal.ai's video model lineup moves fast (Kling,
// Seedance, Veo, PixVerse, …) and every image-to-video model on fal shares
// the same { prompt, image_url } request shape, so swapping models is a
// one-line env change, not a code change.
const FAL_VIDEO_ENDPOINT =
  process.env.FAL_VIDEO_MODEL_ENDPOINT ?? "https://fal.run/fal-ai/kling-video/v2.1/standard/image-to-video";

// Checked lazily, not at module load — see lib/stripe.ts for why.
function getFalApiKey(): string {
  const key = process.env.FAL_API_KEY;
  if (!key) throw new Error("Missing FAL_API_KEY — check .env.local");
  return key;
}

export { VIDEO_GENERATION_CREDIT_COST } from "@/lib/credits";

export const DEFAULT_MOTION_PROMPT =
  "Slow 360-degree rotation on a dark reflective surface, studio lighting, macro detail, no camera shake";

interface FalVideoResponse {
  video: { url: string };
}

export async function generateJewelryVideo(
  sourceImageUrl: string,
  motionPrompt: string,
  durationSeconds: "5" | "10" = "5"
): Promise<string> {
  let res: Response;
  try {
    res = await fetch(FAL_VIDEO_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Key ${getFalApiKey()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt: motionPrompt,
        image_url: sourceImageUrl,
        duration: durationSeconds,
      }),
      // Video generation legitimately takes much longer than image
      // generation (tens of seconds) — fail clearly rather than hanging
      // indefinitely if fal.ai stalls.
      signal: AbortSignal.timeout(180_000),
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "TimeoutError") {
      throw new Error("Video generation timed out. Please try again.");
    }
    throw new Error(`Could not reach the video generation service: ${(err as Error).message}`);
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    if (res.status === 401) throw new Error("Video generation API rejected the request — check FAL_API_KEY.");
    if (res.status === 429) throw new Error("Video generation rate limit reached. Please try again shortly.");
    throw new Error(`Video generation request failed (${res.status}): ${errText}`);
  }

  const data: FalVideoResponse = await res.json();
  if (!data.video?.url) throw new Error("Video generation returned no video.");
  return data.video.url;
}
