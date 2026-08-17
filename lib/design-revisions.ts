import type { SupabaseClient } from "@supabase/supabase-js";
import { Errors } from "@/lib/api-error";

export interface RevisionStatus {
  used: number;
  max: number;
  remaining: number;
  blocked: boolean;
}

interface ConversationRevisionFields {
  id: string;
  created_at: string;
  revision_grant_at: string | null;
}

/**
 * Counts self-service design generations the customer has made in this
 * conversation since the later of: the conversation starting, the shop's
 * last revision grant, or the most recent non-cancelled order — an order
 * means the customer settled on something, so a *future* request should
 * get a fresh set of tries, not inherit the old count.
 */
export async function getRevisionStatus(
  supabase: SupabaseClient,
  conversation: ConversationRevisionFields,
  maxDesignRevisions: number
): Promise<RevisionStatus> {
  const { data: latestOrder } = await supabase
    .from("orders")
    .select("created_at")
    .eq("conversation_id", conversation.id)
    .neq("status", "cancelled")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const candidates = [conversation.created_at, conversation.revision_grant_at, latestOrder?.created_at].filter(
    (d): d is string => !!d
  );
  const since = candidates.reduce((latest, d) => (new Date(d) > new Date(latest) ? d : latest));

  const { count } = await supabase
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("conversation_id", conversation.id)
    .eq("sender_type", "customer")
    .not("design_id", "is", null)
    .gte("created_at", since);

  const used = count ?? 0;
  return { used, max: maxDesignRevisions, remaining: Math.max(0, maxDesignRevisions - used), blocked: used >= maxDesignRevisions };
}

export async function requireRevisionAllowance(
  supabase: SupabaseClient,
  conversation: ConversationRevisionFields,
  maxDesignRevisions: number
): Promise<RevisionStatus> {
  const status = await getRevisionStatus(supabase, conversation, maxDesignRevisions);
  if (status.blocked) throw Errors.revisionLimitReached(status.max);
  return status;
}
