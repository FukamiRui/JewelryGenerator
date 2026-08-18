"use client";

import { useEffect, useState } from "react";
import {
  generateInConversation,
  fetchRevisionStatus,
  fetchDesignAdvice,
  generateFromReference,
  ApiRequestError,
  type RevisionStatus,
} from "@/lib/api-client";
import type { Category, Material } from "@/types/domain";
import { useToast } from "@/components/ui/Toast";
import { FileDropzone } from "@/components/ui/FileDropzone";

interface GeneratePanelProps {
  accessToken: string;
  conversationId: string;
  categories: Category[];
  materials: Material[];
  onGenerated: () => void;
  onClose: () => void;
}

function AdvisorPanel({
  accessToken,
  conversationId,
  categoryId,
  metalId,
  gemstoneIds,
  finishId,
  weightGrams,
  onGenerated,
}: {
  accessToken: string;
  conversationId: string;
  categoryId: string;
  metalId: string;
  gemstoneIds: string[];
  finishId: string | null;
  weightGrams: number;
  onGenerated: () => void;
}) {
  const toast = useToast();
  const [advice, setAdvice] = useState<string | null>(null);
  const [loadingAdvice, setLoadingAdvice] = useState(true);
  const [referenceFile, setReferenceFile] = useState<File | null>(null);
  const [uploadKey, setUploadKey] = useState(0);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchDesignAdvice(accessToken, conversationId)
      .then(setAdvice)
      .catch(() => setAdvice(null))
      .finally(() => setLoadingAdvice(false));
  }, [accessToken, conversationId]);

  async function handleGenerateFromReference() {
    if (!referenceFile) {
      toast.push("Choose a reference photo first.");
      return;
    }
    if (!categoryId || !metalId) {
      toast.push("Pick an item type and a metal first.");
      return;
    }
    setSubmitting(true);
    try {
      await generateFromReference(accessToken, conversationId, {
        image: referenceFile,
        note: note.trim() || undefined,
        category_id: categoryId,
        metal_material_id: metalId,
        gemstone_material_ids: gemstoneIds,
        finish_material_id: finishId,
        estimated_weight_grams: weightGrams,
      });
      setReferenceFile(null);
      setUploadKey((k) => k + 1);
      onGenerated();
    } catch (err) {
      toast.push(err instanceof Error ? err.message : "Could not generate from that reference.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-sm bg-pearl p-3">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-stone">Design advisor</p>
        <p className="mt-1 text-sm text-ink">
          {loadingAdvice ? "Thinking…" : advice ?? "Try describing the metal, stone, and finish more specifically, or upload a reference photo below."}
        </p>
      </div>

      <div>
        <p className="text-xs text-stone">Or upload a reference photo — we&apos;ll generate a design guided by it:</p>
        <div className="mt-1.5">
          <FileDropzone
            key={uploadKey}
            accept="image/jpeg,image/png,image/webp"
            kind="photo"
            onFileSelected={setReferenceFile}
          />
        </div>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Anything to note about the reference (optional)"
          maxLength={300}
          className="mt-1.5 w-full rounded-sm border border-line-light px-2 py-1.5 text-sm"
        />
        <button
          onClick={handleGenerateFromReference}
          disabled={submitting}
          className="mt-2 rounded-sm bg-gold px-4 py-1.5 text-sm font-medium text-ink hover:bg-gold-bright disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? "Generating…" : "Generate from this photo"}
        </button>
      </div>

      <p className="text-xs text-stone">
        Used up your tries for this request? Ask the shop to allow more in this chat.
      </p>
    </div>
  );
}

export function GeneratePanel({
  accessToken,
  conversationId,
  categories,
  materials,
  onGenerated,
  onClose,
}: GeneratePanelProps) {
  const toast = useToast();
  const metals = materials.filter((m) => m.material_type === "metal");
  const gemstones = materials.filter((m) => m.material_type === "gemstone");
  const finishes = materials.filter((m) => m.material_type === "finish");

  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? "");
  const [metalId, setMetalId] = useState(metals[0]?.id ?? "");
  const [gemstoneIds, setGemstoneIds] = useState<string[]>([]);
  const [finishId, setFinishId] = useState<string | null>(null);
  const [weightGrams, setWeightGrams] = useState(3.5);
  const [generating, setGenerating] = useState(false);
  const [revisionStatus, setRevisionStatus] = useState<RevisionStatus | null>(null);

  useEffect(() => {
    fetchRevisionStatus(accessToken, conversationId)
      .then(setRevisionStatus)
      .catch(() => setRevisionStatus(null));
  }, [accessToken, conversationId]);

  function toggleGemstone(id: string) {
    setGemstoneIds((prev) => (prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id]));
  }

  async function handleGenerate() {
    if (!categoryId || !metalId) {
      toast.push("Pick an item type and a metal first.");
      return;
    }
    setGenerating(true);
    try {
      const result = await generateInConversation(accessToken, conversationId, {
        category_id: categoryId,
        metal_material_id: metalId,
        gemstone_material_ids: gemstoneIds,
        finish_material_id: finishId,
        estimated_weight_grams: weightGrams,
      });
      if (result.revision_status) setRevisionStatus(result.revision_status);
      onGenerated();
      if (!result.revision_status?.blocked) onClose();
    } catch (err) {
      if (err instanceof ApiRequestError && err.code === "revision_limit_reached") {
        setRevisionStatus((prev) => (prev ? { ...prev, blocked: true, remaining: 0 } : prev));
      } else if (err instanceof ApiRequestError && err.code === "rate_limited") {
        toast.push(err.message);
      } else {
        toast.push(err instanceof Error ? err.message : "Could not generate a design.");
      }
    } finally {
      setGenerating(false);
    }
  }

  const blocked = revisionStatus?.blocked ?? false;

  return (
    <div className="border-t border-line-light bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-stone">
          {blocked ? "Design advisor" : "Generate a design"}
        </p>
        <div className="flex items-center gap-2">
          {revisionStatus && (
            <span className="font-mono text-[10px] text-stone">
              {revisionStatus.remaining} of {revisionStatus.max} tries left
            </span>
          )}
          <button onClick={onClose} className="text-xs text-stone hover:text-ink">
            Close
          </button>
        </div>
      </div>

      {blocked ? (
        <AdvisorPanel
          accessToken={accessToken}
          conversationId={conversationId}
          categoryId={categoryId}
          metalId={metalId}
          gemstoneIds={gemstoneIds}
          finishId={finishId}
          weightGrams={weightGrams}
          onGenerated={onGenerated}
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="rounded-sm border border-line-light px-2 py-1.5 text-sm"
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <select
              value={metalId}
              onChange={(e) => setMetalId(e.target.value)}
              className="rounded-sm border border-line-light px-2 py-1.5 text-sm"
            >
              {metals.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>

          {gemstones.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {gemstones.map((g) => (
                <button
                  key={g.id}
                  onClick={() => toggleGemstone(g.id)}
                  className={`rounded-full border px-3 py-1 text-xs ${
                    gemstoneIds.includes(g.id) ? "border-gold bg-gold text-ink" : "border-line-light text-stone"
                  }`}
                >
                  {g.name}
                </button>
              ))}
            </div>
          )}

          {finishes.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {finishes.map((f) => (
                <button
                  key={f.id}
                  onClick={() => setFinishId(finishId === f.id ? null : f.id)}
                  className={`rounded-sm border px-3 py-1 text-xs ${
                    finishId === f.id ? "border-gold bg-gold/10 text-ink" : "border-line-light text-stone"
                  }`}
                >
                  {f.name}
                </button>
              ))}
            </div>
          )}

          <div className="mt-3 flex items-center gap-2">
            <input
              type="number"
              min={0.1}
              step={0.1}
              value={weightGrams}
              onChange={(e) => setWeightGrams(Number(e.target.value))}
              className="w-20 rounded-sm border border-line-light px-2 py-1.5 text-sm"
            />
            <span className="text-xs text-stone">grams</span>
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="ml-auto rounded-sm bg-gold px-4 py-1.5 text-sm font-medium text-ink hover:bg-gold-bright disabled:cursor-not-allowed disabled:opacity-50"
            >
              {generating ? "Generating…" : "Generate"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
