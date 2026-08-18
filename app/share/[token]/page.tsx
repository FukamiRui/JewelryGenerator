async function getSharedDesign(token: string) {
  const res = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/api/design/share/${token}`, {
    cache: "no-store",
  });
  if (!res.ok) return null;
  return res.json();
}

export default async function SharePage({ params }: { params: { token: string } }) {
  const design = await getSharedDesign(params.token);

  if (!design) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-pearl px-6 text-center">
        <p className="font-display text-lg text-ink">This design link is no longer available.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-6 bg-pearl px-6 py-16">
      {design.store?.logo_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={design.store.logo_url} alt={design.store.company_name} className="h-10" />
      )}
      <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-stone">
        {design.store?.company_name}
      </p>

      <div className="w-full overflow-hidden rounded-sm bg-white shadow-[0_20px_60px_-15px_rgba(22,20,15,0.25)]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={design.image_url} alt="Your jewelry design" className="w-full" />
      </div>

      <div className="text-center">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-stone">{design.category}</p>
        <p className="mt-1 font-display text-3xl text-ink">
          ${Number(design.price_usd).toLocaleString("en-US", { minimumFractionDigits: 2 })}
        </p>
        <p className="mt-3 text-xs text-stone">
          Preliminary estimate. Please confirm final pricing with the store.
        </p>
      </div>
    </div>
  );
}
