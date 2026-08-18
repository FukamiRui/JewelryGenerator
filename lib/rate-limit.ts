import type { SupabaseClient } from "@supabase/supabase-js";
import { Errors } from "@/lib/api-error";

export interface RateLimitSettings {
  min_seconds_between_generations: number;
  max_generations_per_conversation_per_day: number;
  max_daily_credit_share_per_customer_pct: number;
}

const MIN_SHOP_VOLUME_FOR_SHARE_CHECK = 10;

function startOfTodayIso(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export async function checkGenerationRateLimit(
  serviceClient: SupabaseClient,
  settings: RateLimitSettings,
  tenantId: string,
  conversationId: string,
  customerId: string
): Promise<void> {
  const todayIso = startOfTodayIso();

  const { data: lastGen } = await serviceClient
    .from("messages")
    .select("created_at")
    .eq("conversation_id", conversationId)
    .eq("sender_type", "customer")
    .not("design_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lastGen) {
    const secondsSince = (Date.now() - new Date(lastGen.created_at).getTime()) / 1000;
    if (secondsSince < settings.min_seconds_between_generations) {
      const wait = Math.ceil(settings.min_seconds_between_generations - secondsSince);
      throw Errors.rateLimited(`Please wait ${wait}s before generating another design.`);
    }
  }

  const { count: conversationCountToday } = await serviceClient
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("conversation_id", conversationId)
    .eq("sender_type", "customer")
    .not("design_id", "is", null)
    .gte("created_at", todayIso);

  if ((conversationCountToday ?? 0) >= settings.max_generations_per_conversation_per_day) {
    throw Errors.rateLimited(
      `This conversation has reached today's limit of ${settings.max_generations_per_conversation_per_day} generations. Please try again tomorrow.`
    );
  }

  const { data: shopConversations } = await serviceClient
    .from("conversations")
    .select("id")
    .eq("tenant_id", tenantId);

  const conversationIds = (shopConversations ?? []).map((c) => c.id);
  if (conversationIds.length === 0) return;

  const { data: todaysGenerations } = await serviceClient
    .from("messages")
    .select("sender_id")
    .in("conversation_id", conversationIds)
    .eq("sender_type", "customer")
    .not("design_id", "is", null)
    .gte("created_at", todayIso);

  const shopTotalToday = todaysGenerations?.length ?? 0;
  if (shopTotalToday < MIN_SHOP_VOLUME_FOR_SHARE_CHECK) return;

  const customerTotalToday = (todaysGenerations ?? []).filter((m) => m.sender_id === customerId).length;
  const sharePct = (customerTotalToday / shopTotalToday) * 100;

  if (sharePct >= settings.max_daily_credit_share_per_customer_pct) {
    throw Errors.rateLimited(
      "You've reached today's fair-use limit for this shop. Please try again tomorrow."
    );
  }
}

// Staff-facing generation (Simulator, Portfolio video) has no per-conversation
// context to key a limit off of, and no UI "please wait" affordance — just a
// minimum cooldown between a tenant's own generations, enough to stop a
// scripted loop without ever bothering a person clicking the button by hand.
// DB-backed (not in-memory) so it holds up across serverless instances.
const STAFF_GENERATION_COOLDOWN_SECONDS = 2;

export async function checkTenantGenerationCooldown(
  supabase: SupabaseClient,
  tenantId: string,
  table: "designs" | "portfolio_items"
): Promise<void> {
  const { data: last } = await supabase
    .from(table)
    .select("created_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!last) return;

  const secondsSince = (Date.now() - new Date(last.created_at).getTime()) / 1000;
  if (secondsSince < STAFF_GENERATION_COOLDOWN_SECONDS) {
    throw Errors.rateLimited("Please wait a moment before generating again.");
  }
}
