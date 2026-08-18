"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Image from "next/image";
import { useAuth } from "@/lib/auth-context";
import {
  fetchStripeConnectStatus,
  startStripeOnboarding,
  startSubscriptionCheckout,
  startBillingPortal,
  startCreditPurchase,
  updateTenant,
  uploadTenantProfileImage,
  type StripeConnectStatus,
} from "@/lib/api-client";
import { useToast } from "@/components/ui/Toast";
import {
  SUBSCRIPTION_PRICE_USD,
  SUBSCRIPTION_MONTHLY_CREDITS,
  FREE_PLAN_MONTHLY_CREDITS,
  CREDIT_PACKS,
  creditsToUsd,
  MIN_CUSTOM_CREDITS,
  MAX_CUSTOM_CREDITS,
  MULTI_ANGLE_CREDIT_COST,
  VIDEO_GENERATION_CREDIT_COST,
  type CreditPackId,
} from "@/lib/credits";

const MAX_SPECIALTY_MATERIALS = 20;
const CREDIT_PACK_IDS: CreditPackId[] = ["small", "medium", "large"];

// A rough "here's what that actually buys" readout — credits alone don't
// mean much until they're translated into the actions a shop cares about.
function usageBreakdown(credits: number): { designs: number; angleSets: number; videos: number } {
  return {
    designs: credits,
    angleSets: Math.floor(credits / MULTI_ANGLE_CREDIT_COST),
    videos: Math.floor(credits / VIDEO_GENERATION_CREDIT_COST),
  };
}

