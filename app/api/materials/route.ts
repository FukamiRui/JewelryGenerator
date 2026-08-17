import { NextRequest, NextResponse } from "next/server";
import { requireTenant } from "@/lib/supabase";
import { withErrorHandling, Errors, AppError } from "@/lib/api-error";
import type { MaterialType } from "@/types/domain";

const VALID_TYPES: MaterialType[] = ["metal", "gemstone", "finish"];

export const GET = withErrorHandling(async (req: NextRequest) => {
  const { supabase } = await requireTenant(req);

  const typeFilter = req.nextUrl.searchParams.get("type") as MaterialType | null;
  if (typeFilter && !VALID_TYPES.includes(typeFilter)) {
    throw Errors.badRequest(`type must be one of: ${VALID_TYPES.join(", ")}`);
  }

  let query = supabase.from("materials").select("*").eq("is_active", true);
  if (typeFilter) query = query.eq("material_type", typeFilter);

  const { data, error } = await query.order("name", { ascending: true });
  if (error) throw new AppError(500, "Could not load materials.", "internal_error");
  return NextResponse.json({ materials: data });
});

interface CreateMaterialBody {
  material_type: MaterialType;
  name: string;
  ai_prompt_tag: string;
  density?: number;
  cost_per_gram_or_carat?: number;
  price_markup_ratio?: number;
}

export const POST = withErrorHandling(async (req: NextRequest) => {
  const { supabase, tenantId } = await requireTenant(req);

  const body: CreateMaterialBody = await req.json().catch(() => {
    throw Errors.badRequest("Request body must be valid JSON.");
  });
  if (!body.name?.trim() || !body.ai_prompt_tag?.trim() || !body.material_type) {
    throw Errors.badRequest("name, ai_prompt_tag, and material_type are required.");
  }
  if (!VALID_TYPES.includes(body.material_type)) {
    throw Errors.badRequest(`material_type must be one of: ${VALID_TYPES.join(", ")}`);
  }

  const { data, error } = await supabase
    .from("materials")
    .insert({
      tenant_id: tenantId,
      material_type: body.material_type,
      name: body.name.trim(),
      ai_prompt_tag: body.ai_prompt_tag.trim(),
      density: body.density ?? null,
      cost_per_gram_or_carat: body.cost_per_gram_or_carat ?? null,
      price_markup_ratio: body.price_markup_ratio ?? 1.5,
    })
    .select()
    .single();

  if (error) throw new AppError(400, "Could not create material.", "bad_request");
  return NextResponse.json({ material: data }, { status: 201 });
});
