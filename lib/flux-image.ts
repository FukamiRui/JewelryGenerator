if (!process.env.FAL_API_KEY) {
  throw new Error("Missing FAL_API_KEY — check .env.local");
}
const FAL_API_KEY = process.env.FAL_API_KEY;
const FAL_FLUX_PRO_ENDPOINT = "https://fal.run/fal-ai/flux-pro/v1.1";
const FAL_FLUX_KONTEXT_ENDPOINT = "https://fal.run/fal-ai/flux-pro/kontext";

interface FalFluxResponse {
  images: { url: string; width: number; height: number }[];
}

export interface GenerateImageOptions {
  aspectRatio?: "1:1" | "4:3";
  outputFormat?: "jpeg" | "png";
  guidanceScale?: number; // recommended 3.5–4.5
  numImages?: number; // e.g. 4 for the "4 patterns" UX described in the spec
}

export async function generateJewelryImages(
  prompt: string,
  options: GenerateImageOptions = {}
): Promise<string[]> {
  const {
    aspectRatio = "1:1",
    // fal.ai's FLUX.1 [pro] v1.1 endpoint only accepts 'jpeg' or 'png' —
    // 'webp' (the original default here) now fails with a 422 "literal_error".
    outputFormat = "jpeg",
    guidanceScale = 4,
    numImages = 1,
  } = options;

  let res: Response;
  try {
    res = await fetch(FAL_FLUX_PRO_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Key ${FAL_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt,
        aspect_ratio: aspectRatio,
        output_format: outputFormat,
        guidance_scale: guidanceScale,
        num_images: numImages,
      }),
      // FLUX generation can legitimately take several seconds; fail clearly
      // rather than hanging the request indefinitely if fal.ai stalls.
      signal: AbortSignal.timeout(30_000),
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "TimeoutError") {
      throw new Error("Image generation timed out. Please try again.");
    }
    throw new Error(`Could not reach the image generation service: ${(err as Error).message}`);
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    if (res.status === 401) throw new Error("FLUX.1 [pro] API rejected the request — check FAL_API_KEY.");
    if (res.status === 429) throw new Error("Image generation rate limit reached. Please try again shortly.");
    throw new Error(`FLUX.1 [pro] API request failed (${res.status}): ${errText}`);
  }

  const data: FalFluxResponse = await res.json();
  if (!data.images || data.images.length === 0) {
    throw new Error("Image generation returned no images.");
  }
  return data.images.map((img) => img.url);
}

interface FalKontextResponse {
  images: { url: string; width: number; height: number }[];
}

/**
 * Image-guided generation via FLUX.1 Kontext [pro] — takes a customer- or
 * shop-supplied reference photo plus a text prompt and produces a new
 * jewelry render guided by that reference, instead of text-only generation.
 * This is the "upload a photo/illustration instead of describing it"
 * escape hatch offered once a customer exhausts their text-only revisions
 * (see lib/design-revisions.ts) — and is available unconditionally from
 * the shop's own in-store simulator.
 */
export async function generateJewelryImageFromReference(
  referenceImageUrl: string,
  prompt: string
): Promise<string> {
  let res: Response;
  try {
    res = await fetch(FAL_FLUX_KONTEXT_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Key ${FAL_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt,
        image_url: referenceImageUrl,
        guidance_scale: 3.5,
        num_images: 1,
        output_format: "jpeg", // same fal.ai constraint as generateJewelryImages — webp is rejected
      }),
      signal: AbortSignal.timeout(30_000),
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "TimeoutError") {
      throw new Error("Reference-guided image generation timed out. Please try again.");
    }
    throw new Error(`Could not reach the image generation service: ${(err as Error).message}`);
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    if (res.status === 401) throw new Error("FLUX Kontext API rejected the request — check FAL_API_KEY.");
    if (res.status === 429) throw new Error("Image generation rate limit reached. Please try again shortly.");
    throw new Error(`FLUX Kontext API request failed (${res.status}): ${errText}`);
  }

  const data: FalKontextResponse = await res.json();
  if (!data.images || data.images.length === 0) {
    throw new Error("Reference-guided generation returned no images.");
  }
  return data.images[0].url;
}

/**
* Engraving text (e.g. inner-band ring engravings) — routed to Ideogram instead of FLUX,
* per the spec's engraving-option branch.
/** */
export async function generateEngravingImage(
  basePrompt: string,
  engravingText: string
): Promise<string[]> {
  const IDEOGRAM_API_KEY = process.env.IDEOGRAM_API_KEY!;
  const res = await fetch("https://api.ideogram.ai/generate", {
    method: "POST",
    headers: {
      "Api-Key": IDEOGRAM_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      image_request: {
        prompt: `${basePrompt}, engraved text "${engravingText}" on the inner band, macro detail`,
        aspect_ratio: "ASPECT_1_1",
        magic_prompt_option: "OFF",
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Ideogram API request failed: ${res.status} ${errText}`);
  }

  const data = await res.json();
  return (data.data as { url: string }[]).map((d) => d.url);
}
