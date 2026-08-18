import { NextRequest, NextResponse } from "next/server";
import { requireTenant } from "@/lib/supabase";
import { withErrorHandling, Errors, AppError } from "@/lib/api-error";
import { generatePortfolioDescription } from "@/lib/portfolio-copy";

interface GenerateDescriptionBody {
  title?: string;
  materials?: string;
  category_name?: string;
}

export const POST = withErrorHandling(async (req: NextRequest) => {
  await requireTenant(req);

  const body: GenerateDescriptionBody = await req.json().catch(() => {
    throw Errors.badRequest("Request body must be valid JSON.");
  });

  let description: string;
  try {
    description = await generatePortfolioDescription({
      title: body.title,
      materials: body.materials,
      categoryName: body.category_name,
    });
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("Give it at least")) {
      throw Errors.badRequest(err.message);
    }
    throw new AppError(502, err instanceof Error ? err.message : "Could not generate a description.", "upstream_error");
  }

  return NextResponse.json({ description });
});
