"use client";

import { useState } from "react";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import { FileDropzone } from "@/components/ui/FileDropzone";
import { UpgradeGate } from "@/components/ui/UpgradeGate";
import type { Category, Material } from "@/types/domain";

interface SelectionRailProps {
  categories: Category[];
  metals: Material[];
  gemstones: Material[];
  finishes: Material[];
  categoryId: string | null;
  metalId: string | null;
  gemstoneIds: string[];
  finishId: string | null;
  weightGrams: number;
  sizeNote: string;
  fabricationNote: string;
  manualMaterialCost: string;
  manualProfit: string;
  onCategoryChange: (id: string) => void;
  onMetalChange: (id: string) => void;
  onGemstoneToggle: (id: string) => void;
  onFinishChange: (id: string) => void;
  onWeightChange: (grams: number) => void;
  onSizeNoteChange: (v: string) => void;
  onFabricationNoteChange: (v: string) => void;
  onManualMaterialCostChange: (v: string) => void;
  onManualProfitChange: (v: string) => void;
  onGenerate: () => void;
  onGenerateFromReference: (file: File, note: string) => void;
  canGenerate: boolean;
  generating: boolean;
  creditsUsed: number;
  creditsLimit: number;
  isSubscribed: boolean;
}

const TAB_BASE = "rounded-full px-3.5 py-1.5 text-sm transition-colors";
const TAB_ACTIVE = "bg-gold/15 text-gold";
const TAB_INACTIVE = "text-stone hover:text-pearl";

function RailSection({
  index,
  title,
  children,
}: {
  index: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-b border-line-dark py-6">
      <div className="mb-3 flex items-baseline gap-2">
        <span className="font-mono text-[10px] text-gold">{index}</span>
        <h3 className="font-sans text-xs uppercase tracking-[0.15em] text-pearl/70">{title}</h3>
      </div>
      {children}
    </section>
  );
}

