"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useCustomerAuth } from "@/lib/customer-auth-context";
import { ChatThread } from "@/components/chat/ChatThread";
import { fetchConversations, fetchShopProfile, type ConversationSummary } from "@/lib/api-client";
import type { Category, Material } from "@/types/domain";

export default function CustomerConversationPage() {
  const params = useParams<{ id: string }>();
  const { accessToken, customer } = useCustomerAuth();

  const [conversation, setConversation] = useState<ConversationSummary | null>(null);
  const [catalog, setCatalog] = useState<{ categories: Category[]; materials: Material[] } | null>(null);
  const [returnsAccepted, setReturnsAccepted] = useState<boolean | undefined>(undefined);
  const [returnPolicyNote, setReturnPolicyNote] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const conversations = await fetchConversations(accessToken, "customer");
        const found = conversations.find((c) => c.id === params.id);
        if (!found) {
          setError("Conversation not found.");
          return;
        }
        setConversation(found);

        const shopProfile = await fetchShopProfile(found.tenant_id);
        setCatalog(shopProfile.catalog);
        setReturnsAccepted(shopProfile.returns_accepted);
        setReturnPolicyNote(shopProfile.return_policy_note);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load this conversation.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [accessToken, params.id]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-pearl">
        <p className="font-mono text-xs uppercase tracking-widest text-stone">Loading…</p>
      </div>
    );
  }

  if (error || !conversation) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 bg-pearl px-6 text-center">
        <p className="font-display text-lg text-ink">{error ?? "Conversation not found"}</p>
        <a href="/customer/messages" className="text-xs text-gold hover:underline">← Back to messages</a>
      </div>
    );
  }

  return (
    <ChatThread
      accessToken={accessToken}
      conversationId={conversation.id}
      viewerRole="customer"
      viewerId={customer.user_id}
      headerTitle={conversation.tenants?.company_name ?? "Shop"}
      catalog={catalog ?? undefined}
      returnsAccepted={returnsAccepted}
      returnPolicyNote={returnPolicyNote}
    />
  );
}
