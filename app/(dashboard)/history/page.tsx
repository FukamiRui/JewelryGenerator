"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useAuth } from "@/lib/auth-context";
import {
  fetchDesignHistory,
  downloadDesignPdf,
  updateDesignTitle,
  deleteDesign,
  type DesignHistoryRow,
} from "@/lib/api-client";
import { useToast } from "@/components/ui/Toast";

const ANGLE_LABELS: Record<string, string> = {
  front: "Front",
  side: "Side",
  diagonal: "Diagonal",
  bottom: "Bottom",
};

function DesignThumb({ src, small }: { src: string; small?: boolean }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div className="flex aspect-square items-center justify-center bg-pearl text-xs text-stone">
        {small ? "-" : "Image unavailable"}
      </div>
    );
  }
  return (
    <div className="relative aspect-square overflow-hidden rounded-sm bg-pearl">
      <Image src={src} alt="" fill className="object-cover" onError={() => setFailed(true)} />
    </div>
  );
}

// Designs generated together via "Generate 4 angles" share an angle_set_id —
// group them into a single card instead of 4 separate ones so History stays
// manageable (see the user complaint that the 4-angle results were hard to
// track as flat, ungrouped rows).
type HistoryGroup = { primary: DesignHistoryRow; members: DesignHistoryRow[] };

function groupDesigns(rows: DesignHistoryRow[]): HistoryGroup[] {
  const groups: HistoryGroup[] = [];
  const seenSets = new Map<string, HistoryGroup>();
  for (const row of rows) {
    if (row.angle_set_id) {
      const existing = seenSets.get(row.angle_set_id);
      if (existing) {
        existing.members.push(row);
        continue;
      }
      const group: HistoryGroup = { primary: row, members: [row] };
      seenSets.set(row.angle_set_id, group);
      groups.push(group);
    } else {
      groups.push({ primary: row, members: [row] });
    }
  }
  return groups;
}

interface HistoryCardProps {
  group: HistoryGroup;
  onRemoved: (ids: string[]) => void;
}

function HistoryCard({ group, onRemoved }: HistoryCardProps) {
  const { accessToken } = useAuth();
  const toast = useToast();
  const { primary, members } = group;
  const isAngleSet = members.length > 1;

  const [title, setTitle] = useState(primary.title ?? "");
  const [savingTitle, setSavingTitle] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleTitleBlur() {
    if (title === (primary.title ?? "")) return;
    setSavingTitle(true);
    try {
      await updateDesignTitle(accessToken, primary.id, title.trim() || null);
    } catch (err) {
      toast.push(err instanceof Error ? err.message : "Could not save the title.");
    } finally {
      setSavingTitle(false);
    }
  }

  async function handleDownloadPdf() {
    setDownloading(true);
    try {
      await downloadDesignPdf(accessToken, primary.id);
    } catch (err) {
      toast.push(err instanceof Error ? err.message : "Could not download the PDF.");
    } finally {
      setDownloading(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await Promise.all(members.map((m) => deleteDesign(accessToken, m.id)));
      onRemoved(members.map((m) => m.id));
    } catch (err) {
      toast.push(err instanceof Error ? err.message : "Could not delete this design.");
      setDeleting(false);
    }
  }

  return (
    <div className="rounded-sm border border-line-light bg-white p-3">
      <DesignThumb src={primary.generated_image_url} />

      {isAngleSet && (
        <div className="mt-2 grid grid-cols-4 gap-1">
          {members.map((m) => (
            <div key={m.id}>
              <DesignThumb src={m.generated_image_url} small />
              <p className="mt-0.5 text-center font-mono text-[8px] uppercase tracking-wide text-stone">
                {(m.angle && ANGLE_LABELS[m.angle]) ?? ""}
              </p>
            </div>
          ))}
        </div>
      )}

      <div className="mt-3">
        <div className="flex items-center gap-1.5">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={handleTitleBlur}
            placeholder="Untitled design"
            maxLength={200}
            disabled={savingTitle}
            className="w-full rounded-sm border border-line-light px-2 py-1 text-sm text-ink focus:border-gold"
          />
          {isAngleSet && (
            <span className="whitespace-nowrap rounded-full bg-gold/15 px-2 py-0.5 text-[10px] uppercase tracking-wide text-gold">
              4 angles
            </span>
          )}
        </div>
        <div className="mt-1.5 flex items-center gap-1.5">
          <p className="text-xs text-stone">{primary.customer_name ?? "No name recorded"}</p>
          {primary.is_personal && (
            <span className="rounded-full bg-gold/15 px-2 py-0.5 text-[10px] uppercase tracking-wide text-ink">
              Personal
            </span>
          )}
        </div>
        <p className="text-xs text-stone">{primary.categories?.name}</p>
        <p className="mt-1 font-mono text-sm text-ink">
          ${primary.calculated_price_usd.toLocaleString("en-US", { minimumFractionDigits: 2 })}
        </p>
        <p className="mt-1 font-mono text-[10px] text-stone">
          {new Date(primary.created_at).toLocaleDateString("en-US")}
        </p>
        <div className="mt-2 flex items-center justify-between text-xs">
          <div className="flex gap-3">
            <button
              onClick={handleDownloadPdf}
              disabled={downloading}
              className="text-gold hover:underline disabled:opacity-50"
            >
              {downloading ? "Preparing…" : "PDF"}
            </button>
            <a
              href={`/share/${primary.share_token}`}
              target="_blank"
              rel="noreferrer"
              className="text-gold hover:underline"
            >
              Share link
            </a>
          </div>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="text-stone hover:text-ink disabled:opacity-50"
          >
            {deleting ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function HistoryPage() {
  const { accessToken } = useAuth();
  const [designs, setDesigns] = useState<DesignHistoryRow[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load(query: string) {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchDesignHistory(accessToken, query || undefined);
      setDesigns(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load history.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  const groups = useMemo(() => groupDesigns(designs), [designs]);

  function handleRemoved(ids: string[]) {
    const idSet = new Set(ids);
    setDesigns((prev) => prev.filter((d) => !idSet.has(d.id)));
  }

  return (
    <div className="mx-auto h-full max-w-5xl overflow-y-auto px-8 py-12">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl text-ink">History</h1>
        <input
          placeholder="Search by customer name"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && load(search)}
          className="w-64 rounded-sm border border-line-light px-3 py-2 text-sm"
        />
      </div>

      {loading && <p className="mt-10 text-sm text-stone">Loading…</p>}

      {!loading && error && (
        <div className="mt-10 flex flex-col items-start gap-2">
          <p className="text-sm text-stone">{error}</p>
          <button onClick={() => load(search)} className="text-xs text-gold hover:underline">
            Retry
          </button>
        </div>
      )}

      {!loading && !error && groups.length === 0 && (
        <p className="mt-10 text-sm text-stone">
          {search
            ? `No designs found for "${search}".`
            : "No designs yet. Generate one from the simulator."}
        </p>
      )}

      {!loading && !error && groups.length > 0 && (
        <div className="mt-8 grid grid-cols-3 gap-6">
          {groups.map((group) => (
            <HistoryCard key={group.primary.id} group={group} onRemoved={handleRemoved} />
          ))}
        </div>
      )}
    </div>
  );
}
