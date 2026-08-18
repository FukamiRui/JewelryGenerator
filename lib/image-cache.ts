import { createHash, randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DesignSelection } from "@/types/domain";
import { applyWatermark } from "@/lib/watermark";

/**
 * Deterministic hash of a design selection, used to detect "the same request"
 * so we can reuse a previously generated image instead of paying for FLUX again
 * ("画像キャッシュ ＆ ストレージ最適化" in the spec).
 */
export function hashSelection(selection: DesignSelection): string {
  const normalized = {
    category_id: selection.category_id,
    metal_material_id: selection.metal_material_id,
    gemstone_material_ids: [...selection.gemstone_material_ids].sort(),
    finish_material_id: selection.finish_material_id,
    // Round weight to 1 decimal so near-identical estimates still hit cache.
    estimated_weight_grams: Math.round(selection.estimated_weight_grams * 10) / 10,
    // These feed the AI prompt, so they must affect the cache key too —
    // otherwise a new size/fabrication note could silently return a stale
    // cached image that never reflected it.
    size_note: selection.size_note?.trim() || null,
    fabrication_note: selection.fabrication_note?.trim() || null,
  };
  return createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
}

/**
 * Looks up a completed design for this tenant with the same selection hash,
 * generated within the last 30 days. Returns null on a cache miss.
 */
export async function findCachedDesign(
  supabase: SupabaseClient,
  tenantId: string,
  selectionHash: string
) {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("designs")
    .select("id, generated_image_url, generated_prompt, calculated_price_usd, share_token")
    .eq("tenant_id", tenantId)
    .eq("selection_hash", selectionHash)
    .eq("status", "completed")
    .gte("created_at", thirtyDaysAgo)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.warn("[image-cache] lookup failed, proceeding without cache:", error.message);
    return null;
  }
  return data;
}

const STORAGE_BUCKET = "design-images";

/** Free-tier tenants (not an active paid subscription) get watermarked generated images. */
export async function tenantNeedsWatermark(supabase: SupabaseClient, tenantId: string): Promise<boolean> {
  const { data } = await supabase
    .from("tenants")
    .select("subscription_status")
    .eq("id", tenantId)
    .maybeSingle();
  return data?.subscription_status !== "active";
}

/**
 * Downloads a (typically short-lived) FLUX/fal.ai image URL and re-uploads it
 * to Supabase Storage, so the URL saved in `designs.generated_image_url`
 * stays valid indefinitely. Pass `watermark: true` for free-tier tenants
 * (see tenants.subscription_status) — the watermark gets baked into the
 * stored pixels themselves, not just shown in the UI, so every place that
 * later reads this same URL (History, Portfolio, PDF, share links) is
 * covered automatically.
 */
export async function persistImageToStorage(
  supabase: SupabaseClient,
  tenantId: string,
  sourceUrl: string,
  watermark = false
): Promise<string> {
  let res: Response;
  try {
    res = await fetch(sourceUrl, { signal: AbortSignal.timeout(20_000) });
  } catch (err) {
    if (err instanceof DOMException && err.name === "TimeoutError") {
      throw new Error("Timed out downloading the generated image.");
    }
    throw new Error(`Failed to download generated image: ${(err as Error).message}`);
  }
  if (!res.ok) throw new Error(`Failed to download generated image: ${res.status}`);

  const contentType = res.headers.get("content-type") ?? "image/jpeg";
  const ext = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg";
  let buffer: Buffer = Buffer.from(await res.arrayBuffer());
  if (watermark) {
    try {
      buffer = await applyWatermark(buffer);
    } catch (err) {
      console.error("[persistImageToStorage] watermarking failed, storing unwatermarked:", err);
    }
  }
  const path = `${tenantId}/${Date.now()}-${randomUUID()}.${ext}`;

  const { error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(path, buffer, { contentType, upsert: false });

  if (error) throw new Error(`Storage upload failed: ${error.message}`);

  const { data: publicUrlData } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);
  return publicUrlData.publicUrl;
}

const MAX_UPLOAD_IMAGE_BYTES = 8 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

/**
 * Uploads a shop-provided photo (a real file, not a generated image) to
 * Storage under `{folder}/{tenantId}/…`. Separate from persistImageToStorage
 * because the source here is an untrusted upload, not a URL we control —
 * validated for type and size before it touches Storage.
 */
