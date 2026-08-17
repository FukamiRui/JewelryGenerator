"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useCustomerAuth } from "@/lib/customer-auth-context";
import { fetchConversations, type ConversationSummary } from "@/lib/api-client";
import { formatRelativeTime } from "@/lib/format";

function Avatar({ src, label }: { src: string | null | undefined; label: string }) {
  if (src) {
    return (
      <div className="relative h-10 w-10 flex-shrink-0 overflow-hidden rounded-full bg-pearl">
        <Image src={src} alt="" fill className="object-cover" />
      </div>
    );
  }
  return (
    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-pearl font-mono text-sm text-stone">
      {label.charAt(0).toUpperCase()}
    </div>
  );
}

export default function CustomerMessagesPage() {
  const { accessToken } = useCustomerAuth();
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setConversations(await fetchConversations(accessToken, "customer"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load your conversations.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  return (
    <div className="mx-auto h-full max-w-2xl overflow-y-auto px-8 py-12">
      <h1 className="font-display text-2xl text-ink">Messages</h1>

      {loading && <p className="mt-8 text-sm text-stone">Loading…</p>}

      {!loading && error && (
        <div className="mt-8 flex flex-col items-start gap-2">
          <p className="text-sm text-stone">{error}</p>
          <button onClick={load} className="text-xs text-gold hover:underline">Retry</button>
        </div>
      )}

      {!loading && !error && conversations.length === 0 && (
        <p className="mt-8 text-sm text-stone">
          No conversations yet — <a href="/shops" className="text-gold hover:underline">browse shops</a> to start one.
        </p>
      )}

      <div className="mt-6 flex flex-col gap-2">
        {conversations.map((c) => {
          const name = c.tenants?.company_name ?? "Shop";
          return (
            <Link
              key={c.id}
              href={`/customer/messages/${c.id}`}
              className="flex items-center gap-3 rounded-sm border border-line-light bg-white px-4 py-3 hover:border-gold"
            >
              <Avatar src={c.tenants?.logo_url} label={name} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-ink">{name}</p>
                <p className="mt-0.5 truncate text-xs text-stone">
                  {c.last_message_preview || "No messages yet"}
                </p>
              </div>
              <span className="flex-shrink-0 font-mono text-[10px] text-stone">
                {formatRelativeTime(c.last_message_at)}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
