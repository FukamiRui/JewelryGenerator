import { NextRequest, NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { requireTenant } from "@/lib/supabase";
import { withErrorHandling, Errors, AppError } from "@/lib/api-error";

interface RouteParams {
  params: { id: string };
}

export const GET = withErrorHandling(async (req: NextRequest, { params }: RouteParams) => {
  const { supabase } = await requireTenant(req);

  const { data: design, error } = await supabase
    .from("designs")
    .select(
      "id, customer_name, generated_image_url, calculated_price_usd, created_at, tenants(company_name, logo_url), categories(name)"
    )
    .eq("id", params.id)
    .single();

  // RLS means a design belonging to another tenant simply won't be found here.
  if (error || !design) throw Errors.notFound("Design");

  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]); // A4 portrait, points
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const { width } = page.getSize();
  const margin = 50;
  let cursorY = page.getSize().height - margin;

  const tenant = design.tenants as unknown as { company_name: string; logo_url: string | null };
  const category = design.categories as unknown as { name: string } | null;

  page.drawText(tenant?.company_name ?? "Estimate", {
    x: margin,
    y: cursorY,
    size: 20,
    font: boldFont,
    color: rgb(0.1, 0.1, 0.1),
  });
  cursorY -= 30;

  page.drawText("Design Estimate", {
    x: margin,
    y: cursorY,
    size: 12,
    font,
    color: rgb(0.4, 0.4, 0.4),
  });
  cursorY -= 40;

  if (design.customer_name) {
    page.drawText(`Customer: ${design.customer_name} `, { x: margin, y: cursorY, size: 11, font });
    cursorY -= 18;
  }
  page.drawText(`Date: ${new Date(design.created_at).toLocaleDateString("en-US")}`, {
    x: margin,
    y: cursorY,
    size: 11,
    font,
  });
  cursorY -= 18;
  page.drawText(`Item: ${category?.name ?? "-"}`, { x: margin, y: cursorY, size: 11, font });
  cursorY -= 30;

  // Generated design image — non-fatal if this fails; the PDF still has the
  // price and spec, which is more useful than failing the whole request.
  try {
    const imgRes = await fetch(design.generated_image_url);
    if (!imgRes.ok) throw new Error(`image fetch returned ${imgRes.status}`);
    const imgBytes = new Uint8Array(await imgRes.arrayBuffer());
    const contentType = imgRes.headers.get("content-type") ?? "";
    const image = contentType.includes("png")
      ? await pdfDoc.embedPng(imgBytes)
      : await pdfDoc.embedJpg(imgBytes); // webp isn't natively supported by pdf-lib

    const imgWidth = 300;
    const imgHeight = (image.height / image.width) * imgWidth;
    page.drawImage(image, {
      x: (width - imgWidth) / 2,
      y: cursorY - imgHeight,
      width: imgWidth,
      height: imgHeight,
    });
    cursorY -= imgHeight + 30;
  } catch (err) {
    console.warn("[design/pdf] could not embed image, continuing without it:", err);
    page.drawText("(design image unavailable)", {
      x: margin,
      y: cursorY,
      size: 9,
      font,
      color: rgb(0.6, 0.6, 0.6),
    });
    cursorY -= 30;
  }

  page.drawLine({
    start: { x: margin, y: cursorY },
    end: { x: width - margin, y: cursorY },
    thickness: 0.5,
    color: rgb(0.8, 0.8, 0.8),
  });
  cursorY -= 25;

  page.drawText("Estimated Price", {
    x: margin,
    y: cursorY,
    size: 11,
    font,
    color: rgb(0.4, 0.4, 0.4),
  });
  cursorY -= 24;

  page.drawText(`$${Number(design.calculated_price_usd).toLocaleString("en-US", { minimumFractionDigits: 2 })}`, {
    x: margin,
    y: cursorY,
    size: 24,
    font: boldFont,
  });
  cursorY -= 40;

  page.drawText(
    "This is a preliminary estimate based on current material rates and may vary at final order.",
    { x: margin, y: cursorY, size: 8, font, color: rgb(0.5, 0.5, 0.5) }
  );

  let pdfBytes: Uint8Array;
  try {
    pdfBytes = await pdfDoc.save();
  } catch (err) {
    console.error("[design/pdf] PDF save failed:", err);
    throw new AppError(500, "Could not generate the PDF. Please try again.", "internal_error");
  }

  return new NextResponse(Buffer.from(pdfBytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="estimate-${design.id}.pdf"`,
    },
  });
});
