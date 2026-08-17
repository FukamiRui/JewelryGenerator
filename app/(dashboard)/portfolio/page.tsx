"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useAuth } from "@/lib/auth-context";
import {
  fetchMyPortfolio,
  addPortfolioItem,
  addPortfolioVideo,
  updatePortfolioItem,
  deletePortfolioItem,
  fetchDesignHistory,
  boostPortfolioItem,
  unboostPortfolioItem,
  type PortfolioItem,
  type DesignHistoryRow,
} from "@/lib/api-client";
import { useToast } from "@/components/ui/Toast";
import { VIDEO_GENERATION_CREDIT_COST } from "@/lib/credits";

function UploadForm({
  accessToken,
  onAdded,
}: {
  accessToken: string;
  onAdded: (item: PortfolioItem) => void;
}) {
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [materials, setMaterials] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      toast.push("Choose a photo to upload.");
      return;
    }
    setSubmitting(true);
    try {
      const item = await addPortfolioItem(accessToken, {
        image: file,
        title: title.trim() || undefined,
        description: description.trim() || undefined,
        materials: materials.trim() || undefined,
      });
      onAdded(item);
      setTitle("");
      setDescription("");
      setMaterials("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      toast.push("Added to your portfolio.");
    } catch (err) {
      toast.push(err instanceof Error ? err.message : "Could not upload this piece.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="text-sm" />
      <div className="grid grid-cols-2 gap-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title"
          maxLength={200}
          className="rounded-sm border border-line-light px-2 py-1.5 text-sm"
        />
        <input
          value={materials}
          onChange={(e) => setMaterials(e.target.value)}
          placeholder="Materials (e.g. 18K gold, 0.5ct diamond)"
          maxLength={300}
          className="rounded-sm border border-line-light px-2 py-1.5 text-sm"
        />
      </div>
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Tell customers about this piece…"
        maxLength={2000}
        rows={2}
        className="rounded-sm border border-line-light px-2 py-1.5 text-sm"
      />
      <button
        onClick={handleSubmit}
        disabled={submitting}
        className="self-start rounded-sm bg-gold px-4 py-1.5 text-sm font-medium text-ink hover:bg-gold-bright disabled:opacity-50"
      >
        {submitting ? "Uploading…" : "Add to portfolio"}
      </button>
    </div>
  );
}

function AddFromHistory({
  accessToken,
  onAdded,
}: {
  accessToken: string;
  onAdded: (item: PortfolioItem) => void;
}) {
  const toast = useToast();
  const [designs, setDesigns] = useState<DesignHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState("");
  const [title, setTitle] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchDesignHistory(accessToken)
      .then((rows) => {
        setDesigns(rows);
        setSelectedId(rows[0]?.id ?? "");
      })
      .catch(() => toast.push("Could not load your design history."))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  async function handleAdd() {
    if (!selectedId) {
      toast.push("Pick a design first.");
      return;
    }
    setSubmitting(true);
    try {
      const item = await addPortfolioItem(accessToken, {
        design_id: selectedId,
        title: title.trim() || undefined,
      });
      onAdded(item);
      setTitle("");
      toast.push("Added to your portfolio.");
    } catch (err) {
      toast.push(err instanceof Error ? err.message : "Could not add this design.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <p className="text-sm text-stone">Loading your designs…</p>;
  if (designs.length === 0) return <p className="text-sm text-stone">Generate a design first to add it here.</p>;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={selectedId}
        onChange={(e) => setSelectedId(e.target.value)}
        className="rounded-sm border border-line-light px-2 py-1.5 text-sm"
      >
        {designs.map((d) => (
          <option key={d.id} value={d.id}>
            {(d.categories?.name ?? "Design")} — ${d.calculated_price_usd.toLocaleString("en-US")} —{" "}
            {new Date(d.created_at).toLocaleDateString("en-US")}
          </option>
        ))}
      </select>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Title (optional)"
        maxLength={200}
        className="w-56 rounded-sm border border-line-light px-2 py-1.5 text-sm"
      />
      <button
        onClick={handleAdd}
        disabled={submitting}
        className="rounded-sm bg-ink px-4 py-1.5 text-sm text-pearl hover:bg-ink/90 disabled:opacity-50"
      >
        {submitting ? "Adding…" : "Add"}
      </button>
    </div>
  );
}

function VideoForm({
  accessToken,
  creditsRemaining,
  onAdded,
}: {
  accessToken: string;
  creditsRemaining: number;
  onAdded: (item: PortfolioItem) => void;
}) {
  const toast = useToast();
  const [mode, setMode] = useState<"upload" | "generate">("generate");
  const videoInputRef = useRef<HTMLInputElement>(null);
  const [designs, setDesigns] = useState<DesignHistoryRow[]>([]);
  const [designsLoading, setDesignsLoading] = useState(true);
  const [selectedDesignId, setSelectedDesignId] = useState("");
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [motionPrompt, setMotionPrompt] = useState("");
  const [title, setTitle] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchDesignHistory(accessToken)
      .then((rows) => {
        setDesigns(rows);
        setSelectedDesignId(rows[0]?.id ?? "");
      })
      .catch(() => toast.push("Could not load your design history."))
      .finally(() => setDesignsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  const canAfford = creditsRemaining >= VIDEO_GENERATION_CREDIT_COST;

  async function handleSubmit() {
    if (!canAfford) {
      toast.push("Not enough credits left this month for a video post.");
      return;
    }

    setSubmitting(true);
    try {
      let item: PortfolioItem;
      if (mode === "upload") {
        const file = videoInputRef.current?.files?.[0];
        if (!file) {
          toast.push("Choose a video file to upload.");
          setSubmitting(false);
          return;
        }
        item = await addPortfolioVideo(accessToken, { video: file, title: title.trim() || undefined });
      } else {
        const imageFile = imageInputRef.current?.files?.[0];
        if (!imageFile && !selectedDesignId) {
          toast.push("Pick a design or upload a photo to animate.");
          setSubmitting(false);
          return;
        }
        item = await addPortfolioVideo(accessToken, {
          image: imageFile,
          design_id: imageFile ? undefined : selectedDesignId,
          motion_prompt: motionPrompt.trim() || undefined,
          title: title.trim() || undefined,
        });
      }
      onAdded(item);
      setTitle("");
      setMotionPrompt("");
      if (videoInputRef.current) videoInputRef.current.value = "";
      if (imageInputRef.current) imageInputRef.current.value = "";
      toast.push("Video posted to your portfolio.");
    } catch (err) {
      toast.push(err instanceof Error ? err.message : "Could not post this video.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-1 rounded-sm border border-line-light p-1 text-sm">
        <button
          onClick={() => setMode("generate")}
          className={`flex-1 rounded-sm py-1 ${mode === "generate" ? "bg-ink text-pearl" : "text-stone"}`}
        >
          Generate with AI
        </button>
        <button
          onClick={() => setMode("upload")}
          className={`flex-1 rounded-sm py-1 ${mode === "upload" ? "bg-ink text-pearl" : "text-stone"}`}
        >
          Upload my own
        </button>
      </div>

      {mode === "upload" && (
        <input ref={videoInputRef} type="file" accept="video/mp4,video/quicktime,video/webm" className="text-sm" />
      )}

      {mode === "generate" && (
        <>
          {designsLoading && <p className="text-xs text-stone">Loading your designs…</p>}
          {!designsLoading && designs.length > 0 && (
            <select
              value={selectedDesignId}
              onChange={(e) => setSelectedDesignId(e.target.value)}
              className="rounded-sm border border-line-light px-2 py-1.5 text-sm"
            >
              {designs.map((d) => (
                <option key={d.id} value={d.id}>
                  {(d.categories?.name ?? "Design")} — ${d.calculated_price_usd.toLocaleString("en-US")}
                </option>
              ))}
            </select>
          )}
          <p className="text-xs text-stone">…or upload a fresh photo to animate instead:</p>
          <input ref={imageInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="text-sm" />
          <textarea
            value={motionPrompt}
            onChange={(e) => setMotionPrompt(e.target.value)}
            placeholder="Describe the motion (optional) — default: slow 360° rotation, studio lighting"
            maxLength={500}
            rows={2}
            className="rounded-sm border border-line-light px-2 py-1.5 text-sm"
          />
        </>
      )}

      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Title (optional)"
        maxLength={200}
        className="rounded-sm border border-line-light px-2 py-1.5 text-sm"
      />

      <div className="flex items-center gap-3">
        <button
          onClick={handleSubmit}
          disabled={submitting || !canAfford}
          className="rounded-sm bg-gold px-4 py-1.5 text-sm font-medium text-ink hover:bg-gold-bright disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? "Posting…" : `Post video (${VIDEO_GENERATION_CREDIT_COST} credits)`}
        </button>
        <span className={`text-xs ${canAfford ? "text-stone" : "text-ink"}`}>
          {creditsRemaining} credits left this month
        </span>
      </div>
    </div>
  );
}

function PortfolioTile({
  accessToken,
  item,
  onChanged,
  onRemoved,
}: {
  accessToken: string;
  item: PortfolioItem;
  onChanged: (item: PortfolioItem) => void;
  onRemoved: (id: string) => void;
}) {
  const toast = useToast();
  const [caption, setCaption] = useState(item.caption ?? "");
  const [description, setDescription] = useState(item.description ?? "");
  const [materials, setMaterials] = useState(item.materials ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSave(field: "caption" | "description" | "materials", value: string) {
    setSaving(true);
    try {
      const updated = await updatePortfolioItem(accessToken, item.id, { [field]: value.trim() || null });
      onChanged(updated);
    } catch (err) {
      toast.push(err instanceof Error ? err.message : "Could not save your changes.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    try {
      await deletePortfolioItem(accessToken, item.id);
      onRemoved(item.id);
    } catch (err) {
      toast.push(err instanceof Error ? err.message : "Could not remove this item.");
    }
  }

  const isBoosted = !!item.boost_expires_at && new Date(item.boost_expires_at) > new Date();

  async function handleToggleBoost() {
    setSaving(true);
    try {
      if (isBoosted) {
        await unboostPortfolioItem(accessToken, item.id);
        onChanged({ ...item, boost_expires_at: null });
      } else {
        const { boost_expires_at } = await boostPortfolioItem(accessToken, item.id);
        onChanged({ ...item, boost_expires_at });
      }
    } catch (err) {
      toast.push(err instanceof Error ? err.message : "Could not update boost status.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-sm border border-line-light bg-white p-2">
      <div className="relative aspect-square overflow-hidden rounded-sm bg-pearl">
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
        {isBoosted && (
          <span className="absolute right-1.5 top-1.5 rounded-full bg-gold px-2 py-0.5 text-[10px] font-medium text-ink">
            ⚡ Boosted
          </span>
        )}
      </div>
      <div className="mt-2 flex flex-col gap-1">
        <input
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          onBlur={() => handleSave("caption", caption)}
          placeholder="Title"
          maxLength={200}
          disabled={saving}
          className="w-full rounded-sm border border-line-light px-2 py-1 text-xs"
        />
        <input
          value={materials}
          onChange={(e) => setMaterials(e.target.value)}
          onBlur={() => handleSave("materials", materials)}
          placeholder="Materials"
          maxLength={300}
          disabled={saving}
          className="w-full rounded-sm border border-line-light px-2 py-1 text-xs"
        />
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={() => handleSave("description", description)}
          placeholder="Description"
          maxLength={2000}
          rows={2}
          disabled={saving}
          className="w-full rounded-sm border border-line-light px-2 py-1 text-xs"
        />
      </div>
      <div className="mt-1.5 flex items-center justify-between">
        <button
          onClick={handleToggleBoost}
          disabled={saving}
          className="text-[11px] text-gold hover:underline disabled:opacity-50"
        >
          {isBoosted ? "Unboost" : "Boost for 7 days"}
        </button>
        <button onClick={handleDelete} className="text-[11px] text-stone hover:text-ink">
          Remove
        </button>
      </div>
    </div>
  );
}

export default function PortfolioPage() {
  const { accessToken, tenant } = useAuth();
  const toast = useToast();
  const [items, setItems] = useState<PortfolioItem[]>([]);
  const [loading, setLoading] = useState(true);
  const creditsRemaining = tenant ? tenant.monthly_credit_limit - tenant.credits_used_this_month : 0;

  useEffect(() => {
    fetchMyPortfolio(accessToken)
      .then(setItems)
      .catch(() => toast.push("Could not load your portfolio."))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  return (
    <div className="mx-auto h-full max-w-4xl overflow-y-auto px-8 py-12">
      <h1 className="font-display text-2xl text-ink">Portfolio</h1>
      <p className="mt-1 text-sm text-stone">
        Shown publicly on your shop page — highlight your best work with a photo, title,
        materials, and story, or pull one straight from your design history.
      </p>

      <section className="mt-6 flex flex-col gap-4 rounded-sm border border-line-light bg-white p-4">
        <div>
          <h2 className="font-mono text-[10px] uppercase tracking-[0.2em] text-stone">Upload a piece</h2>
          <div className="mt-2">
            <UploadForm accessToken={accessToken} onAdded={(item) => setItems((prev) => [...prev, item])} />
          </div>
        </div>
        <div className="border-t border-line-light pt-4">
          <h2 className="font-mono text-[10px] uppercase tracking-[0.2em] text-stone">
            Or add from your design history
          </h2>
          <div className="mt-2">
            <AddFromHistory accessToken={accessToken} onAdded={(item) => setItems((prev) => [...prev, item])} />
          </div>
        </div>
        <div className="border-t border-line-light pt-4">
          <h2 className="font-mono text-[10px] uppercase tracking-[0.2em] text-stone">Post a video</h2>
          <p className="mt-1 text-xs text-stone">
            Videos stand out in the feed. Generate one from a photo with AI, or upload your own.
          </p>
          <div className="mt-2">
            <VideoForm
              accessToken={accessToken}
              creditsRemaining={creditsRemaining}
              onAdded={(item) => setItems((prev) => [...prev, item])}
            />
          </div>
        </div>
      </section>

      {loading && <p className="mt-8 text-sm text-stone">Loading…</p>}

      {!loading && items.length === 0 && (
        <p className="mt-8 text-sm text-stone">Your portfolio is empty — add a piece above.</p>
      )}

      {!loading && items.length > 0 && (
        <div className="mt-8 grid grid-cols-3 gap-3">
          {items.map((item) => (
            <PortfolioTile
              key={item.id}
              accessToken={accessToken}
              item={item}
              onChanged={(updated) =>
                setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)))
              }
              onRemoved={(id) => setItems((prev) => prev.filter((i) => i.id !== id))}
            />
          ))}
        </div>
      )}
    </div>
  );
}
