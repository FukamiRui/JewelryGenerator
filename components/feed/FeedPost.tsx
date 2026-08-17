"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  likePortfolioItem,
  unlikePortfolioItem,
  savePortfolioItem,
  unsavePortfolioItem,
  fetchPortfolioComments,
  postPortfolioComment,
  deletePortfolioComment,
  type FeedItem,
  type PortfolioComment,
} from "@/lib/api-client";
import { formatRelativeTime } from "@/lib/format";

export function FeedPost({
  item,
  accessToken,
  customerId,
  onRequireLogin,
}: {
  item: FeedItem;
  accessToken: string | null;
  customerId: string | null;
  onRequireLogin: () => void;
}) {
  const [liked, setLiked] = useState(item.liked);
  const [likesCount, setLikesCount] = useState(item.likes_count);
  const [saved, setSaved] = useState(item.saved);
  const [savesCount, setSavesCount] = useState(item.saves_count);
  const [commentsCount, setCommentsCount] = useState(item.comments_count);
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState<PortfolioComment[] | null>(null);
  const [commentDraft, setCommentDraft] = useState("");
  const [busy, setBusy] = useState(false);

  function requireAuth(): boolean {
    if (!accessToken) {
      onRequireLogin();
      return false;
    }
    return true;
  }

  async function toggleLike() {
    if (!requireAuth() || busy) return;
    setBusy(true);
    const next = !liked;
    setLiked(next);
    setLikesCount((c) => c + (next ? 1 : -1));
    try {
      await (next ? likePortfolioItem : unlikePortfolioItem)(accessToken!, item.id);
    } catch {
      setLiked(!next);
      setLikesCount((c) => c + (next ? -1 : 1));
    } finally {
      setBusy(false);
    }
  }

  async function toggleSave() {
    if (!requireAuth() || busy) return;
    setBusy(true);
    const next = !saved;
    setSaved(next);
    setSavesCount((c) => c + (next ? 1 : -1));
    try {
      await (next ? savePortfolioItem : unsavePortfolioItem)(accessToken!, item.id);
    } catch {
      setSaved(!next);
      setSavesCount((c) => c + (next ? -1 : 1));
    } finally {
      setBusy(false);
    }
  }

  async function toggleComments() {
    const next = !showComments;
    setShowComments(next);
    if (next && comments === null) {
      try {
        setComments(await fetchPortfolioComments(item.id));
      } catch {
        setComments([]);
      }
    }
  }

  async function handlePostComment() {
    if (!requireAuth()) return;
    const text = commentDraft.trim();
    if (!text) return;
    try {
      const comment = await postPortfolioComment(accessToken!, item.id, text);
      setComments((prev) => [...(prev ?? []), comment]);
      setCommentsCount((c) => c + 1);
      setCommentDraft("");
    } catch {
      // best-effort — comment box just keeps the draft on failure
    }
  }

  async function handleDeleteComment(commentId: string) {
    if (!accessToken) return;
    try {
      await deletePortfolioComment(accessToken, item.id, commentId);
      setComments((prev) => (prev ?? []).filter((c) => c.id !== commentId));
      setCommentsCount((c) => Math.max(0, c - 1));
    } catch {
      // best-effort — comment just stays visible if deletion failed
    }
  }

  return (
    <article className="overflow-hidden rounded-sm border border-line-light bg-white">
      <Link href={`/shops/${item.shop.id}`} className="flex items-center gap-2 px-4 py-3 hover:bg-pearl">
        <div className="relative h-8 w-8 flex-shrink-0 overflow-hidden rounded-full bg-pearl">
          {item.shop.logo_url && <Image src={item.shop.logo_url} alt="" fill className="object-cover" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="truncate text-sm text-ink">{item.shop.company_name}</p>
            {item.shop.verified && <span className="text-xs text-gold">✓</span>}
            {item.boosted && (
              <span className="rounded-full bg-gold/15 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-ink">
                ⚡ Featured
              </span>
            )}
          </div>
          <p className="font-mono text-[10px] text-stone">{formatRelativeTime(item.created_at)}</p>
        </div>
      </Link>

      <div className="relative aspect-square w-full bg-pearl">
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

      <div className="flex items-center gap-4 px-4 pt-3">
        <button onClick={toggleLike} className={`text-sm ${liked ? "text-gold" : "text-ink"}`}>
          {liked ? "♥" : "♡"} {likesCount}
        </button>
        <button onClick={toggleComments} className="text-sm text-ink">
          💬 {commentsCount}
        </button>
        <button onClick={toggleSave} className={`ml-auto text-sm ${saved ? "text-gold" : "text-ink"}`}>
          {saved ? "★ Saved" : "☆ Save"} {savesCount > 0 && `(${savesCount})`}
        </button>
      </div>

      <div className="px-4 py-3">
        {item.caption && <p className="text-sm font-medium text-ink">{item.caption}</p>}
        {item.materials && <p className="mt-0.5 text-xs text-stone">{item.materials}</p>}
        {item.description && <p className="mt-1 text-sm text-stone">{item.description}</p>}
      </div>

      {showComments && (
        <div className="border-t border-line-light px-4 py-3">
          {comments === null && <p className="text-xs text-stone">Loading comments…</p>}
          {comments?.length === 0 && <p className="text-xs text-stone">No comments yet.</p>}
          <div className="flex flex-col gap-2">
            {comments?.map((c) => (
              <div key={c.id} className="flex items-start justify-between gap-2 text-sm">
                <p>
                  <span className="font-medium text-ink">{c.customers?.display_name ?? "Customer"}</span>{" "}
                  <span className="text-stone">{c.body}</span>
                </p>
                {c.customer_id === customerId && (
                  <button
                    onClick={() => handleDeleteComment(c.id)}
                    className="flex-shrink-0 text-[11px] text-stone hover:text-ink"
                  >
                    Delete
                  </button>
                )}
              </div>
            ))}
          </div>
          <div className="mt-2 flex gap-2">
            <input
              value={commentDraft}
              onChange={(e) => setCommentDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handlePostComment()}
              placeholder="Add a comment…"
              maxLength={500}
              className="flex-1 rounded-sm border border-line-light px-2 py-1.5 text-sm"
            />
            <button
              onClick={handlePostComment}
              className="rounded-sm bg-ink px-3 py-1.5 text-xs text-pearl hover:bg-ink/90"
            >
              Post
            </button>
          </div>
        </div>
      )}
    </article>
  );
}
