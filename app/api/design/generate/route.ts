import { NextRequest, NextResponse } from "next/server";
import { requireTenant } from "@/lib/supabase";
import { withErrorHandling, Errors } from "@/lib/api-error";
import { generateDesignForTenant } from "@/lib/design-generation";
import { checkTenantGenerationCooldown } from "@/lib/rate-limit";

interface DesignRequestBody {
  category_id: string;
  metal_material_id: string;
  gemstone_material_ids: string[];
  finish_material_id: string | null;
  estimated_weight_grams: number;
  customer_name?: string;
  is_personal?: boolean;
  size_note?: string;
  fabrication_note?: string;
  manual_material_cost_usd?: number;
  manual_profit_usd?: number;
}

export const POST = withErrorHandling(async (req: NextRequest) => {
  const { supabase, tenantId } = await requireTenant(req);

  const body: DesignRequestBody = await req.json().catch(() => {
    throw Errors.badRequest("Request body must be valid JSON.");
  });

  if (!body.category_id || !body.metal_material_id) {
    throw Errors.badRequest("category_id and metal_material_id are required.");
  }
  if (!body.estimated_weight_grams || body.estimated_weight_grams <= 0) {
    throw Errors.badRequest("estimated_weight_grams must be a positive number.");
  }
  if (
    (body.manual_material_cost_usd !== undefined) !== (body.manual_profit_usd !== undefined)
  ) {
    throw Errors.badRequest("Manual pricing needs both material cost and profit.");
  }
  if (
    (body.manual_material_cost_usd !== undefined && body.manual_material_cost_usd < 0) ||
    (body.manual_profit_usd !== undefined && body.manual_profit_usd < 0)
  ) {
    throw Errors.badRequest("Manual pricing values must be zero or greater.");
  }

  const { data: tenant, error: tenantErr } = await supabase
    .from("tenants")
    .select("id, monthly_credit_limit, credits_used_this_month")
    .eq("id", tenantId)
    .single();

  if (tenantErr || !tenant) throw Errors.notFound("Tenant");
  if (tenant.credits_used_this_month >= tenant.monthly_credit_limit) {
    throw Errors.creditLimitReached();
  }
  await checkTenantGenerationCooldown(supabase, tenantId, "designs");

  const result = await generateDesignForTenant(supabase, tenantId, body);

  return NextResponse.json({
    design_id: result.designId,
    generated_image_url: result.imageUrl,
    generated_prompt: result.prompt,
    price: result.price,
    share_token: result.shareToken,
    cached: result.cached,
  });
});
