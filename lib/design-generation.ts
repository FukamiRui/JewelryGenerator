import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Errors, AppError } from "@/lib/api-error";
import { buildFluxPrompt } from "@/lib/claude-prompt";
import { generateJewelryImages, generateJewelryImageFromReference } from "@/lib/flux-image";
import { calculatePrice } from "@/lib/pricing";
import { hashSelection, findCachedDesign, persistImageToStorage, tenantNeedsWatermark } from "@/lib/image-cache";
import { getServiceClient } from "@/lib/supabase";
import { MULTI_ANGLE_CREDIT_COST } from "@/lib/credits";
import type { Category, Material, GoldRate, MetalCode, DesignSelection } from "@/types/domain";

const ANGLE_INSTRUCTIONS = {
  front: "Show this exact piece of jewelry from a straight-on front view, centered studio product photography angle.",
  side: "Show this exact piece of jewelry from a side profile view, rotated 90 degrees to reveal the side silhouette.",
  diagonal: "Show this exact piece of jewelry from a three-quarter diagonal angle, a dynamic perspective view.",
  bottom: "Show this exact piece of jewelry from below, revealing the underside and setting structure.",
} as const;

export type DesignAngle = keyof typeof ANGLE_INSTRUCTIONS;
const ANGLES: DesignAngle[] = ["front", "side", "diagonal", "bottom"];

export interface AngleView {
  angle: DesignAngle;
  designId: string;
  imageUrl: string;
}

export interface GenerateForTenantResult {
  designId: string;
  imageUrl: string;
  prompt: string;
  price: ReturnType<typeof calculatePrice>;
  shareToken: string;
  cached: boolean;
}

interface SelectionContext {
  category: Category;
  metal: Material;
  gemstones: Material[];
  finish: Material | null;
  price: ReturnType<typeof calculatePrice>;
}

/** Resolves + validates a selection's category/materials/spot rates and prices it — shared by text and reference-guided generation. */
async function resolveSelectionContext(
  supabase: SupabaseClient,
  selection: DesignSelection
): Promise<SelectionContext> {
  const materialIds = [
    selection.metal_material_id,
    ...selection.gemstone_material_ids,
    ...(selection.finish_material_id ? [selection.finish_material_id] : []),
  ];

  const [
    { data: category, error: catErr },
    { data: materials, error: matErr },
    { data: rateRows, error: rateErr },
  ] = await Promise.all([
    supabase.from("categories").select("*").eq("id", selection.category_id).single<Category>(),
    supabase.from("materials").select("*").in("id", materialIds).returns<Material[]>(),
    supabase
      .from("gold_rates")
      .select("metal_code, price_usd_per_gram, fetched_at")
      .order("fetched_at", { ascending: false })
      .limit(3)
      .returns<GoldRate[]>(),
  ]);

  if (catErr || !category) throw Errors.notFound("Category");
  if (matErr || !materials) throw new AppError(400, "Could not resolve selected materials.", "bad_request");

  const metal = materials.find((m) => m.id === selection.metal_material_id);
  if (!metal) throw Errors.badRequest("Selected metal material was not found.");

  const gemstones = materials.filter((m) => selection.gemstone_material_ids.includes(m.id));
  const finish = materials.find((m) => m.id === selection.finish_material_id) ?? null;

  const manualPricing =
    selection.manual_material_cost_usd !== undefined && selection.manual_profit_usd !== undefined;

  // The automatic calculation needs a live spot-rate cache; manual pricing
  // doesn't touch it at all, so a momentarily empty cache shouldn't block it.
  if (!manualPricing && (rateErr || !rateRows || rateRows.length === 0)) {
    throw Errors.upstream("Spot price cache");
  }
  const goldRates = Object.fromEntries((rateRows ?? []).map((r) => [r.metal_code, r])) as Record<
    MetalCode,
    GoldRate
  >;

  const price = calculatePrice({
    category,
    metal,
    gemstones,
    estimatedWeightGrams: selection.estimated_weight_grams,
    goldRates,
    manualMaterialCostUsd: selection.manual_material_cost_usd,
    manualProfitUsd: selection.manual_profit_usd,
  });

  return { category, metal, gemstones, finish, price };
}