export function SelectionRail(props: SelectionRailProps) {
  const {
    categories, metals, gemstones, finishes,
    categoryId, metalId, gemstoneIds, finishId, weightGrams,
    sizeNote, fabricationNote, manualMaterialCost, manualProfit,
    onCategoryChange, onMetalChange, onGemstoneToggle, onFinishChange, onWeightChange,
    onSizeNoteChange, onFabricationNoteChange, onManualMaterialCostChange, onManualProfitChange,
    onGenerate, onGenerateFromReference, canGenerate, generating, creditsUsed, creditsLimit,
    isSubscribed,
  } = props;

  const creditsRemaining = creditsLimit - creditsUsed;
  const lowCredits = creditsRemaining <= creditsLimit * 0.1;
  const manualPricingIncomplete =
    (manualMaterialCost.trim() !== "") !== (manualProfit.trim() !== "");

  const [referenceFile, setReferenceFile] = useState<File | null>(null);
  const [referenceNote, setReferenceNote] = useState("");
  const [showReferenceUpload, setShowReferenceUpload] = useState(false);
  const [referenceUploadKey, setReferenceUploadKey] = useState(0);
  const [showManualPricing, setShowManualPricing] = useState(false);

  function handleReferenceSubmit() {
    if (!referenceFile) return;
    onGenerateFromReference(referenceFile, referenceNote);
    setReferenceNote("");
    setReferenceFile(null);
    setReferenceUploadKey((k) => k + 1);
  }

  return (
    <aside className="flex h-full w-[340px] shrink-0 flex-col bg-ink px-6 text-pearl">
      <div className="pt-8 pb-4">
        <p className="font-display text-lg tracking-wide">Atelier Simulator</p>
        <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.2em] text-stone">
          Design workbench
        </p>
      </div>

      <div className="flex-1 overflow-y-auto">
        <RailSection index="01" title="Item">
          <div className="flex flex-wrap gap-1">
            {categories.map((c) => (
              <button
                key={c.id}
                onClick={() => onCategoryChange(c.id)}
                className={`${TAB_BASE} ${categoryId === c.id ? TAB_ACTIVE : TAB_INACTIVE}`}
              >
                {c.name}
              </button>
            ))}
          </div>
        </RailSection>

        <RailSection index="02" title="Metal">
          <div className="flex flex-wrap gap-1">
            {metals.map((m) => (
              <button
                key={m.id}
                onClick={() => onMetalChange(m.id)}
                className={`${TAB_BASE} ${metalId === m.id ? TAB_ACTIVE : TAB_INACTIVE}`}
              >
                {m.name}
              </button>
            ))}
          </div>
        </RailSection>

        <RailSection index="03" title="Stones">
          <div className="flex flex-wrap gap-1">
            {gemstones.map((g) => {
              const active = gemstoneIds.includes(g.id);
              return (
                <button
                  key={g.id}
                  onClick={() => onGemstoneToggle(g.id)}
                  className={`${TAB_BASE} ${active ? TAB_ACTIVE : TAB_INACTIVE}`}
                  aria-pressed={active}
                >
                  {g.name}
                </button>
              );
            })}
            {gemstones.length === 0 && (
              <p className="text-sm text-stone">No stone options set up yet.</p>
            )}
          </div>
        </RailSection>

        <RailSection index="04" title="Finish">
          <div className="flex flex-wrap gap-1">
            {finishes.map((f) => (
              <button
                key={f.id}
                onClick={() => onFinishChange(f.id)}
                className={`${TAB_BASE} ${finishId === f.id ? TAB_ACTIVE : TAB_INACTIVE}`}
              >
                {f.name}
              </button>
            ))}
          </div>
        </RailSection>

        <RailSection index="05" title="Estimated weight">
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0.1}
              step={0.1}
              value={weightGrams}
              onChange={(e) => onWeightChange(Number(e.target.value))}
              className="w-24 rounded-sm border border-line-dark bg-transparent px-3 py-1.5 font-mono text-sm text-pearl focus:border-gold"
            />
            <span className="font-mono text-xs text-stone">grams</span>
          </div>
        </RailSection>

        <RailSection index="06" title="Size & fabrication">
          <div className="flex flex-col gap-2">
            <input
              value={sizeNote}
              onChange={(e) => onSizeNoteChange(e.target.value)}
              placeholder="Size, e.g. US ring size 7, 18mm diameter"
              maxLength={200}
              className="rounded-sm border border-line-dark bg-transparent px-3 py-1.5 text-sm text-pearl placeholder:text-stone/70 focus:border-gold"
            />
            <div className="flex items-center gap-1.5">
              <input
                value={fabricationNote}
                onChange={(e) => onFabricationNoteChange(e.target.value)}
                placeholder="Tools/technique, e.g. hand-forged, CNC-milled"
                maxLength={200}
                className="w-full rounded-sm border border-line-dark bg-transparent px-3 py-1.5 text-sm text-pearl placeholder:text-stone/70 focus:border-gold"
              />
              <InfoTooltip label="Why mention tools/technique">
                Naming how the piece is actually made (hand-forged, cast, CNC-milled, hand-set stones)
                helps the AI render match your real process, and gives customers a reason beyond price to
                choose you.
              </InfoTooltip>
            </div>
          </div>
        </RailSection>

        <RailSection index="07" title="Pricing">
          <button
            onClick={() => setShowManualPricing((v) => !v)}
            className="rounded-sm border border-line-dark px-3 py-1.5 text-xs text-stone transition-colors hover:border-gold hover:text-pearl"
          >
            {showManualPricing ? "Use automatic pricing" : "Set material cost & profit manually"}
          </button>
          {showManualPricing && (
            <div className="mt-2 flex flex-col gap-2">
              <p className="text-xs text-stone">
                Overrides the automatic spot-price estimate below with exactly what you enter.
              </p>
              <label className="flex flex-col gap-1">
                <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-stone">
                  Material cost
                </span>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-stone">$</span>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={manualMaterialCost}
                    onChange={(e) => onManualMaterialCostChange(e.target.value)}
                    placeholder="0.00"
                    className="w-full rounded-sm border border-line-dark bg-transparent px-3 py-1.5 font-mono text-sm text-pearl focus:border-gold"
                  />
                </div>
              </label>
              <label className="flex flex-col gap-1">
                <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-stone">
                  Desired profit
                </span>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-stone">$</span>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={manualProfit}
                    onChange={(e) => onManualProfitChange(e.target.value)}
                    placeholder="0.00"
                    className="w-full rounded-sm border border-line-dark bg-transparent px-3 py-1.5 font-mono text-sm text-pearl focus:border-gold"
                  />
                </div>
              </label>
              {manualPricingIncomplete && (
                <p className="font-mono text-[10px] text-gold">
                  Enter both material cost and profit, or clear both to go back to automatic pricing.
                </p>
              )}
            </div>
          )}
        </RailSection>

        <RailSection index="08" title="Reference photo">
          {!isSubscribed ? (
            <UpgradeGate
              variant="dark"
              title="Reference photos are a subscriber feature"
              message="Upload a photo and guide the render toward it, available on the subscription plan."
            />
          ) : (
            <>
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs text-stone">
                  Customer showing you a photo in person? Upload it and generate a design guided by it.
                </p>
                <InfoTooltip label="How reference photos work">
                  The photo isn&apos;t copied. It guides an AI render toward that style/shape, combined with the
                  item, metal, and stones you&apos;ve picked above.
                </InfoTooltip>
              </div>
              <button
                onClick={() => setShowReferenceUpload((v) => !v)}
                className="mt-2 rounded-sm border border-line-dark px-3 py-1.5 text-xs text-stone transition-colors hover:border-gold hover:text-pearl"
              >
                {showReferenceUpload ? "Hide" : "Use a reference photo"}
              </button>
            </>
          )}
          {isSubscribed && showReferenceUpload && (
            <div className="mt-2 flex flex-col gap-2">
              <FileDropzone
                key={referenceUploadKey}
                variant="dark"
                accept="image/jpeg,image/png,image/webp"
                kind="photo"
                placeholder="Click or drop a photo"
                hint="JPG, PNG, or WebP"
                onFileSelected={setReferenceFile}
              />
              <input
                value={referenceNote}
                onChange={(e) => setReferenceNote(e.target.value)}
                placeholder="Notes (optional)"
                maxLength={300}
                className="rounded-sm border border-line-dark bg-transparent px-3 py-1.5 text-sm text-pearl focus:border-gold"
              />
              <button
                onClick={handleReferenceSubmit}
                disabled={!canGenerate || generating || !referenceFile}
                className="rounded-sm bg-gold py-2 text-sm font-medium text-ink transition-colors hover:bg-gold-bright disabled:cursor-not-allowed disabled:bg-line-dark disabled:text-stone"
              >
                {generating ? "Generating…" : "Generate from photo"}
              </button>
            </div>
          )}
        </RailSection>
      </div>

      <div className="border-t border-line-dark py-5">
        <div className="mb-3 flex items-center justify-between font-mono text-[11px]">
          <span className="text-stone">Credits this month</span>
          <span className={lowCredits ? "text-gold" : "text-pearl"}>
            {creditsUsed} / {creditsLimit}
          </span>
        </div>
        <button
          onClick={onGenerate}
          disabled={!canGenerate || generating}
          className="w-full rounded-sm bg-gold py-3 text-sm font-medium text-ink transition-colors hover:bg-gold-bright disabled:cursor-not-allowed disabled:bg-line-dark disabled:text-stone"
        >
          {generating ? "Generating…" : "Generate design"}
        </button>
        {creditsRemaining <= 0 ? (
          <p className="mt-2 font-mono text-[10px] text-gold">
            Monthly credit limit reached. Contact your admin to add more.
          </p>
        ) : (
          lowCredits && (
            <p className="mt-2 font-mono text-[10px] text-gold">
              Running low on credits. Consider adding more.
            </p>
          )
        )}
      </div>
    </aside>
  );
}