async function uploadUserImage(
  supabase: SupabaseClient,
  folder: string,
  tenantId: string,
  file: File
): Promise<string> {
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    throw new Error("Image must be JPEG, PNG, or WebP.");
  }
  if (file.size > MAX_UPLOAD_IMAGE_BYTES) {
    throw new Error("Image must be 8MB or smaller.");
  }

  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const path = `${folder}/${tenantId}/${Date.now()}-${randomUUID()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(path, buffer, { contentType: file.type, upsert: false });

  if (error) throw new Error(`Storage upload failed: ${error.message}`);

  const { data: publicUrlData } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);
  return publicUrlData.publicUrl;
}

export function uploadPortfolioImage(supabase: SupabaseClient, tenantId: string, file: File): Promise<string> {
  return uploadUserImage(supabase, "portfolio", tenantId, file);
}

/** A customer/shop-supplied reference photo used to guide generation (FLUX Kontext), not a portfolio post. */
export function uploadReferenceImage(supabase: SupabaseClient, tenantId: string, file: File): Promise<string> {
  return uploadUserImage(supabase, "reference", tenantId, file);
}

export function uploadShopProfileImage(
  supabase: SupabaseClient,
  tenantId: string,
  kind: "logo" | "cover",
  file: File
): Promise<string> {
  return uploadUserImage(supabase, `shop-profile-${kind}`, tenantId, file);
}

const MAX_UPLOAD_VIDEO_BYTES = 50 * 1024 * 1024;
const ALLOWED_VIDEO_TYPES = new Set(["video/mp4", "video/quicktime", "video/webm"]);

/** Uploads a shop-provided video file (raw upload, not AI-generated) to Storage. */
export async function uploadPortfolioVideo(
  supabase: SupabaseClient,
  tenantId: string,
  file: File
): Promise<string> {
  if (!ALLOWED_VIDEO_TYPES.has(file.type)) {
    throw new Error("Video must be MP4, MOV, or WebM.");
  }
  if (file.size > MAX_UPLOAD_VIDEO_BYTES) {
    throw new Error("Video must be 50MB or smaller.");
  }

  const ext = file.type === "video/webm" ? "webm" : file.type === "video/quicktime" ? "mov" : "mp4";
  const path = `portfolio-video/${tenantId}/${Date.now()}-${randomUUID()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(path, buffer, { contentType: file.type, upsert: false });

  if (error) throw new Error(`Storage upload failed: ${error.message}`);

  const { data: publicUrlData } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);
  return publicUrlData.publicUrl;
}

/**
 * Downloads a fal.ai-generated video and re-uploads it to Storage, so the
 * URL saved in `portfolio_items.video_url` stays valid indefinitely (same
 * reasoning as persistImageToStorage for generated images).
 */
export async function persistGeneratedVideo(
  supabase: SupabaseClient,
  tenantId: string,
  sourceUrl: string
): Promise<string> {
  let res: Response;
  try {
    res = await fetch(sourceUrl, { signal: AbortSignal.timeout(60_000) });
  } catch (err) {
    if (err instanceof DOMException && err.name === "TimeoutError") {
      throw new Error("Timed out downloading the generated video.");
    }
    throw new Error(`Failed to download generated video: ${(err as Error).message}`);
  }
  if (!res.ok) throw new Error(`Failed to download generated video: ${res.status}`);

  const contentType = res.headers.get("content-type") ?? "video/mp4";
  const buffer = Buffer.from(await res.arrayBuffer());
  const path = `portfolio-video/${tenantId}/${Date.now()}-${randomUUID()}.mp4`;

  const { error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(path, buffer, { contentType, upsert: false });

  if (error) throw new Error(`Storage upload failed: ${error.message}`);

  const { data: publicUrlData } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);
  return publicUrlData.publicUrl;
}

/** Uploads a platform-reformatted video (see lib/video-export.ts) to Storage and returns its public URL. */
export async function persistExportedVideo(
  supabase: SupabaseClient,
  tenantId: string,
  buffer: Buffer
): Promise<string> {
  const path = `social-export/${tenantId}/${Date.now()}-${randomUUID()}.mp4`;

  const { error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(path, buffer, { contentType: "video/mp4", upsert: false });

  if (error) throw new Error(`Storage upload failed: ${error.message}`);

  const { data: publicUrlData } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);
  return publicUrlData.publicUrl;
}