function SubscriptionSection() {
  const { tenant, accessToken } = useAuth();
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [customCredits, setCustomCredits] = useState("50");

  const isActive = tenant?.subscription_status === "active";
  const isPastDue = tenant?.subscription_status === "past_due";
  const customCreditsNumber = Number(customCredits);
  const customValid =
    Number.isFinite(customCreditsNumber) &&
    customCreditsNumber >= MIN_CUSTOM_CREDITS &&
    customCreditsNumber <= MAX_CUSTOM_CREDITS;

  async function handleUpgrade() {
    setLoading(true);
    try {
      const url = await startSubscriptionCheckout(accessToken);
      window.location.href = url;
    } catch (err) {
      toast.push(err instanceof Error ? err.message : "Could not start checkout.");
      setLoading(false);
    }
  }

  async function handleManage() {
    setLoading(true);
    try {
      const url = await startBillingPortal(accessToken);
      window.location.href = url;
    } catch (err) {
      toast.push(err instanceof Error ? err.message : "Could not open the billing portal.");
      setLoading(false);
    }
  }

  async function handleBuyPack(pack: CreditPackId) {
    setLoading(true);
    try {
      const url = await startCreditPurchase(accessToken, { pack });
      window.location.href = url;
    } catch (err) {
      toast.push(err instanceof Error ? err.message : "Could not start checkout.");
      setLoading(false);
    }
  }

  async function handleBuyCustom() {
    if (!customValid) return;
    setLoading(true);
    try {
      const url = await startCreditPurchase(accessToken, { customCredits: customCreditsNumber });
      window.location.href = url;
    } catch (err) {
      toast.push(err instanceof Error ? err.message : "Could not start checkout.");
      setLoading(false);
    }
  }

  return (
    <section className="rounded-sm border border-line-light bg-white p-6">
      <h2 className="font-mono text-[10px] uppercase tracking-[0.2em] text-stone">Subscription</h2>

      {isActive ? (
        <>
          <p className="mt-2 text-sm text-stone">
            ✓ Active · ${SUBSCRIPTION_PRICE_USD}/month, {SUBSCRIPTION_MONTHLY_CREDITS} credits/month, plus an
            unwatermarked unlimited portfolio, reference-photo &amp; sketch generation, and video.
          </p>
          <button
            onClick={handleManage}
            disabled={loading}
            className="mt-4 rounded-sm border border-line-light px-4 py-2 text-sm text-ink transition-colors hover:border-gold disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Redirecting…" : "Manage billing"}
          </button>
        </>
      ) : (
        <>
          <p className="mt-2 text-sm text-stone">
            {isPastDue
              ? "Your last payment failed — update your card to keep full access."
              : `Free plan · ${FREE_PLAN_MONTHLY_CREDITS} credits/month, generated images are watermarked.`}
          </p>
          <ul className="mt-2.5 flex flex-col gap-1 text-xs text-stone">
            <li>— Portfolio limited to 1 piece</li>
            <li>— No reference-photo or sketch-and-regenerate generation</li>
            <li>— No video generation</li>
          </ul>
          <p className="mt-3 text-sm text-stone">
            Subscribing isn&apos;t just more credits — ${SUBSCRIPTION_PRICE_USD}/month unlocks{" "}
            {SUBSCRIPTION_MONTHLY_CREDITS} credits/month with no watermark, an unlimited portfolio,
            reference-photo &amp; sketch generation, and video.
          </p>
          <button
            onClick={handleUpgrade}
            disabled={loading}
            className="mt-4 rounded-sm bg-gold px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-gold-bright disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Redirecting…" : `Upgrade for $${SUBSCRIPTION_PRICE_USD}/month`}
          </button>
        </>
      )}

      <div className="mt-6 border-t border-line-light pt-5">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-stone">Run out mid-month?</p>
        <p className="mt-1.5 text-sm text-stone">
          Buy extra credits any time — added on top of your current allowance until the next reset.
        </p>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {CREDIT_PACK_IDS.map((id) => {
            const pack = CREDIT_PACKS[id];
            return (
              <button
                key={id}
                onClick={() => handleBuyPack(id)}
                disabled={loading}
                className="flex flex-col items-center gap-1.5 rounded-xl border border-line-light bg-pearl/50 px-3 py-5 transition-all hover:-translate-y-0.5 hover:border-gold hover:shadow-[0_10px_28px_-12px_rgba(184,147,95,0.45)] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
              >
                <span className="font-display text-2xl text-ink">+{pack.credits}</span>
                <span className="font-mono text-[9px] uppercase tracking-[0.15em] text-stone">credits</span>
                <span className="mt-1 rounded-full bg-gold/15 px-2.5 py-0.5 text-xs font-medium text-ink">
                  ${pack.priceUsd}
                </span>
                <span className="mt-1 text-[10px] leading-tight text-stone">
                  ≈{usageBreakdown(pack.credits).designs} designs
                </span>
              </button>
            );
          })}
          <button
            onClick={() => setCustomOpen((v) => !v)}
            className={`flex flex-col items-center justify-center gap-1.5 rounded-xl border px-3 py-5 transition-all hover:-translate-y-0.5 ${
              customOpen
                ? "border-gold bg-gold/5 shadow-[0_10px_28px_-12px_rgba(184,147,95,0.45)]"
                : "border-line-light bg-pearl/50 hover:border-gold hover:shadow-[0_10px_28px_-12px_rgba(184,147,95,0.45)]"
            }`}
          >
            <span className="font-display text-2xl text-gold">+</span>
            <span className="font-mono text-[9px] uppercase tracking-[0.15em] text-stone">Custom</span>
          </button>
        </div>

        {customOpen && (
          <div className="mt-3 flex flex-wrap items-end gap-3 rounded-xl border border-gold/40 bg-gold/5 p-4">
            <label className="flex flex-col gap-1">
              <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-stone">Credits</span>
              <input
                type="number"
                min={MIN_CUSTOM_CREDITS}
                max={MAX_CUSTOM_CREDITS}
                value={customCredits}
                onChange={(e) => setCustomCredits(e.target.value)}
                className="w-28 rounded-sm border border-line-light bg-white px-3 py-1.5 font-mono text-sm text-ink focus:border-gold"
              />
            </label>
            <p className="pb-1.5 text-sm text-stone">
              = <span className="font-medium text-ink">${creditsToUsd(customValid ? customCreditsNumber : 0).toFixed(2)}</span>
            </p>
            {customValid && (
              <p className="w-full text-xs text-stone">
                ≈ Approximately usable as{" "}
                <span className="text-ink">{usageBreakdown(customCreditsNumber).designs} designs</span>,{" "}
                <span className="text-ink">{usageBreakdown(customCreditsNumber).angleSets} four-angle sets</span>, or{" "}
                <span className="text-ink">{usageBreakdown(customCreditsNumber).videos} videos</span> — mixed and
                matched however you like.
              </p>
            )}
            {!customValid && (
              <p className="w-full font-mono text-[10px] text-gold">
                Enter between {MIN_CUSTOM_CREDITS} and {MAX_CUSTOM_CREDITS} credits.
              </p>
            )}
            <button
              onClick={handleBuyCustom}
              disabled={loading || !customValid}
              className="ml-auto rounded-full bg-gold px-5 py-2 text-xs font-medium uppercase tracking-wide text-ink transition-colors hover:bg-gold-bright disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? "Redirecting…" : "Buy credits"}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

function ShopProfileSection() {
  const { tenant, accessToken, refreshTenant } = useAuth();
  const toast = useToast();
  const logoInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  const [bio, setBio] = useState(tenant?.bio ?? "");
  const [location, setLocation] = useState(tenant?.location ?? "");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    tenant?.latitude != null && tenant?.longitude != null
      ? { lat: tenant.latitude, lng: tenant.longitude }
      : null
  );
  const [locatingDevice, setLocatingDevice] = useState(false);
  const [materials, setMaterials] = useState<string[]>(tenant?.specialty_materials ?? []);
  const [materialDraft, setMaterialDraft] = useState("");
  const [foundedYear, setFoundedYear] = useState<string>(
    tenant?.founded_year != null ? String(tenant.founded_year) : ""
  );
  const [contactEmail, setContactEmail] = useState(tenant?.contact_email ?? "");
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);

  function handleUseCurrentLocation() {
    if (!navigator.geolocation) {
      toast.push("Your browser doesn't support location.");
      return;
    }
    setLocatingDevice(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCoords({ lat: position.coords.latitude, lng: position.coords.longitude });
        setLocatingDevice(false);
        toast.push("Location captured — remember to save.");
      },
      () => {
        toast.push("Could not get your location — check your browser's location permission.");
        setLocatingDevice(false);
      },
      { timeout: 10_000 }
    );
  }

  function addMaterial() {
    const value = materialDraft.trim();
    if (!value) return;
    if (materials.includes(value)) {
      setMaterialDraft("");
      return;
    }
    if (materials.length >= MAX_SPECIALTY_MATERIALS) {
      toast.push(`You can list up to ${MAX_SPECIALTY_MATERIALS} materials.`);
      return;
    }
    setMaterials((prev) => [...prev, value]);
    setMaterialDraft("");
  }

  function removeMaterial(value: string) {
    setMaterials((prev) => prev.filter((m) => m !== value));
  }

  async function handleSave() {
    const trimmedYear = foundedYear.trim();
    if (trimmedYear && (!/^\d+$/.test(trimmedYear) || Number(trimmedYear) > new Date().getFullYear())) {
      toast.push("Founded year must be a valid year (e.g. 2015).");
      return;
    }
    const trimmedEmail = contactEmail.trim();
    if (trimmedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      toast.push("Contact email must be a valid email address.");
      return;
    }
    setSaving(true);
    try {
      await updateTenant(accessToken, {
        bio: bio.trim() || null,
        location: location.trim() || null,
        latitude: coords?.lat ?? null,
        longitude: coords?.lng ?? null,
        specialty_materials: materials,
        founded_year: trimmedYear ? Number(trimmedYear) : null,
        contact_email: trimmedEmail || null,
      });
      await refreshTenant();
      toast.push("Profile updated.");
    } catch (err) {
      toast.push(err instanceof Error ? err.message : "Could not save your profile.");
    } finally {
      setSaving(false);
    }
  }

  async function handleImageChange(kind: "logo" | "cover", file: File | undefined) {
    if (!file) return;
    kind === "logo" ? setUploadingLogo(true) : setUploadingCover(true);
    try {
      await uploadTenantProfileImage(accessToken, kind, file);
      await refreshTenant();
      toast.push(kind === "logo" ? "Logo updated." : "Cover photo updated.");
    } catch (err) {
      toast.push(err instanceof Error ? err.message : "Could not upload that image.");
    } finally {
      kind === "logo" ? setUploadingLogo(false) : setUploadingCover(false);
    }
  }

  return (
    <section className="rounded-sm border border-line-light bg-white p-6">
      <h2 className="font-mono text-[10px] uppercase tracking-[0.2em] text-stone">Shop profile</h2>
      <p className="mt-2 text-sm text-stone">
        Shown publicly on your shop page — the page a customer sees when you share your link with them.
      </p>

      <div className="relative mt-4 h-32 w-full overflow-hidden rounded-sm bg-pearl">
        {tenant?.cover_image_url && (
          <Image src={tenant.cover_image_url} alt="" fill className="object-cover" />
        )}
        <button
          onClick={() => coverInputRef.current?.click()}
          disabled={uploadingCover}
          className="absolute bottom-2 right-2 rounded-sm bg-ink/80 px-3 py-1 text-xs text-pearl transition-colors hover:bg-ink disabled:opacity-50"
        >
          {uploadingCover ? "Uploading…" : "Change cover photo"}
        </button>
        <input
          ref={coverInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => handleImageChange("cover", e.target.files?.[0])}
        />
      </div>

      <div className="mt-4 flex items-center gap-3">
        <div className="relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-full bg-pearl">
          {tenant?.logo_url && <Image src={tenant.logo_url} alt="" fill className="object-cover" />}
        </div>
        <button
          onClick={() => logoInputRef.current?.click()}
          disabled={uploadingLogo}
          className="rounded-sm border border-line-light px-3 py-1.5 text-xs text-ink transition-colors hover:border-gold disabled:opacity-50"
        >
          {uploadingLogo ? "Uploading…" : "Change logo"}
        </button>
        <input
          ref={logoInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => handleImageChange("logo", e.target.files?.[0])}
        />
      </div>

      <label className="mt-4 block text-xs uppercase tracking-wide text-stone">Location</label>
      <input
        value={location}
        onChange={(e) => setLocation(e.target.value)}
        placeholder="e.g. Tokyo, Japan"
        maxLength={200}
        className="mt-1 w-full rounded-sm border border-line-light px-2 py-1.5 text-sm"
      />
      <div className="mt-1.5 flex items-center gap-2">
        <button
          onClick={handleUseCurrentLocation}
          disabled={locatingDevice}
          className="text-xs text-gold hover:underline disabled:opacity-50"
        >
          {locatingDevice ? "Locating…" : "📍 Use my current location"}
        </button>
        {coords && <span className="text-xs text-stone">Pinned</span>}
      </div>

      <label className="mt-4 block text-xs uppercase tracking-wide text-stone">Founded year</label>
      <input
        value={foundedYear}
        onChange={(e) => setFoundedYear(e.target.value)}
        placeholder="e.g. 2015"
        inputMode="numeric"
        maxLength={4}
        className="mt-1 w-32 rounded-sm border border-line-light px-2 py-1.5 text-sm"
      />
      {foundedYear.trim() && /^\d{4}$/.test(foundedYear.trim()) && (
        <p className="mt-1 text-xs text-stone">
          Shown as &quot;{new Date().getFullYear() - Number(foundedYear.trim())} years in the craft&quot; on your
          shop page.
        </p>
      )}

      <label className="mt-4 block text-xs uppercase tracking-wide text-stone">Contact email (optional)</label>
      <input
        type="email"
        value={contactEmail}
        onChange={(e) => setContactEmail(e.target.value)}
        placeholder="e.g. hello@yourshop.com"
        maxLength={200}
        className="mt-1 w-full rounded-sm border border-line-light px-2 py-1.5 text-sm"
      />
      <p className="mt-1 text-xs text-stone">
        Shown on your shop page as a general contact — separate from in-chat messaging. Leave blank to hide it.
      </p>

      <label className="mt-4 block text-xs uppercase tracking-wide text-stone">Bio</label>
      <textarea
        value={bio}
        onChange={(e) => setBio(e.target.value)}
        placeholder="Tell customers what kind of shop or craftsperson you are…"
        maxLength={1000}
        rows={3}
        className="mt-1 w-full rounded-sm border border-line-light px-2 py-1.5 text-sm"
      />

      <label className="mt-4 block text-xs uppercase tracking-wide text-stone">Specialty materials</label>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {materials.map((m) => (
          <span
            key={m}
            className="flex items-center gap-1 rounded-full border border-gold/60 bg-gold/10 px-2.5 py-1 text-xs text-ink"
          >
            {m}
            <button onClick={() => removeMaterial(m)} className="text-stone hover:text-ink">
              ×
            </button>
          </span>
        ))}
      </div>
      <div className="mt-2 flex gap-2">
        <input
          value={materialDraft}
          onChange={(e) => setMaterialDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addMaterial();
            }
          }}
          placeholder="e.g. Platinum, Sapphire, Rose Gold"
          maxLength={50}
          className="flex-1 rounded-sm border border-line-light px-2 py-1.5 text-sm"
        />
        <button
          onClick={addMaterial}
          className="rounded-sm border border-line-light px-3 py-1.5 text-xs text-ink transition-colors hover:border-gold"
        >
          Add
        </button>
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className="mt-4 rounded-sm bg-ink px-4 py-2 text-sm text-pearl transition-colors hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {saving ? "Saving…" : "Save profile"}
      </button>
    </section>
  );
}

