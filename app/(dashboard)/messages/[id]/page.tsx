"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { ChatThread } from "@/components/chat/ChatThread";
import { fetchConversations, type ConversationSummary } from "@/lib/api-client";

export default function ShopConversationPage() {
  const params = useParams<{ id: string }>();
  const { accessToken, userId } = useAuth();

  const [conversation, setConversation] = useState<ConversationSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const conversations = await fetchConversations(accessToken, "shop");
        const found = conversations.find((c) => c.id === params.id);
        if (!found) {
          setError("Conversation not found.");
          return;
        }
        setConversation(found);
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
        <a href="/messages" className="text-xs text-gold hover:underline">← Back to messages</a>
      </div>
    );
  }

  return (
    <ChatThread
      accessToken={accessToken}
      conversationId={conversation.id}
      viewerRole="shop"
      viewerId={userId}
      headerTitle={conversation.customers?.display_name ?? "Customer"}
      counterpartVerified={conversation.customers?.email_verified}
    />
  );
}
