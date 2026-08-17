"use client";

import { useRef, useState } from "react";
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
  onCategoryChange: (id: string) => void;
  onMetalChange: (id: string) => void;
  onGemstoneToggle: (id: string) => void;
  onFinishChange: (id: string) => void;
  onWeightChange: (grams: number) => void;
  onGenerate: () => void;
  onGenerateFromReference: (file: File, note: string) => void;
  canGenerate: boolean;
  generating: boolean;
  creditsUsed: number;
  creditsLimit: number;
}

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
    onCategoryChange, onMetalChange, onGemstoneToggle, onFinishChange, onWeightChange,
    onGenerate, onGenerateFromReference, canGenerate, generating, creditsUsed, creditsLimit,
  } = props;

  const creditsRemaining = creditsLimit - creditsUsed;
  const lowCredits = creditsRemaining <= creditsLimit * 0.1;

  const referenceFileRef = useRef<HTMLInputElement>(null);
  const [referenceNote, setReferenceNote] = useState("");
  const [showReferenceUpload, setShowReferenceUpload] = useState(false);

  function handleReferenceSubmit() {
    const file = referenceFileRef.current?.files?.[0];
    if (!file) return;
    onGenerateFromReference(file, referenceNote);
    setReferenceNote("");
    if (referenceFileRef.current) referenceFileRef.current.value = "";
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
          <div className="grid grid-cols-2 gap-2">
            {categories.map((c) => (
              <button
                key={c.id}
                onClick={() => onCategoryChange(c.id)}
                className={`rounded-sm border px-3 py-2 text-left text-sm transition-colors ${
                  categoryId === c.id
                    ? "border-gold bg-gold/10 text-pearl"
                    : "border-line-dark text-stone hover:border-stone"
                }`}
              >
                {c.name}
              </button>
            ))}
          </div>
        </RailSection>

        <RailSection index="02" title="Metal">
          <div className="flex flex-wrap gap-2">
            {metals.map((m) => (
              <button
                key={m.id}
                onClick={() => onMetalChange(m.id)}
                className={`rounded-full border px-4 py-1.5 text-sm transition-colors ${
                  metalId === m.id
                    ? "border-gold bg-gold text-ink"
                    : "border-line-dark text-stone hover:border-stone"
                }`}
              >
                {m.name}
              </button>
            ))}
          </div>
        </RailSection>

        <RailSection index="03" title="Stones">
          <div className="flex flex-wrap gap-2">
            {gemstones.map((g) => {
              const active = gemstoneIds.includes(g.id);
              return (
                <button
                  key={g.id}
                  onClick={() => onGemstoneToggle(g.id)}
                  className={`rounded-full border px-4 py-1.5 text-sm transition-colors ${
                    active
                      ? "border-gold bg-gold text-ink"
                      : "border-line-dark text-stone hover:border-stone"
                  }`}
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
          <div className="flex flex-wrap gap-2">
            {finishes.map((f) => (
              <button
                key={f.id}
                onClick={() => onFinishChange(f.id)}
                className={`rounded-sm border px-3 py-1.5 text-sm transition-colors ${
                  finishId === f.id
                    ? "border-gold bg-gold/10 text-pearl"
                    : "border-line-dark text-stone hover:border-stone"
                }`}
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

        <RailSection index="06" title="Reference photo">
          <p className="text-xs text-stone">
            Customer showing you a photo in person? Upload it and generate a design guided by it.
          </p>
          <button
            onClick={() => setShowReferenceUpload((v) => !v)}
            className="mt-2 rounded-sm border border-line-dark px-3 py-1.5 text-xs text-stone hover:border-gold hover:text-pearl"
          >
            {showReferenceUpload ? "Hide" : "Use a reference photo"}
          </button>
          {showReferenceUpload && (
            <div className="mt-2 flex flex-col gap-2">
              <input
                ref={referenceFileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="text-xs text-stone"
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
                disabled={!canGenerate || generating}
                className="rounded-sm bg-gold py-2 text-sm font-medium text-ink hover:bg-gold-bright disabled:cursor-not-allowed disabled:bg-line-dark disabled:text-stone"
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
            Monthly credit limit reached — contact your admin to add more.
          </p>
        ) : (
          lowCredits && (
            <p className="mt-2 font-mono text-[10px] text-gold">
              Running low on credits — consider adding more.
            </p>
          )
        )}
      </div>
    </aside>
  );
}
