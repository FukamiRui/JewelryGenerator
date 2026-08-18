"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useAuth } from "@/lib/auth-context";
import {
  fetchMyPortfolio,
  addPortfolioItem,
  addPortfolioVideo,
  updatePortfolioItem,
  deletePortfolioItem,
  fetchDesignHistory,
  generatePortfolioDescription,
  exportPortfolioVideo,
  generateSocialCaption,
  type PortfolioItem,
  type DesignHistoryRow,
  type SocialCaptionResult,
} from "@/lib/api-client";
import { useToast } from "@/components/ui/Toast";
import { VIDEO_GENERATION_CREDIT_COST } from "@/lib/credits";
import { FileDropzone } from "@/components/ui/FileDropzone";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import { UpgradeGate } from "@/components/ui/UpgradeGate";

function UploadForm({
  accessToken,
  onAdded,
}: {
  accessToken: string;
  onAdded: (item: PortfolioItem) => void;
}) {
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [uploadKey, setUploadKey] = useState(0);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [materials, setMaterials] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [generatingDescription, setGeneratingDescription] = useState(false);

  async function handleGenerateDescription() {
    if (!title.trim() && !materials.trim()) {
      toast.push("Add a title or materials first — the AI writes from those.");
      return;
    }
    setGeneratingDescription(true);
    try {
      const text = await generatePortfolioDescription(accessToken, {
        title: title.trim() || undefined,
        materials: materials.trim() || undefined,
      });
      setDescription(text);
    } catch (err) {
      toast.push(err instanceof Error ? err.message : "Could not generate a description.");
    } finally {
      setGeneratingDescription(false);
    }
  }

  async function handleSubmit() {
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
      setFile(null);
      setUploadKey((k) => k + 1);
      toast.push("Added to your portfolio.");
    } catch (err) {
      toast.push(err instanceof Error ? err.message : "Could not upload this piece.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <FileDropzone
        key={uploadKey}
        accept="image/jpeg,image/png,image/webp"
        kind="photo"
        onFileSelected={setFile}
      />
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
      <div className="flex flex-col gap-1">
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Tell customers about this piece…"
          maxLength={2000}
          rows={2}
          className="rounded-sm border border-line-light px-2 py-1.5 text-sm"
        />
        <button
          onClick={handleGenerateDescription}
          disabled={generatingDescription}
          className="self-start text-xs text-gold hover:underline disabled:opacity-50"
        >
          {generatingDescription ? "Writing…" : "✨ Generate with AI"}
        </button>
      </div>
      <button
        onClick={handleSubmit}
        disabled={submitting}
        className="self-start rounded-sm bg-gold px-4 py-1.5 text-sm font-medium text-ink transition-colors hover:bg-gold-bright disabled:opacity-50"
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
            {(d.categories?.name ?? "Design")} · est. ${d.calculated_price_usd.toLocaleString("en-US")} ·{" "}
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
        className="rounded-sm bg-ink px-4 py-1.5 text-sm text-pearl transition-colors hover:bg-ink/90 disabled:opacity-50"
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
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [designs, setDesigns] = useState<DesignHistoryRow[]>([]);
  const [designsLoading, setDesignsLoading] = useState(true);
  const [selectedDesignId, setSelectedDesignId] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [uploadKey, setUploadKey] = useState(0);
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
      toast.push("Not enough credits left this month to generate a video.");
      return;
    }

    setSubmitting(true);
    try {
      let item: PortfolioItem;
      if (mode === "upload") {
        if (!videoFile) {
          toast.push("Choose a video file to upload.");
          setSubmitting(false);
          return;
        }
        item = await addPortfolioVideo(accessToken, { video: videoFile, title: title.trim() || undefined });
      } else {
        if (!imageFile && !selectedDesignId) {
          toast.push("Pick a design or upload a photo to animate.");
          setSubmitting(false);
          return;
        }
        item = await addPortfolioVideo(accessToken, {
          image: imageFile ?? undefined,
          design_id: imageFile ? undefined : selectedDesignId,
          motion_prompt: motionPrompt.trim() || undefined,
          title: title.trim() || undefined,
        });
      }
      onAdded(item);
      setTitle("");
      setMotionPrompt("");
      setVideoFile(null);
      setImageFile(null);
      setUploadKey((k) => k + 1);
      toast.push("Video generated and added to your portfolio.");
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
        <FileDropzone
          key={`video-${uploadKey}`}
          accept="video/mp4,video/quicktime,video/webm"
          kind="video"
          placeholder="Click or drop a video"
          hint="MP4, MOV, or WebM"
          onFileSelected={setVideoFile}
        />
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
                  {(d.categories?.name ?? "Design")} · est. ${d.calculated_price_usd.toLocaleString("en-US")}
                </option>
              ))}
            </select>
          )}
          <p className="text-xs text-stone">Or upload a fresh photo to animate instead:</p>
          <FileDropzone
            key={`image-${uploadKey}`}
            accept="image/jpeg,image/png,image/webp"
            kind="photo"
            onFileSelected={setImageFile}
          />
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
          className="rounded-sm bg-gold px-4 py-1.5 text-sm font-medium text-ink transition-colors hover:bg-gold-bright disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? "Generating…" : `Generate video (${VIDEO_GENERATION_CREDIT_COST} credits)`}
        </button>
        <span className={`text-xs ${canAfford ? "text-stone" : "text-ink"}`}>
          {creditsRemaining} credits left this month
        </span>
      </div>
    </div>
  );
}

