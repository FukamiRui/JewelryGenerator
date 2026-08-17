"use client";

import { useEffect, useState, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { fetchShops, type ShopSummary, type ShopFilterOptions } from "@/lib/api-client";
import { StarRating } from "@/components/ui/StarRating";

const RATING_OPTIONS = [
  { label: "Any rating", value: 0 },
  { label: "3+ stars", value: 3 },
  { label: "4+ stars", value: 4 },
  { label: "4.5+ stars", value: 4.5 },
];

function ShopCard({ shop }: { shop: ShopSummary }) {
  return (
    <Link
      href={`/shops/${shop.id}`}
      className="overflow-hidden rounded-sm border border-line-light bg-white hover:border-gold"
    >
      <div className="relative h-24 w-full bg-pearl">
        {shop.cover_image_url && <Image src={shop.cover_image_url} alt="" fill className="object-cover" />}
      </div>
      <div className="px-4 pb-4">
        <div className="relative -mt-6 h-12 w-12 overflow-hidden rounded-full border-2 border-white bg-pearl">
          {shop.logo_url && <Image src={shop.logo_url} alt="" fill className="object-cover" />}
        </div>

        <div className="mt-2 flex items-center gap-1.5">
          <p className="truncate font-display text-lg text-ink">{shop.company_name}</p>
          {shop.verified && (
            <span className="flex-shrink-0 rounded-full bg-gold/15 px-2 py-0.5 text-[9px] uppercase tracking-wide text-ink">
              ✓ Verified
            </span>
          )}
        </div>

        {shop.location && (
          <p className="mt-0.5 text-xs text-stone">
            {shop.location}
            {shop.distance_km !== null && ` · ${shop.distance_km} km away`}
          </p>
        )}
        {!shop.location && shop.distance_km !== null && (
          <p className="mt-0.5 text-xs text-stone">{shop.distance_km} km away</p>
        )}
        {shop.bio && <p className="mt-1 line-clamp-2 text-sm text-stone">{shop.bio}</p>}

        {shop.review_count > 0 && (
          <div className="mt-2 flex items-center gap-1.5">
            <StarRating rating={shop.average_rating ?? 0} />
            <span className="font-mono text-xs text-stone">({shop.review_count})</span>
          </div>
        )}

        {shop.specialty_materials.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {shop.specialty_materials.slice(0, 4).map((m) => (
              <span key={m} className="rounded-full bg-pearl px-2 py-0.5 text-[10px] text-stone">
                {m}
              </span>
            ))}
          </div>
        )}

        {shop.returns_accepted && <p className="mt-1.5 text-[11px] text-stone">✓ Returns accepted</p>}
      </div>
    </Link>
  );
}

