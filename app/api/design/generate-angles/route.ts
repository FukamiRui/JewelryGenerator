import { NextRequest, NextResponse } from "next/server";
import { requireTenant } from "@/lib/supabase";
import { withErrorHandling, Errors } from "@/lib/api-error";
import { generateMultiAngleViews } from "@/lib/design-generation";
import { MULTI_ANGLE_CREDIT_COST } from "@/lib/credits";
import { checkTenantGenerationCooldown } from "@/lib/rate-limit";

interface GenerateAnglesBody {
  design_id: string;
}

export const POST = withErrorHandling(async (req: NextRequest) => {
  const { supabase, tenantId } = await requireTenant(req);

  const body: GenerateAnglesBody = await req.json().catch(() => {
    throw Errors.badRequest("Request body must be valid JSON.");
  });
  if (!body.design_id) throw Errors.badRequest("design_id is required.");

  const { data: tenant, error: tenantErr } = await supabase
    .from("tenants")
    .select("id, monthly_credit_limit, credits_used_this_month")
    .eq("id", tenantId)
    .single();

  if (tenantErr || !tenant) throw Errors.notFound("Tenant");
  if (tenant.credits_used_this_month + MULTI_ANGLE_CREDIT_COST > tenant.monthly_credit_limit) {
    throw Errors.creditLimitReached();
  }
  await checkTenantGenerationCooldown(supabase, tenantId, "designs");

  const result = await generateMultiAngleViews(supabase, tenantId, body.design_id);

  return NextResponse.json({
    angle_set_id: result.angleSetId,
    views: result.views.map((v) => ({
      angle: v.angle,
      design_id: v.designId,
      generated_image_url: v.imageUrl,
    })),
  });
});