export async function generateDesignForTenant(
  supabase: SupabaseClient,
  tenantId: string,
  selection: DesignSelection
): Promise<GenerateForTenantResult> {
  const { category, metal, gemstones, finish, price } = await resolveSelectionContext(supabase, selection);

  const service = getServiceClient();
  const selectionHash = hashSelection(selection);

  const cached = await findCachedDesign(supabase, tenantId, selectionHash);

  let imageUrl: string;
  let prompt: string;

  if (cached) {
    imageUrl = cached.generated_image_url!;
    prompt = cached.generated_prompt!;
  } else {
    try {
      prompt = await buildFluxPrompt({
        category,
        metal,
        gemstones,
        finish,
        sizeNote: selection.size_note,
        fabricationNote: selection.fabrication_note,
      });
    } catch (err) {
      console.error("[generateDesignForTenant] prompt generation failed:", err);
      throw Errors.upstream("Prompt generation");
    }

    let rawImageUrls: string[];
    try {
      rawImageUrls = await generateJewelryImages(prompt, { numImages: 1 });
    } catch (err) {
      console.error("[generateDesignForTenant] FLUX image generation failed:", err);
      throw Errors.upstream("Image generation");
    }

    try {
      const watermark = await tenantNeedsWatermark(supabase, tenantId);
      imageUrl = await persistImageToStorage(service, tenantId, rawImageUrls[0], watermark);
    } catch (err) {
      console.error("[generateDesignForTenant] Storage upload failed:", err);
      throw Errors.upstream("Image storage");
    }
  }

  const { data: design, error: insertErr } = await supabase
    .from("designs")
    .insert({
      tenant_id: tenantId,
      category_id: selection.category_id,
      customer_name: selection.customer_name?.trim() || null,
      is_personal: selection.is_personal ?? false,
      selected_materials_json: selection,
      selection_hash: selectionHash,
      generated_prompt: prompt,
      generated_image_url: imageUrl,
      calculated_price_usd: price.total_usd,
      status: "completed",
    })
    .select("id, share_token")
    .single();

  if (insertErr || !design) {
    throw new AppError(500, "Design was generated but could not be saved. Please try again.", "internal_error");
  }

  const { error: creditErr } = await service.rpc("increment_credit_usage", {
    p_tenant_id: tenantId,
  });
  if (creditErr) console.error("[generateDesignForTenant] credit increment failed:", creditErr);

  return {
    designId: design.id,
    imageUrl,
    prompt,
    price,
    shareToken: design.share_token,
    cached: Boolean(cached),
  };
}

/**
 * Image-guided generation: takes a reference photo (already uploaded to
 * Storage) plus the same category/material selection, and produces a
 * design guided by that reference via FLUX Kontext instead of text alone.
 * Not selection-hash cached — a reference photo makes each result
 * effectively unique, so there's nothing meaningful to cache against.
 */
export async function generateDesignFromReferenceForTenant(
  supabase: SupabaseClient,
  tenantId: string,
  selection: DesignSelection,
  referenceImageUrl: string,
  note: string | null
): Promise<GenerateForTenantResult> {
  const { category, metal, gemstones, finish, price } = await resolveSelectionContext(supabase, selection);
  const service = getServiceClient();

  let basePrompt: string;
  try {
    basePrompt = await buildFluxPrompt({
      category,
      metal,
      gemstones,
      finish,
      sizeNote: selection.size_note,
      fabricationNote: selection.fabrication_note,
    });
  } catch (err) {
    console.error("[generateDesignFromReferenceForTenant] prompt generation failed:", err);
    throw Errors.upstream("Prompt generation");
  }

  const prompt = note?.trim()
    ? `${basePrompt} Match the style of the reference image. ${note.trim()}`
    : `${basePrompt} Match the style of the reference image.`;

  let rawImageUrl: string;
  try {
    rawImageUrl = await generateJewelryImageFromReference(referenceImageUrl, prompt);
  } catch (err) {
    console.error("[generateDesignFromReferenceForTenant] FLUX Kontext generation failed:", err);
    throw Errors.upstream("Reference-guided image generation");
  }

  let imageUrl: string;
  try {
    const watermark = await tenantNeedsWatermark(supabase, tenantId);
    imageUrl = await persistImageToStorage(service, tenantId, rawImageUrl, watermark);
  } catch (err) {
    console.error("[generateDesignFromReferenceForTenant] Storage upload failed:", err);
    throw Errors.upstream("Image storage");
  }

  const { data: design, error: insertErr } = await supabase
    .from("designs")
    .insert({
      tenant_id: tenantId,
      category_id: selection.category_id,
      customer_name: selection.customer_name?.trim() || null,
      is_personal: selection.is_personal ?? false,
      selected_materials_json: selection,
      selection_hash: null,
      generated_prompt: prompt,
      generated_image_url: imageUrl,
      calculated_price_usd: price.total_usd,
      status: "completed",
    })
    .select("id, share_token")
    .single();

  if (insertErr || !design) {
    throw new AppError(500, "Design was generated but could not be saved. Please try again.", "internal_error");
  }

  const { error: creditErr } = await service.rpc("increment_credit_usage", {
    p_tenant_id: tenantId,
  });
  if (creditErr) console.error("[generateDesignFromReferenceForTenant] credit increment failed:", creditErr);

  return {
    designId: design.id,
    imageUrl,
    prompt,
    price,
    shareToken: design.share_token,
    cached: false,
  };
}

