import { NextRequest, NextResponse } from "next/server";
import { requireTenant } from "@/lib/supabase";
import { withErrorHandling, Errors, AppError } from "@/lib/api-error";

const TENANT_FIELDS =
  "id, company_name, plan, monthly_credit_limit, credits_used_this_month, logo_url, cover_image_url, bio, location, latitude, longitude, specialty_materials, returns_accepted, return_policy_note, max_design_revisions";

const MAX_SPECIALTY_MATERIALS = 20;

export const GET = withErrorHandling(async (req: NextRequest) => {
  const { supabase, tenantId } = await requireTenant(req);

  const { data: tenant, error } = await supabase
    .from("tenants")
    .select(TENANT_FIELDS)
    .eq("id", tenantId)
    .single();

  if (error || !tenant) {
    return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
  }

  return NextResponse.json({ tenant });
});

interface UpdateTenantBody {
  returns_accepted?: boolean;
  return_policy_note?: string | null;
  bio?: string | null;
  location?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  specialty_materials?: string[];
  max_design_revisions?: number;
}

export const PATCH = withErrorHandling(async (req: NextRequest) => {
  const { supabase, tenantId } = await requireTenant(req);

  const body: UpdateTenantBody = await req.json().catch(() => {
    throw Errors.badRequest("Request body must be valid JSON.");
  });

  const update: Record<string, unknown> = {};
  if (body.returns_accepted !== undefined) {
    if (typeof body.returns_accepted !== "boolean") throw Errors.badRequest("returns_accepted must be a boolean.");
    update.returns_accepted = body.returns_accepted;
  }
  if (body.return_policy_note !== undefined) {
    update.return_policy_note = body.return_policy_note?.trim() || null;
  }
  if (body.bio !== undefined) {
    update.bio = body.bio?.trim() || null;
  }
  if (body.location !== undefined) {
    update.location = body.location?.trim() || null;
  }
  if (body.latitude !== undefined || body.longitude !== undefined) {
    if (body.latitude !== null && (typeof body.latitude !== "number" || Math.abs(body.latitude) > 90)) {
      throw Errors.badRequest("latitude must be a number between -90 and 90.");
    }
    if (body.longitude !== null && (typeof body.longitude !== "number" || Math.abs(body.longitude) > 180)) {
      throw Errors.badRequest("longitude must be a number between -180 and 180.");
    }
    update.latitude = body.latitude ?? null;
    update.longitude = body.longitude ?? null;
  }
  if (body.specialty_materials !== undefined) {
    if (!Array.isArray(body.specialty_materials) || body.specialty_materials.some((m) => typeof m !== "string")) {
      throw Errors.badRequest("specialty_materials must be an array of strings.");
    }
    const cleaned = [...new Set(body.specialty_materials.map((m) => m.trim()).filter(Boolean))];
    if (cleaned.length > MAX_SPECIALTY_MATERIALS) {
      throw Errors.badRequest(`specialty_materials can have at most ${MAX_SPECIALTY_MATERIALS} entries.`);
    }
    update.specialty_materials = cleaned;
  }
  if (body.max_design_revisions !== undefined) {
    if (!Number.isInteger(body.max_design_revisions) || body.max_design_revisions < 1 || body.max_design_revisions > 5) {
      throw Errors.badRequest("max_design_revisions must be an integer between 1 and 5.");
    }
    update.max_design_revisions = body.max_design_revisions;
  }
  if (Object.keys(update).length === 0) throw Errors.badRequest("Nothing to update.");

  const { data: tenant, error } = await supabase
    .from("tenants")
    .update(update)
    .eq("id", tenantId)
    .select(TENANT_FIELDS)
    .single();

  if (error || !tenant) throw new AppError(500, "Could not update your store settings.", "internal_error");

  return NextResponse.json({ tenant });
});
