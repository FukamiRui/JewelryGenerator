import { NextRequest, NextResponse } from "next/server";
import { requireCustomer, getServiceClient } from "@/lib/supabase";
import { withErrorHandling, Errors, AppError } from "@/lib/api-error";

interface RouteParams {
  params: { id: string };
}

export const GET = withErrorHandling(async (_req: NextRequest, { params }: RouteParams) => {
  const service = getServiceClient();

  const { data: comments, error } = await service
    .from("portfolio_comments")
    .select("id, customer_id, body, created_at, customers(display_name, avatar_url)")
    .eq("portfolio_item_id", params.id)
    .order("created_at", { ascending: true })
    .limit(200);

  if (error) throw new AppError(500, "Could not load comments.", "internal_error");
  return NextResponse.json({ comments: comments ?? [] });
});

interface CreateCommentBody {
  body: string;
}

export const POST = withErrorHandling(async (req: NextRequest, { params }: RouteParams) => {
  const { supabase, customerId } = await requireCustomer(req);

  const body: CreateCommentBody = await req.json().catch(() => {
    throw Errors.badRequest("Request body must be valid JSON.");
  });
  const text = body.body?.trim();
  if (!text) throw Errors.badRequest("Comment cannot be empty.");
  if (text.length > 500) throw Errors.badRequest("Comment is too long (500 character limit).");

  const { data: item } = await supabase.from("portfolio_items").select("id").eq("id", params.id).maybeSingle();
  if (!item) throw Errors.notFound("Portfolio item");

  const { data: comment, error } = await supabase
    .from("portfolio_comments")
    .insert({ portfolio_item_id: params.id, customer_id: customerId, body: text })
    .select("id, customer_id, body, created_at, customers(display_name, avatar_url)")
    .single();

  if (error || !comment) throw new AppError(500, "Could not post your comment.", "internal_error");

  return NextResponse.json({ comment }, { status: 201 });
});
