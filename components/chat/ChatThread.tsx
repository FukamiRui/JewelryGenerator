"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import {
  fetchMessages,
  sendMessage,
  fetchOrders,
  fetchRevisionStatus,
  grantMoreRevisions,
  type ChatMessage,
  type Order,
  type RevisionStatus,
} from "@/lib/api-client";
import { MessageBubble } from "@/components/chat/MessageBubble";
import { GeneratePanel } from "@/components/chat/GeneratePanel";
import { OrderCard } from "@/components/chat/OrderCard";
import { OrderProposalPanel, type DesignOption } from "@/components/chat/OrderProposalPanel";
import { ReportDialog } from "@/components/chat/ReportDialog";
import { useToast } from "@/components/ui/Toast";
import type { Category, Material } from "@/types/domain";

interface ChatThreadProps {
  accessToken: string;
  conversationId: string;
  viewerRole: "customer" | "shop";
  viewerId: string;
  headerTitle: string;
  catalog?: { categories: Category[]; materials: Material[] };
  /** Shown next to the header when viewerRole is "shop" — the customer's email-verified badge. */
  counterpartVerified?: boolean;
  /** Shown on order cards when viewerRole is "customer" — the shop's returns policy. */
  returnsAccepted?: boolean;
  returnPolicyNote?: string | null;
}

const POLL_INTERVAL_MS = 5000;

