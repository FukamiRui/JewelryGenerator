import { NextRequest, NextResponse } from "next/server";
import { requireTenant } from "@/lib/supabase";
import { withErrorHandling, Errors, AppError } from "@/lib/api-error";
import { uploadShopProfileImage } from "@/lib/image-cache";

const TENANT_FIELDS =
  "id, company_name, plan, monthly_credit_limit, credits_used_this_month, logo_url, cover_image_url, bio, location, specialty_materials, returns_accepted, return_policy_note";

// Uploads a shop's logo (circular avatar) or cover/banner photo.
export const POST = withErrorHandling(async (req: NextRequest) => {
  const { supabase, tenantId } = await requireTenant(req);

  const form = await req.formData().catch(() => {
    throw Errors.badRequest("Request body must be multipart/form-data.");
  });

  const kind = form.get("kind");
  if (kind !== "logo" && kind !== "cover") {
    throw Errors.badRequest("kind must be 'logo' or 'cover'.");
  }

  const file = form.get("image");
  if (!(file instanceof File) || file.size === 0) {
    throw Errors.badRequest("An image file is required.");
  }

  let imageUrl: string;
  try {
    imageUrl = await uploadShopProfileImage(supabase, tenantId, kind, file);
  } catch (err) {
    throw Errors.badRequest(err instanceof Error ? err.message : "Could not upload that image.");
  }

  const column = kind === "logo" ? "logo_url" : "cover_image_url";
  const { data: tenant, error } = await supabase
    .from("tenants")
    .update({ [column]: imageUrl })
    .eq("id", tenantId)
    .select(TENANT_FIELDS)
    .single();

  if (error || !tenant) throw new AppError(500, "Uploaded, but could not save it to your profile.", "internal_error");

  return NextResponse.json({ tenant });
});