function ReturnsPolicySection() {
  const { tenant, accessToken, refreshTenant } = useAuth();
  const toast = useToast();
  const [returnsAccepted, setReturnsAccepted] = useState(tenant?.returns_accepted ?? false);
  const [note, setNote] = useState(tenant?.return_policy_note ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      await updateTenant(accessToken, {
        returns_accepted: returnsAccepted,
        return_policy_note: returnsAccepted ? note.trim() || null : null,
      });
      await refreshTenant();
      toast.push("Returns policy updated.");
    } catch (err) {
      toast.push(err instanceof Error ? err.message : "Could not save your returns policy.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-sm border border-line-light bg-white p-6">
      <h2 className="font-mono text-[10px] uppercase tracking-[0.2em] text-stone">Returns policy</h2>
      <p className="mt-2 text-sm text-stone">
        Shown as a badge on your shop page and on order proposals, so customers know before they buy.
      </p>

      <label className="mt-4 flex items-center gap-2 text-sm text-ink">
        <input
          type="checkbox"
          checked={returnsAccepted}
          onChange={(e) => setReturnsAccepted(e.target.checked)}
        />
        This shop accepts returns
      </label>

      {returnsAccepted && (
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Optional detail (e.g. 14 days, unworn only)"
          maxLength={300}
          className="mt-2 w-full rounded-sm border border-line-light px-2 py-1.5 text-sm"
        />
      )}

      <button
        onClick={handleSave}
        disabled={saving}
        className="mt-4 rounded-sm bg-ink px-4 py-2 text-sm text-pearl transition-colors hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {saving ? "Saving…" : "Save"}
      </button>
    </section>
  );
}

function DesignRevisionsSection() {
  const { tenant, accessToken, refreshTenant } = useAuth();
  const toast = useToast();
  const [maxRevisions, setMaxRevisions] = useState(tenant?.max_design_revisions ?? 3);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      await updateTenant(accessToken, { max_design_revisions: maxRevisions });
      await refreshTenant();
      toast.push("Design revision limit updated.");
    } catch (err) {
      toast.push(err instanceof Error ? err.message : "Could not save this setting.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-sm border border-line-light bg-white p-6">
      <h2 className="font-mono text-[10px] uppercase tracking-[0.2em] text-stone">Design revisions</h2>
      <p className="mt-2 text-sm text-stone">
        How many times a customer can regenerate a design online before they need your OK for more.
        Unlimited regeneration either burns credits forever or leaves an unhappy customer stuck — once
        they hit the limit, they see design-advisor suggestions and can upload a reference photo instead,
        or you can grant more tries directly from the conversation.
      </p>

      <label className="mt-4 block text-xs uppercase tracking-wide text-stone">
        Max tries per request (1–5)
      </label>
      <select
        value={maxRevisions}
        onChange={(e) => setMaxRevisions(Number(e.target.value))}
        className="mt-1.5 w-32 rounded-sm border border-line-light px-2 py-1.5 text-sm"
      >
        {[1, 2, 3, 4, 5].map((n) => (
          <option key={n} value={n}>{n}</option>
        ))}
      </select>

      <button
        onClick={handleSave}
        disabled={saving}
        className="mt-4 block rounded-sm bg-ink px-4 py-2 text-sm text-pearl hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {saving ? "Saving…" : "Save"}
      </button>
    </section>
  );
}

export default function SettingsPage() {
  const { accessToken, refreshTenant } = useAuth();
  const toast = useToast();
  const searchParams = useSearchParams();

  const [status, setStatus] = useState<StripeConnectStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const s = await fetchStripeConnectStatus(accessToken);
      setStatus(s);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load payment settings.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  useEffect(() => {
    if (searchParams.get("stripe") === "return") {
      toast.push("Stripe onboarding submitted — this can take a moment to verify.");
    }
    if (searchParams.get("subscription") === "success") {
      toast.push("Subscription started — this can take a moment to verify.");
      refreshTenant();
    }
    if (searchParams.get("subscription") === "cancelled") {
      toast.push("Checkout cancelled.");
    }
    if (searchParams.get("credits") === "success") {
      toast.push("Credits purchased — this can take a moment to verify.");
      refreshTenant();
    }
    if (searchParams.get("credits") === "cancelled") {
      toast.push("Checkout cancelled.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, toast]);

  async function handleConnect() {
    setStarting(true);
    try {
      const url = await startStripeOnboarding(accessToken);
      window.location.href = url;
    } catch (err) {
      toast.push(err instanceof Error ? err.message : "Could not start Stripe onboarding.");
      setStarting(false);
    }
  }

  return (
    <div className="mx-auto flex h-full max-w-2xl flex-col gap-6 overflow-y-auto px-8 py-12">
      <h1 className="font-display text-2xl text-ink">Settings</h1>

      <SubscriptionSection />
      <ShopProfileSection />

      <section className="rounded-sm border border-line-light bg-white p-6">
        <h2 className="font-mono text-[10px] uppercase tracking-[0.2em] text-stone">
          Payments (Stripe Connect)
        </h2>
        <p className="mt-2 text-sm text-stone">
          Connect a Stripe account to receive online payments from customers. The platform takes
          a 5% commission from each order; you receive the rest, minus Stripe&apos;s standard card
          processing fee, which is added to the customer&apos;s charge.
        </p>

        {loading && <p className="mt-4 text-sm text-stone">Loading…</p>}

        {!loading && error && (
          <div className="mt-4 flex flex-col items-start gap-2">
            <p className="text-sm text-stone">{error}</p>
            <button onClick={load} className="text-xs text-gold hover:underline">
              Retry
            </button>
          </div>
        )}

        {!loading && !error && status && (
          <div className="mt-4 flex items-center justify-between">
            <div>
              <p className="text-sm text-ink">
                {status.charges_enabled
                  ? "✓ Connected — you can accept online payments."
                  : status.connected
                    ? "Onboarding started but not finished — Stripe still needs a few details from you."
                    : "Not connected yet."}
              </p>
            </div>
            <button
              onClick={handleConnect}
              disabled={starting}
              className="rounded-sm bg-ink px-4 py-2 text-sm text-pearl transition-colors hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {starting ? "Redirecting…" : status.connected ? "Continue setup" : "Connect Stripe"}
            </button>
          </div>
        )}
      </section>

      <ReturnsPolicySection />
      <DesignRevisionsSection />
    </div>
  );
}