const PLATFORMS = [
  { value: "tiktok", label: "TikTok" },
  { value: "reels", label: "Reels" },
  { value: "twitter", label: "X/Twitter" },
] as const;
type Platform = (typeof PLATFORMS)[number]["value"];

function SocialToolsPanel({ accessToken, item }: { accessToken: string; item: PortfolioItem }) {
  const toast = useToast();
  const [platform, setPlatform] = useState<Platform>("tiktok");
  const [exporting, setExporting] = useState(false);
  const [exportedUrl, setExportedUrl] = useState<string | null>(null);
  const [generatingCaption, setGeneratingCaption] = useState(false);
  const [captionResult, setCaptionResult] = useState<SocialCaptionResult | null>(null);

  // Switching to a different piece should clear the previous piece's results
  // rather than showing a caption/export that no longer matches what's shown.
  useEffect(() => {
    setExportedUrl(null);
    setCaptionResult(null);
  }, [item.id]);

  async function handleExport() {
    setExporting(true);
    setExportedUrl(null);
    try {
      const url = await exportPortfolioVideo(accessToken, item.id, platform);
      setExportedUrl(url);
    } catch (err) {
      toast.push(err instanceof Error ? err.message : "Could not export this video.");
    } finally {
      setExporting(false);
    }
  }

  async function handleGenerateCaption() {
    setGeneratingCaption(true);
    setCaptionResult(null);
    try {
      const result = await generateSocialCaption(accessToken, item.id, platform);
      setCaptionResult(result);
    } catch (err) {
      toast.push(err instanceof Error ? err.message : "Could not generate a caption.");
    } finally {
      setGeneratingCaption(false);
    }
  }

  async function handleCopyCaption() {
    if (!captionResult) return;
    const text = `${captionResult.caption}\n\n${captionResult.hashtags.join(" ")}`;
    try {
      await navigator.clipboard.writeText(text);
      toast.push("Copied.", "info");
    } catch {
      // Clipboard API can be blocked — non-critical, fail silently.
    }
  }

  return (
    <div className="rounded-sm border border-line-light bg-white p-4">
      <div className="flex items-center gap-1.5">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-stone">Post to social</p>
        <InfoTooltip label="Tips for posting this">
          Export it sized for the platform first — a square or vertical crop reads far better in
          feed than a stretched original. Post a few times a week rather than one big batch, lead
          with your strongest 2–3 seconds since that&apos;s when most viewers decide to keep
          watching, and keep the AI caption&apos;s materials/style tags — buyers search by stone
          and metal type as often as by look.
        </InfoTooltip>
      </div>

      <select
        value={platform}
        onChange={(e) => setPlatform(e.target.value as Platform)}
        className="mt-3 rounded-sm border border-line-light px-2 py-1.5 text-sm"
      >
        {PLATFORMS.map((p) => (
          <option key={p.value} value={p.value}>
            {p.label}
          </option>
        ))}
      </select>

      <div className="mt-3 flex flex-wrap gap-2">
        {item.media_type === "video" && (
          <button
            onClick={handleExport}
            disabled={exporting}
            className="rounded-sm border border-line-light px-3 py-1.5 text-xs text-ink transition-colors hover:border-gold disabled:opacity-50"
          >
            {exporting ? "Exporting…" : "Export video"}
          </button>
        )}
        <button
          onClick={handleGenerateCaption}
          disabled={generatingCaption}
          className="rounded-sm border border-line-light px-3 py-1.5 text-xs text-ink transition-colors hover:border-gold disabled:opacity-50"
        >
          {generatingCaption ? "Writing…" : "✨ Generate caption + tags"}
        </button>
      </div>

      {exportedUrl && (
        <a
          href={exportedUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-block text-xs text-gold hover:underline"
        >
          Download {PLATFORMS.find((p) => p.value === platform)?.label} version
        </a>
      )}

      {captionResult && (
        <div className="mt-3 flex flex-col gap-3 rounded-sm bg-pearl p-3">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-stone">Caption</p>
            <p className="mt-1 text-sm text-ink">{captionResult.caption}</p>
          </div>
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-stone">Tags</p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {captionResult.hashtags.map((tag) => (
                <span key={tag} className="rounded-full bg-gold/15 px-2 py-0.5 text-xs text-ink">
                  {tag}
                </span>
              ))}
            </div>
          </div>
          <button onClick={handleCopyCaption} className="self-start text-xs text-gold hover:underline">
            Copy caption + tags
          </button>
        </div>
      )}
    </div>
  );
}