function FilterPanel({
  options,
  location,
  setLocation,
  selectedMaterials,
  toggleMaterial,
  verifiedOnly,
  setVerifiedOnly,
  returnsOnly,
  setReturnsOnly,
  minRating,
  setMinRating,
}: {
  options: ShopFilterOptions;
  location: string;
  setLocation: (v: string) => void;
  selectedMaterials: string[];
  toggleMaterial: (v: string) => void;
  verifiedOnly: boolean;
  setVerifiedOnly: (v: boolean) => void;
  returnsOnly: boolean;
  setReturnsOnly: (v: boolean) => void;
  minRating: number;
  setMinRating: (v: number) => void;
}) {
  return (
    <div className="flex flex-col gap-4 rounded-sm border border-line-light bg-white p-4">
      <div>
        <label className="font-mono text-[10px] uppercase tracking-[0.2em] text-stone">Location</label>
        <input
          list="shop-locations"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="Any location"
          className="mt-1.5 w-full rounded-sm border border-line-light px-2 py-1.5 text-sm"
        />
        <datalist id="shop-locations">
          {options.locations.map((l) => (
            <option key={l} value={l} />
          ))}
        </datalist>
      </div>

      {options.materials.length > 0 && (
        <div>
          <label className="font-mono text-[10px] uppercase tracking-[0.2em] text-stone">
            Specialty materials
          </label>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {options.materials.map((m) => (
              <button
                key={m}
                onClick={() => toggleMaterial(m)}
                className={`rounded-full border px-2.5 py-1 text-xs ${
                  selectedMaterials.includes(m)
                    ? "border-gold bg-gold text-ink"
                    : "border-line-light text-stone hover:border-gold"
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <label className="font-mono text-[10px] uppercase tracking-[0.2em] text-stone">Minimum rating</label>
        <select
          value={minRating}
          onChange={(e) => setMinRating(Number(e.target.value))}
          className="mt-1.5 w-full rounded-sm border border-line-light px-2 py-1.5 text-sm"
        >
          {RATING_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      <label className="flex items-center gap-2 text-sm text-ink">
        <input type="checkbox" checked={verifiedOnly} onChange={(e) => setVerifiedOnly(e.target.checked)} />
        Verified shops only
      </label>
      <label className="flex items-center gap-2 text-sm text-ink">
        <input type="checkbox" checked={returnsOnly} onChange={(e) => setReturnsOnly(e.target.checked)} />
        Accepts returns
      </label>
    </div>
  );
}

export default function ShopsDirectoryPage() {
  const [shops, setShops] = useState<ShopSummary[]>([]);
  const [filterOptions, setFilterOptions] = useState<ShopFilterOptions>({ locations: [], materials: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [location, setLocation] = useState("");
  const [selectedMaterials, setSelectedMaterials] = useState<string[]>([]);
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [returnsOnly, setReturnsOnly] = useState(false);
  const [minRating, setMinRating] = useState(0);
  const [near, setNear] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);

  function toggleMaterial(m: string) {
    setSelectedMaterials((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]));
  }

  function handleSortByNearest() {
    if (near) {
      setNear(null); // toggle off
      return;
    }
    if (!navigator.geolocation) {
      setError("Your browser doesn't support location.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setNear({ lat: position.coords.latitude, lng: position.coords.longitude });
        setLocating(false);
      },
      () => {
        setError("Could not get your location — check your browser's location permission.");
        setLocating(false);
      },
      { timeout: 10_000 }
    );
  }

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { shops: results, filters } = await fetchShops({
        q: search || undefined,
        location: location || undefined,
        materials: selectedMaterials.length ? selectedMaterials : undefined,
        verified: verifiedOnly || undefined,
        returnsAccepted: returnsOnly || undefined,
        minRating: minRating || undefined,
        near: near ?? undefined,
      });
      setShops(results);
      setFilterOptions(filters);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load shops.");
    } finally {
      setLoading(false);
    }
  }, [search, location, selectedMaterials, verifiedOnly, returnsOnly, minRating, near]);

  useEffect(() => {
    const timeout = setTimeout(load, 250); // debounce as filters change
    return () => clearTimeout(timeout);
  }, [load]);

  return (
    <div className="min-h-screen bg-pearl">
      <div className="flex items-center justify-between border-b border-line-light bg-white px-6 py-3">
        <div className="flex items-center gap-6">
          <span className="font-display text-lg text-ink">Atelier</span>
          <a href="/feed" className="text-xs text-stone hover:text-ink">Feed</a>
        </div>
        <a href="/customer/login" className="text-xs text-stone hover:text-ink">
          Sign in
        </a>
      </div>

      <div className="mx-auto max-w-5xl px-8 py-12">
        <h1 className="font-display text-2xl text-ink">Shops</h1>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search shops by name"
            className="w-full max-w-sm rounded-sm border border-line-light bg-white px-3 py-2 text-sm"
          />
          <button
            onClick={handleSortByNearest}
            disabled={locating}
            className={`rounded-sm border px-3 py-2 text-sm disabled:opacity-50 ${
              near ? "border-gold bg-gold text-ink" : "border-line-light text-ink hover:border-gold"
            }`}
          >
            {locating ? "Locating…" : near ? "✓ Sorted by nearest" : "📍 Sort by nearest"}
          </button>
        </div>

        <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-[220px_1fr]">
          <FilterPanel
            options={filterOptions}
            location={location}
            setLocation={setLocation}
            selectedMaterials={selectedMaterials}
            toggleMaterial={toggleMaterial}
            verifiedOnly={verifiedOnly}
            setVerifiedOnly={setVerifiedOnly}
            returnsOnly={returnsOnly}
            setReturnsOnly={setReturnsOnly}
            minRating={minRating}
            setMinRating={setMinRating}
          />

          <div>
            {loading && <p className="text-sm text-stone">Loading…</p>}

            {!loading && error && (
              <div className="flex flex-col items-start gap-2">
                <p className="text-sm text-stone">{error}</p>
                <button onClick={load} className="text-xs text-gold hover:underline">
                  Retry
                </button>
              </div>
            )}

            {!loading && !error && shops.length === 0 && (
              <p className="text-sm text-stone">No shops match these filters.</p>
            )}

            {!loading && !error && shops.length > 0 && (
              <div className="grid grid-cols-2 gap-4">
                {shops.map((s) => (
                  <ShopCard key={s.id} shop={s} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
