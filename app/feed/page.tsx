"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { getBrowserClient } from "@/lib/supabase-browser";
import { fetchFeed, type FeedItem } from "@/lib/api-client";
import { FeedPost } from "@/components/feed/FeedPost";
import { ToastProvider } from "@/components/ui/Toast";

const PAGE_SIZE = 20;

function FeedInner() {
  const router = useRouter();
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [mode, setMode] = useState<"discover" | "following">("discover");
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = getBrowserClient();
    supabase.auth.getSession().then(({ data }) => {
      setAccessToken(data.session?.access_token ?? null);
      setCustomerId(data.session?.user.id ?? null);
      setAuthChecked(true);
    });
  }, []);

  const load = useCallback(
    async (nextMode: "discover" | "following") => {
      setLoading(true);
      setError(null);
      try {
        const { items: results, has_more } = await fetchFeed(nextMode, 0, PAGE_SIZE, accessToken ?? undefined);
        setItems(results);
        setHasMore(has_more);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load the feed.");
      } finally {
        setLoading(false);
      }
    },
    [accessToken]
  );

  useEffect(() => {
    if (!authChecked) return;
    load(mode);
  }, [authChecked, mode, load]);

  async function handleLoadMore() {
    setLoadingMore(true);
    try {
      const { items: more, has_more } = await fetchFeed(mode, items.length, PAGE_SIZE, accessToken ?? undefined);
      setItems((prev) => [...prev, ...more]);
      setHasMore(has_more);
    } catch {
      // leave the existing feed as-is; the Load more button just stays visible to retry
    } finally {
      setLoadingMore(false);
    }
  }

  function handleSelectMode(next: "discover" | "following") {
    if (next === "following" && !accessToken) {
      router.push("/customer/login?next=/feed");
      return;
    }
    setMode(next);
  }

  return (
    <div className="min-h-screen bg-pearl">
      <div className="flex items-center justify-between border-b border-line-light bg-white px-6 py-3">
        <div className="flex items-center gap-6">
          <a href="/shops" className="font-display text-lg text-ink">Atelier</a>
          <a href="/shops" className="text-xs text-stone hover:text-ink">Shops</a>
        </div>
        <a href="/customer/login" className="text-xs text-stone hover:text-ink">Sign in</a>
      </div>

      <div className="mx-auto max-w-lg px-4 py-8">
        <div className="flex gap-1 rounded-sm border border-line-light bg-white p-1">
          <button
            onClick={() => handleSelectMode("discover")}
            className={`flex-1 rounded-sm py-1.5 text-sm ${
              mode === "discover" ? "bg-ink text-pearl" : "text-stone hover:text-ink"
            }`}
          >
            Discover
          </button>
          <button
            onClick={() => handleSelectMode("following")}
            className={`flex-1 rounded-sm py-1.5 text-sm ${
              mode === "following" ? "bg-ink text-pearl" : "text-stone hover:text-ink"
            }`}
          >
            Following
          </button>
        </div>

        {loading && <p className="mt-8 text-center text-sm text-stone">Loading…</p>}

        {!loading && error && (
          <div className="mt-8 flex flex-col items-center gap-2">
            <p className="text-sm text-stone">{error}</p>
            <button onClick={() => load(mode)} className="text-xs text-gold hover:underline">
              Retry
            </button>
          </div>
        )}

        {!loading && !error && items.length === 0 && (
          <p className="mt-8 text-center text-sm text-stone">
            {mode === "following"
              ? "Follow some shops to see their work here."
              : "No posts yet — check back soon."}
          </p>
        )}

        {!loading && !error && items.length > 0 && (
          <div className="mt-6 flex flex-col gap-4">
            {items.map((item) => (
              <FeedPost
                key={item.id}
                item={item}
                accessToken={accessToken}
                customerId={customerId}
                onRequireLogin={() => router.push("/customer/login?next=/feed")}
              />
            ))}
          </div>
        )}

        {!loading && hasMore && (
          <button
            onClick={handleLoadMore}
            disabled={loadingMore}
            className="mt-6 w-full rounded-sm border border-line-light py-2 text-sm text-ink hover:border-gold disabled:opacity-50"
          >
            {loadingMore ? "Loading…" : "Load more"}
          </button>
        )}
      </div>
    </div>
  );
}

export default function FeedPage() {
  return (
    <ToastProvider>
      <FeedInner />
    </ToastProvider>
  );
}
