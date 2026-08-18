"use client";

import { useEffect, useRef, useState } from "react";

const COLORS = ["#1a1a1a", "#c0392b", "#2980b9", "#f1c40f", "#ffffff"];

interface SketchCanvasProps {
  imageUrl: string;
  onSubmit: (annotatedImage: File, note: string) => void;
  onCancel: () => void;
  submitting: boolean;
}

/**
 * Draws the source design image onto a canvas and lets the shop mark it up
 * with a pen — works with mouse, touch, and Apple Pencil equally since
 * Pointer Events don't distinguish input device for drawing purposes
 * (pressure is used for line width when available, e.g. on a Pencil).
 */
export function SketchCanvas({ imageUrl, onSubmit, onCancel, submitting }: SketchCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const lastPoint = useRef<{ x: number; y: number } | null>(null);
  const [color, setColor] = useState(COLORS[0]);
  const [lineWidth, setLineWidth] = useState(4);
  const [note, setNote] = useState("");
  const [imageLoaded, setImageLoaded] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const maxWidth = 640;
      const scale = Math.min(1, maxWidth / img.width);
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      setImageLoaded(true);
    };
    img.src = imageUrl;
  }, [imageUrl]);

  function getPoint(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    };
  }

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!imageLoaded) return;
    drawing.current = true;
    lastPoint.current = getPoint(e);
  }

  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || !lastPoint.current) return;

    const point = getPoint(e);
    const pressure = e.pressure > 0 ? e.pressure : 0.5;

    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth * (0.5 + pressure);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(lastPoint.current.x, lastPoint.current.y);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();

    lastPoint.current = point;
  }

  function handlePointerUp() {
    drawing.current = false;
    lastPoint.current = null;
  }

  function handleClear() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    img.src = imageUrl;
  }

  function handleSubmit() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const file = new File([blob], "sketch.png", { type: "image/png" });
      onSubmit(file, note);
    }, "image/png");
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        {COLORS.map((c) => (
          <button
            key={c}
            onClick={() => setColor(c)}
            style={{ backgroundColor: c }}
            className={`h-6 w-6 rounded-full border ${color === c ? "ring-2 ring-gold ring-offset-1" : "border-line-light"}`}
            aria-label={c}
          />
        ))}
        <input
          type="range"
          min={1}
          max={12}
          value={lineWidth}
          onChange={(e) => setLineWidth(Number(e.target.value))}
          className="ml-2 w-24"
        />
        <button onClick={handleClear} className="ml-auto text-xs text-stone hover:text-ink">
          Clear marks
        </button>
      </div>

      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        className="w-full touch-none rounded-sm border border-line-light bg-pearl"
        style={{ maxWidth: "100%" }}
      />

      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="What did you mark up? (optional, helps the AI)"
        maxLength={300}
        className="rounded-sm border border-line-light px-2 py-1.5 text-sm"
      />

      <div className="flex gap-2">
        <button
          onClick={handleSubmit}
          disabled={submitting || !imageLoaded}
          className="rounded-sm bg-gold px-4 py-1.5 text-sm font-medium text-ink hover:bg-gold-bright disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? "Generating…" : "Regenerate from this sketch"}
        </button>
        <button onClick={onCancel} disabled={submitting} className="text-sm text-stone hover:text-ink">
          Cancel
        </button>
      </div>
    </div>
  );
}