/**
 * "Generate 4 angles": takes an existing generated design and produces
 * front/side/diagonal/bottom views of the same piece via FLUX Kontext,
 * using the source image as the reference and the source's own stored
 * prompt as the base (no extra Groq call needed). Bundled at
 * MULTI_ANGLE_CREDIT_COST credits total, not charged per image.
 */
export async function generateMultiAngleViews(
  supabase: SupabaseClient,
  tenantId: string,
  sourceDesignId: string
): Promise<{ angleSetId: string; views: AngleView[] }> {
  const { data: source, error: sourceErr } = await supabase
    .from("designs")
    .select(
      "id, category_id, customer_name, is_personal, selected_materials_json, generated_prompt, generated_image_url, calculated_price_usd"
    )
    .eq("id", sourceDesignId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (sourceErr) throw new AppError(500, "Could not look up that design.", "internal_error");
  if (!source || !source.generated_image_url || !source.generated_prompt) {
    throw Errors.badRequest("That design isn't available to generate angles from.");
  }

  const service = getServiceClient();
  const watermark = await tenantNeedsWatermark(supabase, tenantId);
  const angleSetId = randomUUID();
  const views: AngleView[] = [];

  for (const angle of ANGLES) {
    const prompt = `${source.generated_prompt} ${ANGLE_INSTRUCTIONS[angle]}`;

    let rawImageUrl: string;
    try {
      rawImageUrl = await generateJewelryImageFromReference(source.generated_image_url, prompt);
    } catch (err) {
      console.error(`[generateMultiAngleViews] FLUX Kontext generation failed for angle=${angle}:`, err);
      throw Errors.upstream(`Angle-view generation (${angle})`);
    }

    let imageUrl: string;
    try {
      imageUrl = await persistImageToStorage(service, tenantId, rawImageUrl, watermark);
    } catch (err) {
      console.error(`[generateMultiAngleViews] Storage upload failed for angle=${angle}:`, err);
      throw Errors.upstream("Image storage");
    }

    const { data: design, error: insertErr } = await supabase
      .from("designs")
      .insert({
        tenant_id: tenantId,
        category_id: source.category_id,
        customer_name: source.customer_name,
        is_personal: source.is_personal,
        selected_materials_json: source.selected_materials_json,
        selection_hash: null,
        generated_prompt: prompt,
        generated_image_url: imageUrl,
        calculated_price_usd: source.calculated_price_usd,
        status: "completed",
        angle,
        angle_set_id: angleSetId,
      })
      .select("id")
      .single();

    if (insertErr || !design) {
      throw new AppError(500, "An angle view was generated but could not be saved. Please try again.", "internal_error");
    }

    views.push({ angle, designId: design.id, imageUrl });
  }

  const { error: creditErr } = await service.rpc("increment_credit_usage", {
    p_tenant_id: tenantId,
    p_amount: MULTI_ANGLE_CREDIT_COST,
  });
  if (creditErr) console.error("[generateMultiAngleViews] credit increment failed:", creditErr);

  return { angleSetId, views };
}
