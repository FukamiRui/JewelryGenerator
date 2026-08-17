export function StarRating({ rating, size = "sm" }: { rating: number; size?: "sm" | "md" }) {
  const rounded = Math.round(rating);
  const textSize = size === "md" ? "text-base" : "text-sm";

  return (
    <span className={`font-mono ${textSize} tracking-tight text-gold`} aria-label={`${rating} out of 5 stars`}>
      {"★".repeat(rounded)}
      <span className="text-line-light">{"★".repeat(5 - rounded)}</span>
    </span>
  );
}
