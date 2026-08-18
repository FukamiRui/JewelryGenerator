"use client";

import { useEffect, useState } from "react";
import { SelectionRail } from "@/components/simulator/SelectionRail";
import { ResultCanvas } from "@/components/simulator/ResultCanvas";
import { SketchCanvas } from "@/components/simulator/SketchCanvas";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/components/ui/Toast";
import {
  fetchCategories,
  fetchMaterials,
  generateDesign,
  generateDesignFromReferenceInStore,
  generateAngleViews,
  downloadDesignPdf,
  ApiRequestError,
  type AngleView,
} from "@/lib/api-client";
import type { Category, Material, GenerateDesignResponse } from "@/types/domain";

export default function SimulatorPage() {
  const { accessToken, tenant, refreshTenant } = useAuth();
  const toast = useToast();

  const [categories, setCategories] = useState<Category[]>([]);
  const [metals, setMetals] = useState<Material[]>([]);
  const [gemstones, setGemstones] = useState<Material[]>([]);
  const [finishes, setFinishes] = useState<Material[]>([]);
  const [mastersLoading, setMastersLoading] = useState(true);
  const [mastersError, setMastersError] = useState<string | null>(null);

  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [metalId, setMetalId] = useState<string | null>(null);
  const [gemstoneIds, setGemstoneIds] = useState<string[]>([]);
  const [finishId, setFinishId] = useState<string | null>(null);
  const [weightGrams, setWeightGrams] = useState(3.5);
  const [sizeNote, setSizeNote] = useState("");
  const [fabricationNote, setFabricationNote] = useState("");
  const [manualMaterialCost, setManualMaterialCost] = useState("");
  const [manualProfit, setManualProfit] = useState("");

  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<GenerateDesignResponse | null>(null);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [showSketch, setShowSketch] = useState(false);
  const [generatingAngles, setGeneratingAngles] = useState(false);
  const [angleViews, setAngleViews] = useState<AngleView[] | null>(null);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  async function loadMasters() {
    setMastersLoading(true);
    setMastersError(null);
    try {
      const [cats, mats] = await Promise.all([
        fetchCategories(accessToken),
        fetchMaterials(accessToken),
      ]);
      setCategories(cats);
      setMetals(mats.filter((m) => m.material_type === "metal"));
      setGemstones(mats.filter((m) => m.material_type === "gemstone"));
      setFinishes(mats.filter((m) => m.material_type === "finish"));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not load your catalog.";
      setMastersError(message);
      toast.push(message);
    } finally {
      setMastersLoading(false);
    }
  }

  useEffect(() => {
    loadMasters();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  function toggleGemstone(id: string) {
    setGemstoneIds((prev) =>
      prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id]
    );
  }

  const manualPricingIncomplete =
    (manualMaterialCost.trim() !== "") !== (manualProfit.trim() !== "");

  function specsFields() {
    return {
      size_note: sizeNote.trim() || undefined,
      fabrication_note: fabricationNote.trim() || undefined,
      manual_material_cost_usd: manualMaterialCost.trim() ? Number(manualMaterialCost) : undefined,
      manual_profit_usd: manualProfit.trim() ? Number(manualProfit) : undefined,
    };
  }

  async function handleGenerate() {
    if (!categoryId || !metalId) return;
    if (weightGrams <= 0) {
      toast.push("Enter a weight greater than zero.");
      return;
    }

    setGenerating(true);
    setGenerateError(null);
    setAngleViews(null);
    try {
      const response = await generateDesign(accessToken, {
        category_id: categoryId,
        metal_material_id: metalId,
        gemstone_material_ids: gemstoneIds,
        finish_material_id: finishId,
        estimated_weight_grams: weightGrams,
        is_personal: true,
        ...specsFields(),
      });
      setResult(response);
      if (response.cached) {
        toast.push("Reused a matching design from the last 30 days.", "info");
      }
      // Credit counter changed server-side — refresh the navbar's number.
      await refreshTenant();
    } catch (err) {
      if (err instanceof ApiRequestError && err.code === "credit_limit") {
        toast.push(err.message);
      } else {
        const message = err instanceof Error ? err.message : "Generation failed. Please try again.";
        setGenerateError(message);
        toast.push(message);
      }
    } finally {
      setGenerating(false);
    }
  }

  async function handleGenerateFromReference(file: File, note: string) {
    if (!categoryId || !metalId) return;
    if (weightGrams <= 0) {
      toast.push("Enter a weight greater than zero.");
      return;
    }

    setGenerating(true);
    setGenerateError(null);
    setAngleViews(null);
    try {
      const response = await generateDesignFromReferenceInStore(accessToken, {
        category_id: categoryId,
        metal_material_id: metalId,
        gemstone_material_ids: gemstoneIds,
        finish_material_id: finishId,
        estimated_weight_grams: weightGrams,
        image: file,
        note: note || undefined,
        is_personal: true,
        ...specsFields(),
      });
      setResult(response);
      await refreshTenant();
    } catch (err) {
      if (err instanceof ApiRequestError && err.code === "credit_limit") {
        toast.push(err.message);
      } else {
        const message = err instanceof Error ? err.message : "Generation failed. Please try again.";
        setGenerateError(message);
        toast.push(message);
      }
    } finally {
      setGenerating(false);
    }
  }

  async function handleSketchSubmit(annotatedImage: File, note: string) {
    if (!categoryId || !metalId) return;

    setGenerating(true);
    setGenerateError(null);
    setAngleViews(null);
    try {
      const response = await generateDesignFromReferenceInStore(accessToken, {
        category_id: categoryId,
        metal_material_id: metalId,
        gemstone_material_ids: gemstoneIds,
        finish_material_id: finishId,
        estimated_weight_grams: weightGrams,
        image: annotatedImage,
        note: note ? `Sketch markup: ${note}` : "Follow the hand-drawn markup on the reference image.",
        is_personal: true,
        ...specsFields(),
      });
      setResult(response);
      setShowSketch(false);
      await refreshTenant();
    } catch (err) {
      if (err instanceof ApiRequestError && err.code === "credit_limit") {
        toast.push(err.message);
      } else {
        toast.push(err instanceof Error ? err.message : "Could not regenerate from that sketch.");
      }
    } finally {
      setGenerating(false);
    }
  }

  async function handleDownloadPdf() {
    if (!result) return;
    setDownloadingPdf(true);
    try {
      await downloadDesignPdf(accessToken, result.design_id);
    } catch (err) {
      toast.push(err instanceof Error ? err.message : "Could not download the PDF.");
    } finally {
      setDownloadingPdf(false);
    }
  }

  async function handleGenerateAngles() {
    if (!result) return;
    setGeneratingAngles(true);
    try {
      const response = await generateAngleViews(accessToken, result.design_id);
      setAngleViews(response.views);
      await refreshTenant();
    } catch (err) {
      if (err instanceof ApiRequestError && err.code === "credit_limit") {
        toast.push(err.message);
      } else {
        toast.push(err instanceof Error ? err.message : "Could not generate angle views.");
      }
    } finally {
      setGeneratingAngles(false);
    }
  }

  const creditsExhausted =
    !!tenant && tenant.credits_used_this_month >= tenant.monthly_credit_limit;
  const isSubscribed = tenant?.subscription_status === "active";

  if (mastersLoading) {
    return (
      <div className="flex h-full items-center justify-center bg-pearl">
        <p className="font-mono text-xs uppercase tracking-widest text-stone">Loading catalog…</p>
      </div>
    );
  }

  if (mastersError) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-pearl px-6 text-center">
        <p className="font-display text-lg text-ink">Could not load your catalog</p>
        <p className="max-w-sm text-sm text-stone">{mastersError}</p>
        <button
          onClick={loadMasters}
          className="mt-2 rounded-sm border border-ink px-4 py-2 text-xs uppercase tracking-wide text-ink hover:bg-ink hover:text-pearl"
        >
          Retry
        </button>
      </div>
    );
  }

  if (categories.length === 0 || metals.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-pearl px-6 text-center">
        <p className="font-display text-lg text-ink">Your catalog is empty</p>
        <p className="max-w-sm text-sm text-stone">
          Add at least one item category and one metal in Materials before generating a design.
        </p>
        <a
          href="/materials"
          className="mt-2 rounded-sm bg-ink px-4 py-2 text-xs uppercase tracking-wide text-pearl hover:bg-ink/90"
        >
          Go to Materials
        </a>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      <div className="flex flex-1 overflow-hidden">
        <SelectionRail
          categories={categories}
          metals={metals}
          gemstones={gemstones}
          finishes={finishes}
          categoryId={categoryId}
          metalId={metalId}
          gemstoneIds={gemstoneIds}
          finishId={finishId}
          weightGrams={weightGrams}
          sizeNote={sizeNote}
          fabricationNote={fabricationNote}
          manualMaterialCost={manualMaterialCost}
          manualProfit={manualProfit}
          onCategoryChange={setCategoryId}
          onMetalChange={setMetalId}
          onGemstoneToggle={toggleGemstone}
          onFinishChange={setFinishId}
          onWeightChange={setWeightGrams}
          onSizeNoteChange={setSizeNote}
          onFabricationNoteChange={setFabricationNote}
          onManualMaterialCostChange={setManualMaterialCost}
          onManualProfitChange={setManualProfit}
          onGenerate={handleGenerate}
          onGenerateFromReference={handleGenerateFromReference}
          canGenerate={Boolean(categoryId && metalId) && !creditsExhausted && !manualPricingIncomplete}
          generating={generating}
          creditsUsed={tenant?.credits_used_this_month ?? 0}
          creditsLimit={tenant?.monthly_credit_limit ?? 0}
          isSubscribed={isSubscribed}
        />
        <main className="flex flex-1 bg-pearl">
          <ResultCanvas
            generating={generating}
            result={result}
            error={generateError}
            onOpenSketch={result ? () => setShowSketch(true) : undefined}
            onGenerateAngles={result ? handleGenerateAngles : undefined}
            generatingAngles={generatingAngles}
            angleViews={angleViews}
            onDownloadPdf={result ? handleDownloadPdf : undefined}
            downloadingPdf={downloadingPdf}
            isSubscribed={isSubscribed}
          />
        </main>
      </div>

      {showSketch && result && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-6">
          <div className="max-h-full w-full max-w-2xl overflow-y-auto rounded-sm bg-white p-6">
            <div className="mb-3 flex items-center justify-between">
              <p className="font-display text-lg text-ink">Sketch on this design</p>
              <button onClick={() => setShowSketch(false)} className="text-xs text-stone hover:text-ink">
                Close
              </button>
            </div>
            <SketchCanvas
              imageUrl={result.generated_image_url}
              onSubmit={handleSketchSubmit}
              onCancel={() => setShowSketch(false)}
              submitting={generating}
            />
          </div>
        </div>
      )}
    </div>
  );
}
