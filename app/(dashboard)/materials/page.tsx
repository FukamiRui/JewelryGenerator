"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/components/ui/Toast";
import {
  fetchMaterials,
  createMaterial,
  deleteMaterial,
  fetchCategories,
  createCategory,
  deleteCategory,
} from "@/lib/api-client";
import type { Material, MaterialType, Category } from "@/types/domain";

const TYPE_LABEL: Record<MaterialType, string> = {
  metal: "Metal",
  gemstone: "Gemstone",
  finish: "Finish",
};

const EMPTY_MATERIAL_FORM = {
  material_type: "metal" as MaterialType,
  name: "",
  ai_prompt_tag: "",
  cost_per_gram_or_carat: "",
  price_markup_ratio: "1.5",
};

const EMPTY_CATEGORY_FORM = {
  name: "",
  ai_prompt_tag: "",
  base_processing_cost: "",
};

function CategoriesSection({ accessToken }: { accessToken: string }) {
  const toast = useToast();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_CATEGORY_FORM);
  const [formError, setFormError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setLoadError(null);
    try {
      setCategories(await fetchCategories(accessToken));
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Could not load categories.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!form.name.trim() || !form.ai_prompt_tag.trim()) {
      setFormError("Name and AI tag are required.");
      return;
    }
    setSubmitting(true);
    try {
      await createCategory(accessToken, {
        name: form.name.trim(),
        ai_prompt_tag: form.ai_prompt_tag.trim(),
        base_processing_cost: form.base_processing_cost ? Number(form.base_processing_cost) : 0,
      });
      setForm(EMPTY_CATEGORY_FORM);
      toast.push(`Added "${form.name.trim()}".`, "success");
      load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not add category.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRemove(id: string, name: string) {
    setRemovingId(id);
    try {
      await deleteCategory(accessToken, id);
      setCategories((prev) => prev.filter((c) => c.id !== id));
      toast.push(`Removed "${name}".`, "success");
    } catch (err) {
      toast.push(err instanceof Error ? err.message : "Could not remove category.");
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <section className="mb-14">
      <h1 className="font-display text-2xl text-ink">Categories</h1>
      <p className="mt-1 text-sm text-stone">
        The item types your store makes (ring, necklace, earring...). You need at least
        one category and one metal before you can generate a design.
      </p>

      <form
        onSubmit={handleAdd}
        className="mt-6 grid grid-cols-2 gap-3 rounded-sm border border-line-light bg-white p-5"
      >
        <input
          placeholder="Display name (e.g. Ring)"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          required
          maxLength={100}
          className="rounded-sm border border-line-light px-3 py-2 text-sm"
        />
        <input
          type="number"
          min="0"
          step="0.01"
          placeholder="Base processing cost ($, optional)"
          value={form.base_processing_cost}
          onChange={(e) => setForm({ ...form, base_processing_cost: e.target.value })}
          className="rounded-sm border border-line-light px-3 py-2 text-sm"
        />
        <input
          placeholder="AI tag (e.g. ring, fine jewelry)"
          value={form.ai_prompt_tag}
          onChange={(e) => setForm({ ...form, ai_prompt_tag: e.target.value })}
          required
          maxLength={300}
          className="col-span-2 rounded-sm border border-line-light px-3 py-2 text-sm"
        />

        {formError && (
          <p role="alert" className="col-span-2 rounded-sm bg-ink/5 px-3 py-2 text-xs text-ink">
            {formError}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="col-span-2 rounded-sm bg-ink py-2 text-sm text-pearl hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? "Adding…" : "Add category"}
        </button>
      </form>

      {loading && <p className="mt-6 text-sm text-stone">Loading categories…</p>}

      {!loading && loadError && (
        <div className="mt-6 flex flex-col items-start gap-2">
          <p className="text-sm text-stone">{loadError}</p>
          <button onClick={load} className="text-xs text-gold hover:underline">
            Retry
          </button>
        </div>
      )}

      {!loading && !loadError && categories.length === 0 && (
        <p className="mt-6 text-sm text-stone">
          No categories yet. Add your first item type above (e.g. "Ring").
        </p>
      )}

      {!loading && !loadError && categories.length > 0 && (
        <table className="mt-6 w-full text-left text-sm">
          <thead>
            <tr className="border-b border-line-light font-mono text-[10px] uppercase tracking-wide text-stone">
              <th className="py-2">Name</th>
              <th className="py-2">AI tag</th>
              <th className="py-2">Processing cost</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {categories.map((c) => (
              <tr key={c.id} className="border-b border-line-light/60">
                <td className="py-2">{c.name}</td>
                <td className="max-w-xs truncate py-2 text-stone">{c.ai_prompt_tag}</td>
                <td className="py-2 font-mono">
                  {c.base_processing_cost ? `$${c.base_processing_cost}` : "-"}
                </td>
                <td className="py-2 text-right">
                  <button
                    onClick={() => handleRemove(c.id, c.name)}
                    disabled={removingId === c.id}
                    className="text-xs text-stone hover:text-ink disabled:opacity-50"
                  >
                    {removingId === c.id ? "Removing…" : "Remove"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function MaterialsSection({ accessToken }: { accessToken: string }) {
  const toast = useToast();
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_MATERIAL_FORM);
  const [formError, setFormError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setLoadError(null);
    try {
      setMaterials(await fetchMaterials(accessToken));
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Could not load materials.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (!form.name.trim() || !form.ai_prompt_tag.trim()) {
      setFormError("Name and AI tag are required.");
      return;
    }

    setSubmitting(true);
    try {
      await createMaterial(accessToken, {
        material_type: form.material_type,
        name: form.name.trim(),
        ai_prompt_tag: form.ai_prompt_tag.trim(),
        density: null,
        // Cost is intentionally optional — leaving it blank means the
        // simulator falls back to the live spot rate (metals) or $0 (stones).
        cost_per_gram_or_carat: form.cost_per_gram_or_carat
          ? Number(form.cost_per_gram_or_carat)
          : null,
        price_markup_ratio: form.price_markup_ratio ? Number(form.price_markup_ratio) : 1.5,
      });
      setForm({ ...EMPTY_MATERIAL_FORM, material_type: form.material_type });
      toast.push(`Added "${form.name.trim()}".`, "success");
      load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not add material.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRemove(id: string, name: string) {
    setRemovingId(id);
    try {
      await deleteMaterial(accessToken, id);
      setMaterials((prev) => prev.filter((m) => m.id !== id));
      toast.push(`Removed "${name}".`, "success");
    } catch (err) {
      toast.push(err instanceof Error ? err.message : "Could not remove material.");
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <section>
      <h1 className="font-display text-2xl text-ink">Materials</h1>
      <p className="mt-1 text-sm text-stone">
        Add the metals, gemstones, and finishes your store offers. The AI tag is what gets
        sent to the image generator, so keep it descriptive and in English. Cost is optional:
        metals without a cost fall back to the live spot rate.
      </p>

      <form onSubmit={handleAdd} className="mt-6 grid grid-cols-2 gap-3 rounded-sm border border-line-light bg-white p-5">
        <select
          value={form.material_type}
          onChange={(e) => setForm({ ...form, material_type: e.target.value as MaterialType })}
          className="rounded-sm border border-line-light px-3 py-2 text-sm"
        >
          {Object.entries(TYPE_LABEL).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
        <input
          placeholder="Display name (e.g. 18k Rose Gold)"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          required
          maxLength={100}
          className="rounded-sm border border-line-light px-3 py-2 text-sm"
        />
        <input
          placeholder="AI tag (e.g. 18k rose gold, warm pink metallic sheen)"
          value={form.ai_prompt_tag}
          onChange={(e) => setForm({ ...form, ai_prompt_tag: e.target.value })}
          required
          maxLength={300}
          className="col-span-2 rounded-sm border border-line-light px-3 py-2 text-sm"
        />
        <input
          type="number"
          min="0"
          step="0.01"
          placeholder="Cost per gram / carat ($, optional)"
          value={form.cost_per_gram_or_carat}
          onChange={(e) => setForm({ ...form, cost_per_gram_or_carat: e.target.value })}
          className="rounded-sm border border-line-light px-3 py-2 text-sm"
        />
        <input
          type="number"
          min="1"
          step="0.05"
          placeholder="Markup ratio (optional, default 1.5 = +50%)"
          value={form.price_markup_ratio}
          onChange={(e) => setForm({ ...form, price_markup_ratio: e.target.value })}
          className="rounded-sm border border-line-light px-3 py-2 text-sm"
        />

        {formError && (
          <p role="alert" className="col-span-2 rounded-sm bg-ink/5 px-3 py-2 text-xs text-ink">
            {formError}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="col-span-2 rounded-sm bg-ink py-2 text-sm text-pearl hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? "Adding…" : "Add material"}
        </button>
      </form>

      {loading && <p className="mt-6 text-sm text-stone">Loading materials…</p>}

      {!loading && loadError && (
        <div className="mt-6 flex flex-col items-start gap-2">
          <p className="text-sm text-stone">{loadError}</p>
          <button onClick={load} className="text-xs text-gold hover:underline">
            Retry
          </button>
        </div>
      )}

      {!loading && !loadError && materials.length === 0 && (
        <p className="mt-6 text-sm text-stone">
          No materials yet. Add your first metal above to get started.
        </p>
      )}

      {!loading && !loadError && materials.length > 0 && (
        <table className="mt-6 w-full text-left text-sm">
          <thead>
            <tr className="border-b border-line-light font-mono text-[10px] uppercase tracking-wide text-stone">
              <th className="py-2">Type</th>
              <th className="py-2">Name</th>
              <th className="py-2">AI tag</th>
              <th className="py-2">Cost</th>
              <th className="py-2">Markup</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {materials.map((m) => (
              <tr key={m.id} className="border-b border-line-light/60">
                <td className="py-2 text-stone">{TYPE_LABEL[m.material_type]}</td>
                <td className="py-2">{m.name}</td>
                <td className="max-w-xs truncate py-2 text-stone">{m.ai_prompt_tag}</td>
                <td className="py-2 font-mono">
                  {m.cost_per_gram_or_carat ? `$${m.cost_per_gram_or_carat}` : "-"}
                </td>
                <td className="py-2 font-mono">×{m.price_markup_ratio}</td>
                <td className="py-2 text-right">
                  <button
                    onClick={() => handleRemove(m.id, m.name)}
                    disabled={removingId === m.id}
                    className="text-xs text-stone hover:text-ink disabled:opacity-50"
                  >
                    {removingId === m.id ? "Removing…" : "Remove"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

export default function MaterialsPage() {
  const { accessToken } = useAuth();
  return (
    <div className="mx-auto h-full max-w-4xl overflow-y-auto px-8 py-12">
      <CategoriesSection accessToken={accessToken} />
      <MaterialsSection accessToken={accessToken} />
    </div>
  );
}
