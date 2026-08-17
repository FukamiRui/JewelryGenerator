import { NextRequest, NextResponse } from "next/server";
import { requireTenant } from "@/lib/supabase";
import { withErrorHandling, Errors, AppError } from "@/lib/api-error";

export const GET = withErrorHandling(async (req: NextRequest) => {
  const { supabase } = await requireTenant(req);
  // RLS scopes this to `tenant_id IS NULL OR tenant_id = caller's tenant`.
  const { data, error } = await supabase
    .from("categories")
    .select("*")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (error) throw new AppError(500, "Could not load categories.", "internal_error");
  return NextResponse.json({ categories: data });
});

interface CreateCategoryBody {
  name: string;
  ai_prompt_tag: string;
  base_processing_cost?: number;
  sort_order?: number;
}

export const POST = withErrorHandling(async (req: NextRequest) => {
  const { supabase, tenantId } = await requireTenant(req);

  const body: CreateCategoryBody = await req.json().catch(() => {
    throw Errors.badRequest("Request body must be valid JSON.");
  });
  if (!body.name?.trim() || !body.ai_prompt_tag?.trim()) {
    throw Errors.badRequest("name and ai_prompt_tag are required.");
  }

  const { data, error } = await supabase
    .from("categories")
    .insert({
      tenant_id: tenantId, // resolved server-side — never trusted from the client
      name: body.name.trim(),
      ai_prompt_tag: body.ai_prompt_tag.trim(),
      base_processing_cost: body.base_processing_cost ?? 0,
      sort_order: body.sort_order ?? 0,
    })
    .select()
    .single();

  if (error) throw new AppError(400, "Could not create category.", "bad_request");
  return NextResponse.json({ category: data }, { status: 201 });
});
