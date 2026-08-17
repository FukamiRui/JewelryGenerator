export function FacetLoader({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center gap-4 py-16">
      <div className="facet-loader h-16 w-16 bg-gold" aria-hidden="true" />
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-stone">{label}</p>
    </div>
  );
}
