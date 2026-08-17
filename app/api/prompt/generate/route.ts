import { NextRequest, NextResponse } from "next/server";
import { requireTenant } from "@/lib/supabase";
import { withErrorHandling, Errors, AppError } from "@/lib/api-error";
import { buildFluxPrompt } from "@/lib/claude-prompt";
import type { Category, Material } from "@/types/domain";

interface PromptRequestBody {
  category_id: string;
  metal_material_id: string;
  gemstone_material_ids: string[];
  finish_material_id: string | null;
}

export const POST = withErrorHandling(async (req: NextRequest) => {
  const { supabase } = await requireTenant(req);

  const body: PromptRequestBody = await req.json().catch(() => {
    throw Errors.badRequest("Request body must be valid JSON.");
  });
  if (!body.category_id || !body.metal_material_id) {
    throw Errors.badRequest("category_id and metal_material_id are required.");
  }

  const [{ data: category, error: catErr }, { data: materials, error: matErr }] =
    await Promise.all([
      supabase.from("categories").select("*").eq("id", body.category_id).single<Category>(),
      supabase
        .from("materials")
        .select("*")
        .in("id", [
          body.metal_material_id,
          ...body.gemstone_material_ids,
          ...(body.finish_material_id ? [body.finish_material_id] : []),
        ])
        .returns<Material[]>(),
    ]);

  if (catErr || !category) throw Errors.notFound("Category");
  if (matErr || !materials) throw new AppError(400, "Could not resolve materials.", "bad_request");

  const metal = materials.find((m) => m.id === body.metal_material_id);
  if (!metal) throw Errors.badRequest("Selected metal material was not found.");

  const gemstones = materials.filter((m) => body.gemstone_material_ids.includes(m.id));
  const finish = materials.find((m) => m.id === body.finish_material_id) ?? null;

  let prompt: string;
  try {
    prompt = await buildFluxPrompt({ category, metal, gemstones, finish });
  } catch (err) {
    console.error("[prompt/generate] Claude call failed:", err);
    throw Errors.upstream("Prompt generation");
  }

  return NextResponse.json({ prompt });
});
