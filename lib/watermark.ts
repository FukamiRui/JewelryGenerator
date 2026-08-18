import sharp from "sharp";

/**
 * Bakes a semi-transparent diagonal watermark into an image buffer — used
 * for free-tier shops (see tenants.subscription_status) so a saved/shared
 * copy of a generated design still carries it. Baking it into the stored
 * pixels (rather than gating it in the UI) means every downstream use
 * (History, Portfolio, PDF export, share links) is covered automatically,
 * since they all just read the same generated_image_url.
 */
export async function applyWatermark(buffer: Buffer): Promise<Buffer> {
  const image = sharp(buffer);
  const metadata = await image.metadata();
  const width = metadata.width ?? 1024;
  const height = metadata.height ?? 1024;

  const fontSize = Math.round(width / 12);
  const label = "ATELIER · FREE PLAN";

  const svg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <style>
        .wm {
          fill: rgba(255, 255, 255, 0.55);
          stroke: rgba(0, 0, 0, 0.35);
          stroke-width: 1;
          font-family: sans-serif;
          font-size: ${fontSize}px;
          font-weight: 700;
        }
      </style>
      <text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle"
        class="wm" transform="rotate(-30 ${width / 2} ${height / 2})">${label}</text>
    </svg>
  `;

  return image
    .composite([{ input: Buffer.from(svg), gravity: "center" }])
    .toBuffer();
}
