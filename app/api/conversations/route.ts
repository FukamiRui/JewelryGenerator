import { NextRequest, NextResponse } from "next/server";
import { requireCustomer, requireUser } from "@/lib/supabase";
import { withErrorHandling, Errors, AppError } from "@/lib/api-error";

export const GET = withErrorHandling(async (req: NextRequest) => {
  const { supabase, userId } = await requireUser(req);
  const role = req.nextUrl.searchParams.get("role");

  let query = supabase
    .from("conversations")
    .select(
      "id, tenant_id, customer_id, status, last_message_at, created_at, tenants(company_name, logo_url), customers(display_name, avatar_url, email_verified)"
    )
    .order("last_message_at", { ascending: false });

  if (role === "shop") {
    // RLS already restricts this to conversations belonging to the caller's tenant(s).
  } else {
    query = query.eq("customer_id", userId);
  }

  const { data, error } = await query;
  if (error) throw new AppError(500, "Could not load conversations.", "internal_error");

  const conversationIds = (data ?? []).map((c) => c.id);
  const previewByConversation = new Map<string, string>();

  if (conversationIds.length > 0) {
    const { data: recentMessages } = await supabase
      .from("messages")
      .select("conversation_id, body, design_id, created_at")
      .in("conversation_id", conversationIds)
      .order("created_at", { ascending: false })
      .limit(200);

    for (const m of recentMessages ?? []) {
      if (previewByConversation.has(m.conversation_id)) continue;
      previewByConversation.set(m.conversation_id, m.body ?? (m.design_id ? "📷 Shared a design" : ""));
    }
  }

  const conversations = (data ?? []).map((c) => ({
    ...c,
    last_message_preview: previewByConversation.get(c.id) ?? null,
  }));

  return NextResponse.json({ conversations });
});

interface StartConversationBody {
  tenant_id: string;
}

export const POST = withErrorHandling(async (req: NextRequest) => {
  const { supabase, customerId } = await requireCustomer(req);

  const body: StartConversationBody = await req.json().catch(() => {
    throw Errors.badRequest("Request body must be valid JSON.");
  });
  if (!body.tenant_id) throw Errors.badRequest("tenant_id is required.");

  const { data: tenant, error: tenantErr } = await supabase
    .from("tenants")
    .select("id")
    .eq("id", body.tenant_id)
    .eq("is_public", true)
    .maybeSingle();
  if (tenantErr) throw new AppError(500, "Could not look up that shop.", "internal_error");
  if (!tenant) throw Errors.notFound("Shop");

  const { data: existing } = await supabase
    .from("conversations")
    .select("id")
    .eq("customer_id", customerId)
    .eq("tenant_id", body.tenant_id)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ conversation_id: existing.id });
  }

  const { data: created, error: insertErr } = await supabase
    .from("conversations")
    .insert({ customer_id: customerId, tenant_id: body.tenant_id })
    .select("id")
    .single();

  if (insertErr || !created) {
    throw new AppError(500, "Could not start a conversation with this shop.", "internal_error");
  }

  return NextResponse.json({ conversation_id: created.id }, { status: 201 });
});
