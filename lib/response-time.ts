import type { SupabaseClient } from "@supabase/supabase-js";

const WINDOW_DAYS = 90;
const MAX_MESSAGES = 3000; // safety cap for very active shops

/**
 * Average time from a customer's message to the shop's next reply in the
 * same conversation, over the last WINDOW_DAYS. A trust signal shown on the
 * shop's public profile — computed from real message history rather than a
 * shop-declared claim, so it can't be gamed.
 *
 * Returns null when there isn't enough data yet (new shop, no exchanges).
 */
export async function computeAverageResponseHours(
  service: SupabaseClient,
  tenantId: string
): Promise<number | null> {
  const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data: conversations } = await service
    .from("conversations")
    .select("id")
    .eq("tenant_id", tenantId);

  const conversationIds = (conversations ?? []).map((c) => c.id);
  if (conversationIds.length === 0) return null;

  const { data: messages } = await service
    .from("messages")
    .select("conversation_id, sender_type, created_at")
    .in("conversation_id", conversationIds)
    .gte("created_at", since)
    .order("created_at", { ascending: true })
    .limit(MAX_MESSAGES);

  if (!messages || messages.length === 0) return null;

  const byConversation = new Map<string, { sender_type: string; created_at: string }[]>();
  for (const m of messages) {
    const list = byConversation.get(m.conversation_id) ?? [];
    list.push(m);
    byConversation.set(m.conversation_id, list);
  }

  const responseMs: number[] = [];

  for (const msgs of byConversation.values()) {
    let pendingCustomerAt: number | null = null;
    for (const m of msgs) {
      if (m.sender_type === "customer") {
        if (pendingCustomerAt === null) pendingCustomerAt = new Date(m.created_at).getTime();
      } else if (m.sender_type === "shop" && pendingCustomerAt !== null) {
        responseMs.push(new Date(m.created_at).getTime() - pendingCustomerAt);
        pendingCustomerAt = null;
      }
    }
  }

  if (responseMs.length === 0) return null;

  const avgMs = responseMs.reduce((sum, ms) => sum + ms, 0) / responseMs.length;
  return Math.round((avgMs / (60 * 60 * 1000)) * 10) / 10;
}
