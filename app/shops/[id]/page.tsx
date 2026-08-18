"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import {
  fetchShopProfile,
  startConversation,
  type ShopProfile,
  type ShopPortfolioItem,
} from "@/lib/api-client";
import { getBrowserClient } from "@/lib/supabase-browser";
import { ToastProvider, useToast } from "@/components/ui/Toast";
import { StarRating } from "@/components/ui/StarRating";

// Reached via a direct link a shop shares (e.g. from Instagram, a business
// card QR code) — not a public directory. See README for why there's no
// browse/search page: that's the marketplace-discovery surface we cut.

function PortfolioDetailModal({ item, onClose }: { item: ShopPortfolioItem; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-6"
      onClick={onClose}
    >
      <div
        className="flex max-h-full w-full max-w-2xl flex-col overflow-hidden rounded-sm bg-white sm:flex-row"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative aspect-square w-full flex-shrink-0 bg-pearl sm:w-1/2">
          {item.media_type === "video" && item.video_url ? (
            <video
              src={item.video_url}
              poster={item.image_url ?? undefined}
              controls
              playsInline
              className="h-full w-full object-cover"
            />
          ) : (
            item.image_url && <Image src={item.image_url} alt={item.caption ?? ""} fill className="object-cover" />
          )}
        </div>
        <div className="flex flex-col gap-2 overflow-y-auto p-6">
          {item.caption && <h3 className="font-display text-xl text-ink">{item.caption}</h3>}
          {item.materials && (
            <p className="font-mono text-xs uppercase tracking-wide text-stone">{item.materials}</p>
          )}
          {item.description && <p className="text-sm text-stone">{item.description}</p>}
          <button onClick={onClose} className="mt-4 self-start text-xs text-gold hover:underline">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function ShopProfileInner() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();

  const [profile, setProfile] = useState<ShopProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [selectedItem, setSelectedItem] = useState<ShopPortfolioItem | null>(null);

  useEffect(() => {
    fetchShopProfile(params.id)
      .then(setProfile)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load this shop."))
      .finally(() => setLoading(false));
  }, [params.id]);

  async function handleMessage() {
    setStarting(true);
    try {
      const supabase = getBrowserClient();
      const { data } = await supabase.auth.getSession();

      if (!data.session) {
        router.push(`/customer/login?next=/shops/${params.id}`);
        return;
      }

      const conversationId = await startConversation(data.session.access_token, params.id);
      router.push(`/customer/messages/${conversationId}`);
    } catch (err) {
      toast.push(err instanceof Error ? err.message : "Could not start a conversation.");
    } finally {
      setStarting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-pearl">
        <p className="font-mono text-xs uppercase tracking-widest text-stone">Loading…</p>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2 bg-pearl px-6 text-center">
        <p className="font-display text-lg text-ink">{error ?? "Shop not found"}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-pearl">
      <div className="flex items-center justify-between border-b border-line-light bg-white px-6 py-3">
        <span className="font-display text-lg text-ink">Atelier</span>
        <a href="/customer/login" className="text-xs text-stone transition-colors hover:text-ink">Sign in</a>
      </div>

      <div className="relative h-48 w-full bg-white">
        {profile.shop.cover_image_url && (
          <Image src={profile.shop.cover_image_url} alt="" fill className="object-cover" />
        )}
      </div>

      <div className="mx-auto max-w-3xl px-8 py-12">
        <div className="flex items-start justify-between">
          <div>
            <div className="relative -mt-20 mb-3 h-20 w-20 overflow-hidden rounded-full border-4 border-pearl bg-white">
              {profile.shop.logo_url && (
                <Image src={profile.shop.logo_url} alt="" fill className="object-cover" />
              )}
            </div>
            <div className="flex items-center gap-2">
              <h1 className="font-display text-3xl text-ink">{profile.shop.company_name}</h1>
              {profile.verified && (
                <span className="rounded-full bg-gold/15 px-2 py-0.5 text-[10px] uppercase tracking-wide text-ink">
                  ✓ Verified
                </span>
              )}
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-stone">
              {profile.shop.location && <span>{profile.shop.location}</span>}
              {profile.shop.location && profile.shop.founded_year != null && <span>·</span>}
              {profile.shop.founded_year != null && (
                <span>{new Date().getFullYear() - profile.shop.founded_year} years in the craft</span>
              )}
            </div>
            {profile.shop.specialty_materials.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {profile.shop.specialty_materials.map((m) => (
                  <span key={m} className="rounded-full bg-pearl px-2.5 py-0.5 text-[11px] text-stone">
                    {m}
                  </span>
                ))}
              </div>
            )}
            {profile.average_rating !== null && (
              <div className="mt-1 flex items-center gap-1.5">
                <StarRating rating={profile.average_rating} />
                <span className="font-mono text-xs text-stone">
                  {profile.average_rating} ({profile.review_count} reviews)
                </span>
              </div>
            )}
            {profile.average_response_hours !== null && (
              <p className="mt-1 font-mono text-xs text-stone">
                Typically responds within{" "}
                {profile.average_response_hours < 1
                  ? "an hour"
                  : `${Math.round(profile.average_response_hours)}h`}
              </p>
            )}
            <p className="mt-1 text-xs text-stone">
              {profile.returns_accepted ? "✓ Returns accepted" : "✕ Final sale — no returns"}
              {profile.returns_accepted && profile.return_policy_note && ` · ${profile.return_policy_note}`}
            </p>
            {profile.shop.bio && <p className="mt-3 max-w-lg text-sm text-stone">{profile.shop.bio}</p>}
            {profile.shop.contact_email && (
              <a
                href={`mailto:${profile.shop.contact_email}`}
                className="mt-2 inline-block text-sm text-gold hover:underline"
              >
                {profile.shop.contact_email}
              </a>
            )}
          </div>
          <button
            onClick={handleMessage}
            disabled={starting}
            className="flex-shrink-0 rounded-sm bg-ink px-5 py-2.5 text-sm text-pearl transition-colors hover:bg-ink/90 disabled:opacity-50"
          >
            {starting ? "Starting…" : "Message this shop"}
          </button>
        </div>

        {profile.portfolio.length > 0 && (
          <section className="mt-12">
            <h2 className="font-mono text-[10px] uppercase tracking-[0.2em] text-stone">Portfolio</h2>
            <div className="mt-4 grid grid-cols-3 gap-3">
              {profile.portfolio.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setSelectedItem(p)}
                  className="relative aspect-square overflow-hidden rounded-sm bg-white"
                >
                  {p.image_url && <Image src={p.image_url} alt={p.caption ?? ""} fill className="object-cover" />}
                  {p.media_type === "video" && (
                    <span className="absolute right-1.5 top-1.5 rounded-full bg-ink/70 px-1.5 py-0.5 text-[10px] text-pearl">
                      ▶
                    </span>
                  )}
                </button>
              ))}
            </div>
          </section>
        )}

        {profile.reviews.length > 0 && (
          <section className="mt-12">
            <h2 className="font-mono text-[10px] uppercase tracking-[0.2em] text-stone">Reviews</h2>
            <div className="mt-4 flex flex-col gap-4">
              {profile.reviews.map((r) => (
                <div key={r.id} className="border-b border-line-light pb-4">
                  <div className="flex items-center gap-2">
                    <StarRating rating={r.rating} />
                    <span className="font-mono text-xs text-stone">{r.customers?.display_name ?? "Customer"}</span>
                  </div>
                  {r.comment && <p className="mt-1 text-sm text-stone">{r.comment}</p>}
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      {selectedItem && <PortfolioDetailModal item={selectedItem} onClose={() => setSelectedItem(null)} />}
    </div>
  );
}

export default function ShopProfilePage() {
  return (
    <ToastProvider>
      <ShopProfileInner />
    </ToastProvider>
  );
}
