import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase";
import { withErrorHandling, Errors, AppError } from "@/lib/api-error";
import { checkForExternalContactInfo } from "@/lib/content-filter";

interface RouteParams {
  params: { id: string };
}

async function resolveSenderRole(
  supabase: Awaited<ReturnType<typeof requireUser>>["supabase"],
  userId: string,
  conversationId: string
): Promise<{ senderType: "customer" | "shop"; conversation: { customer_id: string; tenant_id: string; status: string } }> {
  const { data: conversation, error } = await supabase
    .from("conversations")
    .select("customer_id, tenant_id, status")
    .eq("id", conversationId)
    .single();

  if (error || !conversation) throw Errors.notFound("Conversation");

  if (conversation.customer_id === userId) {
    return { senderType: "customer", conversation };
  }

  return { senderType: "shop", conversation };
}

export const GET = withErrorHandling(async (req: NextRequest, { params }: RouteParams) => {
  const { supabase } = await requireUser(req);

  const { data: messages, error } = await supabase
    .from("messages")
    .select("id, sender_type, sender_id, body, design_id, created_at, designs(generated_image_url, calculated_price_usd)")
    .eq("conversation_id", params.id)
    .order("created_at", { ascending: true });

  if (error) throw new AppError(500, "Could not load messages.", "internal_error");
  return NextResponse.json({ messages });
});

interface SendMessageBody {
  body: string;
}

export const POST = withErrorHandling(async (req: NextRequest, { params }: RouteParams) => {
  const { supabase, userId } = await requireUser(req);

  const body: SendMessageBody = await req.json().catch(() => {
    throw Errors.badRequest("Request body must be valid JSON.");
  });
  const text = body.body?.trim();
  if (!text) throw Errors.badRequest("Message body cannot be empty.");
  if (text.length > 4000) throw Errors.badRequest("Message is too long (4000 character limit).");

  const filterResult = checkForExternalContactInfo(text);
  if (filterResult.blocked) throw Errors.contactInfoBlocked(filterResult.reason!);

  const { senderType, conversation } = await resolveSenderRole(supabase, userId, params.id);
  if (conversation.status === "closed") {
    throw Errors.badRequest("This conversation is closed.");
  }

  const { data: message, error } = await supabase
    .from("messages")
    .insert({
      conversation_id: params.id,
      sender_type: senderType,
      sender_id: userId,
      body: text,
    })
    .select("id, sender_type, sender_id, body, created_at")
    .single();

  if (error || !message) throw new AppError(500, "Could not send message.", "internal_error");

  return NextResponse.json({ message }, { status: 201 });
});