export function ChatThread({
  accessToken,
  conversationId,
  viewerRole,
  viewerId,
  headerTitle,
  catalog,
  counterpartVerified,
  returnsAccepted,
  returnPolicyNote,
}: ChatThreadProps) {
  const toast = useToast();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [showGenerate, setShowGenerate] = useState(false);
  const [showPropose, setShowPropose] = useState(false);
  const [orders, setOrders] = useState<Order[]>([]);
  const [reviewedOrderIds, setReviewedOrderIds] = useState<Set<string>>(new Set());
  const [showReport, setShowReport] = useState(false);
  const [revisionStatus, setRevisionStatus] = useState<RevisionStatus | null>(null);
  const [granting, setGranting] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const designOptions: DesignOption[] = useMemo(
    () =>
      messages
        .filter((m) => m.design_id && m.designs)
        .map((m) => ({
          design_id: m.design_id!,
          image_url: m.designs!.generated_image_url,
          price_usd: m.designs!.calculated_price_usd,
        })),
    [messages]
  );

  const loadOrders = useCallback(async () => {
    try {
      const data = await fetchOrders(accessToken, conversationId);
      setOrders(data);
    } catch {
      // Non-critical — the chat still works without the orders panel.
    }
  }, [accessToken, conversationId]);

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const data = await fetchMessages(accessToken, conversationId);
        setMessages(data);
        setLoadError(null);
      } catch (err) {
        if (!silent) setLoadError(err instanceof Error ? err.message : "Could not load messages.");
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [accessToken, conversationId]
  );

  useEffect(() => {
    load();
    loadOrders();
    const interval = setInterval(() => {
      load(true);
      loadOrders();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [load, loadOrders]);

  useEffect(() => {
    if (viewerRole !== "shop") return;
    fetchRevisionStatus(accessToken, conversationId)
      .then(setRevisionStatus)
      .catch(() => setRevisionStatus(null));
  }, [viewerRole, accessToken, conversationId, messages.length]);

  async function handleGrantRevisions() {
    setGranting(true);
    try {
      await grantMoreRevisions(accessToken, conversationId);
      const status = await fetchRevisionStatus(accessToken, conversationId);
      setRevisionStatus(status);
      toast.push("More design tries granted for this request.");
    } catch (err) {
      toast.push(err instanceof Error ? err.message : "Could not grant more revisions.");
    } finally {
      setGranting(false);
    }
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setSending(true);
    try {
      const message = await sendMessage(accessToken, conversationId, text);
      setMessages((prev) => [...prev, message]);
      setDraft("");
    } catch (err) {
      toast.push(err instanceof Error ? err.message : "Could not send message.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-line-light bg-white px-6 py-3">
        <div className="flex items-center gap-2">
          <p className="font-display text-base text-ink">{headerTitle}</p>
          {viewerRole === "shop" && counterpartVerified && (
            <span className="rounded-full bg-gold/15 px-2 py-0.5 text-[10px] uppercase tracking-wide text-ink">
              ✓ Verified
            </span>
          )}
        </div>
        <div className="flex gap-2">
          {viewerRole === "shop" && (
            <button
              onClick={() => setShowPropose((v) => !v)}
              className="rounded-sm border border-gold px-3 py-1.5 text-xs uppercase tracking-wide text-ink hover:bg-gold hover:text-ink"
            >
              {showPropose ? "Hide order form" : "Propose order"}
            </button>
          )}
          {viewerRole === "customer" && catalog && (
            <button
              onClick={() => setShowGenerate((v) => !v)}
              className="rounded-sm border border-gold px-3 py-1.5 text-xs uppercase tracking-wide text-ink hover:bg-gold hover:text-ink"
            >
              {showGenerate ? "Hide generator" : "Generate a design"}
            </button>
          )}
          <button onClick={() => setShowReport(true)} className="px-2 text-xs text-stone hover:text-ink">
            Report
          </button>
        </div>
      </div>

      {viewerRole === "shop" && revisionStatus?.blocked && (
        <div className="flex items-center justify-between border-b border-line-light bg-pearl px-6 py-2">
          <p className="text-xs text-stone">
            This customer has used all {revisionStatus.max} design tries for their current request.
          </p>
          <button
            onClick={handleGrantRevisions}
            disabled={granting}
            className="rounded-sm border border-gold px-3 py-1 text-xs text-ink hover:bg-gold disabled:opacity-50"
          >
            {granting ? "Granting…" : "Allow more revisions"}
          </button>
        </div>
      )}

      {showReport && (
        <ReportDialog
          accessToken={accessToken}
          conversationId={conversationId}
          onClose={() => setShowReport(false)}
        />
      )}

      {orders.length > 0 && (
        <div className="flex flex-col gap-2 border-b border-line-light bg-pearl px-6 py-3">
          {orders.map((o) => (
            <OrderCard
              key={o.id}
              accessToken={accessToken}
              order={o}
              viewerRole={viewerRole}
              reviewed={reviewedOrderIds.has(o.id)}
              returnsAccepted={viewerRole === "customer" ? returnsAccepted : undefined}
              returnPolicyNote={viewerRole === "customer" ? returnPolicyNote : undefined}
              onChanged={(updated) =>
                setOrders((prev) => prev.map((existing) => (existing.id === updated.id ? updated : existing)))
              }
              onReviewed={() => setReviewedOrderIds((prev) => new Set(prev).add(o.id))}
            />
          ))}
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-6 py-4">
        {loading && <p className="text-sm text-stone">Loading conversation…</p>}

        {!loading && loadError && (
          <div className="flex flex-col items-start gap-2">
            <p className="text-sm text-stone">{loadError}</p>
            <button onClick={() => load()} className="text-xs text-gold hover:underline">
              Retry
            </button>
          </div>
        )}

        {!loading && !loadError && messages.length === 0 && (
          <p className="text-sm text-stone">No messages yet — say hello.</p>
        )}

        {!loading && !loadError && (
          <div className="flex flex-col gap-3">
            {messages.map((m) => (
              <MessageBubble key={m.id} message={m} isOwn={m.sender_id === viewerId} />
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {viewerRole === "customer" && catalog && showGenerate && (
        <GeneratePanel
          accessToken={accessToken}
          conversationId={conversationId}
          categories={catalog.categories}
          materials={catalog.materials}
          onGenerated={() => load()}
          onClose={() => setShowGenerate(false)}
        />
      )}

      {viewerRole === "shop" && showPropose && (
        <OrderProposalPanel
          accessToken={accessToken}
          conversationId={conversationId}
          designOptions={designOptions}
          onCreated={(order) => setOrders((prev) => [...prev, order])}
          onClose={() => setShowPropose(false)}
        />
      )}

      <form onSubmit={handleSend} className="flex items-center gap-2 border-t border-line-light bg-white p-3">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Write a message…"
          maxLength={4000}
          className="flex-1 rounded-sm border border-line-light px-3 py-2 text-sm focus:border-gold"
        />
        <button
          type="submit"
          disabled={sending || !draft.trim()}
          className="rounded-sm bg-ink px-4 py-2 text-sm text-pearl hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </div>
  );
}