function ForSnsPanel({ accessToken, items }: { accessToken: string; items: PortfolioItem[] }) {
  const [selectedId, setSelectedId] = useState(items[0]?.id ?? "");

  useEffect(() => {
    if (!items.some((i) => i.id === selectedId)) {
      setSelectedId(items[0]?.id ?? "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  if (items.length === 0) {
    return (
      <p className="mt-6 text-sm text-stone">
        Nothing to work with yet — switch to the Portfolio tab and add a piece first.
      </p>
    );
  }

  const selected = items.find((i) => i.id === selectedId) ?? items[0];

  return (
    <div className="mt-6 flex flex-col gap-4 sm:flex-row">
      <div className="sm:w-40 sm:shrink-0">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-stone">Pick a piece</p>
        <div className="mt-2 grid grid-cols-4 gap-2 sm:grid-cols-3">
          {items.map((item) => (
            <button
              key={item.id}
              onClick={() => setSelectedId(item.id)}
              className={`relative aspect-square overflow-hidden rounded-sm border-2 bg-pearl transition-colors ${
                selected.id === item.id ? "border-gold" : "border-transparent hover:border-line-light"
              }`}
            >
              {item.image_url && <Image src={item.image_url} alt={item.caption ?? ""} fill className="object-cover" />}
              {item.media_type === "video" && (
                <span className="absolute bottom-0.5 right-0.5 rounded-full bg-ink/80 px-1.5 py-0.5 text-[8px] uppercase tracking-wide text-pearl">
                  Video
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1">
        <SocialToolsPanel accessToken={accessToken} item={selected} />
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
  const [generatingDescription, setGeneratingDescription] = useState(false);

  async function handleGenerateDescription() {
    if (!caption.trim() && !materials.trim()) {
      toast.push("Add a title or materials first — the AI writes from those.");
      return;
    }
    setGeneratingDescription(true);
    try {
      const text = await generatePortfolioDescription(accessToken, {
        title: caption.trim() || undefined,
        materials: materials.trim() || undefined,
      });
      setDescription(text);
      await handleSave("description", text);
    } catch (err) {
      toast.push(err instanceof Error ? err.message : "Could not generate a description.");
    } finally {
      setGeneratingDescription(false);
    }
  }

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
        <button
          onClick={handleGenerateDescription}
          disabled={generatingDescription || saving}
          className="self-start text-[11px] text-gold hover:underline disabled:opacity-50"
        >
          {generatingDescription ? "Writing…" : "✨ Generate with AI"}
        </button>
      </div>

      <div className="mt-1.5 flex justify-end">
        <button onClick={handleDelete} className="text-[11px] text-stone hover:text-ink">
          Remove
        </button>
      </div>
    </div>
  );
}

const PAGE_TABS = [
  { value: "portfolio", label: "Portfolio" },
  { value: "sns", label: "For SNS" },
] as const;
type PageTab = (typeof PAGE_TABS)[number]["value"];

export default function PortfolioPage() {
  const { accessToken, tenant } = useAuth();
  const toast = useToast();
  const [items, setItems] = useState<PortfolioItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<PageTab>("portfolio");
  const creditsRemaining = tenant ? tenant.monthly_credit_limit - tenant.credits_used_this_month : 0;
  const isSubscribed = tenant?.subscription_status === "active";
  const canAddMore = isSubscribed || items.length === 0;

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

      <div className="mt-4 flex gap-1 rounded-sm border border-line-light p-1 text-sm">
        {PAGE_TABS.map((t) => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={`flex-1 rounded-sm py-1.5 transition-colors ${
              tab === t.value ? "bg-ink text-pearl" : "text-stone hover:text-ink"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "portfolio" && (
        <>
          <p className="mt-4 text-sm text-stone">
            Shown publicly on your shop page — highlight your best work with a photo, title,
            materials, and story, or pull one straight from your design history.
          </p>

          <section className="mt-6 flex flex-col gap-4 rounded-sm border border-line-light bg-white p-4">
            {canAddMore ? (
              <>
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
              </>
            ) : (
              <UpgradeGate
                title="Free plan is limited to 1 portfolio piece"
                message="You've used your one free slot — subscribe for an unlimited portfolio."
              />
            )}
            <div className="border-t border-line-light pt-4">
              <h2 className="font-mono text-[10px] uppercase tracking-[0.2em] text-stone">Generate Video</h2>
              {isSubscribed ? (
                <>
                  <p className="mt-1 text-xs text-stone">
                    Videos stand out on your shop page. Generate one from a photo with AI, or upload your own.
                  </p>
                  <div className="mt-2">
                    <VideoForm
                      accessToken={accessToken}
                      creditsRemaining={creditsRemaining}
                      onAdded={(item) => setItems((prev) => [...prev, item])}
                    />
                  </div>
                </>
              ) : (
                <div className="mt-2">
                  <UpgradeGate
                    title="Video is a subscriber feature"
                    message="Generate or upload portfolio video — available on the subscription plan."
                  />
                </div>
              )}
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
        </>
      )}

      {tab === "sns" && (
        <>
          <p className="mt-4 text-sm text-stone">
            Turn a piece from your Portfolio into ready-to-post content — a platform-sized video
            export plus an AI-drafted caption and hashtags. Nothing here is posted for you; it's
            all downloaded/copied so you post it yourself.
          </p>
          {loading ? (
            <p className="mt-8 text-sm text-stone">Loading…</p>
          ) : (
            <ForSnsPanel accessToken={accessToken} items={items} />
          )}
        </>
      )}
    </div>
  );
}
