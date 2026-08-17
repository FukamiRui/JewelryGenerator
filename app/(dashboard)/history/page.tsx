"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useAuth } from "@/lib/auth-context";
import { fetchDesignHistory, type DesignHistoryRow } from "@/lib/api-client";

function DesignThumb({ src }: { src: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div className="flex aspect-square items-center justify-center bg-pearl text-xs text-stone">
        Image unavailable
      </div>
    );
  }
  return (
    <div className="relative aspect-square overflow-hidden rounded-sm bg-pearl">
      <Image src={src} alt="" fill className="object-cover" onError={() => setFailed(true)} />
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

      {!loading && !error && designs.length === 0 && (
        <p className="mt-10 text-sm text-stone">
          {search
            ? `No designs found for "${search}".`
            : "No designs yet — generate one from the simulator."}
        </p>
      )}

      {!loading && !error && designs.length > 0 && (
        <div className="mt-8 grid grid-cols-3 gap-6">
          {designs.map((d) => (
            <div key={d.id} className="rounded-sm border border-line-light bg-white p-3">
              <DesignThumb src={d.generated_image_url} />
              <div className="mt-3">
                <p className="text-sm text-ink">{d.customer_name ?? "No name recorded"}</p>
                <p className="text-xs text-stone">{d.categories?.name}</p>
                <p className="mt-1 font-mono text-sm text-ink">
                  ${d.calculated_price_usd.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                </p>
                <p className="mt-1 font-mono text-[10px] text-stone">
                  {new Date(d.created_at).toLocaleDateString("en-US")}
                </p>
                <div className="mt-2 flex gap-3 text-xs">
                  <a href={`/api/design/pdf/${d.id}`} target="_blank" rel="noreferrer" className="text-gold hover:underline">
                    PDF
                  </a>
                  <a href={`/share/${d.share_token}`} target="_blank" rel="noreferrer" className="text-gold hover:underline">
                    Share link
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
