"use client";

import { useState } from "react";
import {
  patchOrder,
  startOrderCheckout,
  submitReview,
  ApiRequestError,
  type Order,
} from "@/lib/api-client";
import { useToast } from "@/components/ui/Toast";

const STATUS_LABEL: Record<Order["status"], string> = {
  proposed: "Awaiting response",
  confirmed: "Confirmed",
  in_progress: "In progress",
  ready: "Ready",
  completed: "Completed",
  cancelled: "Cancelled",
};

function usd(n: number): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
}

function StarPicker({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          className={`text-lg leading-none ${n <= value ? "text-gold" : "text-line-light"}`}
          aria-label={`${n} star${n > 1 ? "s" : ""}`}
        >
          ★
        </button>
      ))}
    </div>
  );
}

function ReviewForm({
  accessToken,
  orderId,
  onDone,
}: {
  accessToken: string;
  orderId: string;
  onDone: () => void;
}) {
  const toast = useToast();
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setSubmitting(true);
    try {
      await submitReview(accessToken, { order_id: orderId, rating, comment: comment.trim() || undefined });
      toast.push("Thanks for your review!");
      onDone();
    } catch (err) {
      toast.push(err instanceof Error ? err.message : "Could not submit your review.");
      onDone();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mt-2 flex flex-col gap-2 border-t border-line-light pt-2">
      <p className="text-xs text-stone">Leave a review</p>
      <StarPicker value={rating} onChange={setRating} />
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Optional comment…"
        maxLength={1000}
        rows={2}
        className="rounded-sm border border-line-light px-2 py-1.5 text-sm"
      />
      <button
        onClick={handleSubmit}
        disabled={submitting}
        className="self-start rounded-sm bg-ink px-3 py-1.5 text-xs text-pearl hover:bg-ink/90 disabled:opacity-50"
      >
        {submitting ? "Submitting…" : "Submit review"}
      </button>
    </div>
  );
}

interface OrderCardProps {
  accessToken: string;
  order: Order;
  viewerRole: "customer" | "shop";
  reviewed: boolean;
  returnsAccepted?: boolean;
  returnPolicyNote?: string | null;
  onChanged: (order: Order) => void;
  onReviewed: () => void;
}

export function OrderCard({
  accessToken,
  order,
  viewerRole,
  reviewed,
  returnsAccepted,
  returnPolicyNote,
  onChanged,
  onReviewed,
}: OrderCardProps) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [showReview, setShowReview] = useState(false);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      if (err instanceof ApiRequestError) {
        toast.push(err.message);
      } else {
        toast.push("Something went wrong. Please try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function handlePay() {
    await run(async () => {
      const url = await startOrderCheckout(accessToken, order.id);
      window.location.href = url;
    });
  }

  async function handleConfirm() {
    await run(async () => onChanged(await patchOrder(accessToken, order.id, "confirm")));
  }

  async function handleAdvance() {
    await run(async () => onChanged(await patchOrder(accessToken, order.id, "advance")));
  }

  async function handleCancel() {
    await run(async () => onChanged(await patchOrder(accessToken, order.id, "cancel")));
  }

  return (
    <div className="w-full max-w-sm self-center rounded-sm border border-gold/60 bg-white p-4">
      <div className="flex items-center justify-between">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-stone">
          {order.fulfillment_type === "online_payment" ? "Online payment" : "In-store visit"}
        </p>
        <span className="rounded-full bg-pearl px-2 py-0.5 text-[10px] text-stone">
          {STATUS_LABEL[order.status]}
        </span>
      </div>

      <p className="mt-2 font-display text-lg text-ink">{usd(order.amount_usd)}</p>
      {returnsAccepted !== undefined && (
        <p className="mt-1 text-[11px] text-stone">
          <span className={returnsAccepted ? "text-ink" : ""}>
            {returnsAccepted ? "✓ Returns accepted" : "✕ Final sale — no returns"}
          </span>
          {returnsAccepted && returnPolicyNote && ` · ${returnPolicyNote}`}
        </p>
      )}
      {order.customer_charge_usd && order.status === "proposed" && order.fulfillment_type === "online_payment" && (
        <p className="text-xs text-stone">
          Total with card processing: {usd(order.customer_charge_usd)}
        </p>
      )}
      {order.proposed_datetime && (
        <p className="mt-1 text-xs text-stone">
          {new Date(order.proposed_datetime).toLocaleString("en-US", {
            dateStyle: "medium",
            timeStyle: "short",
          })}
        </p>
      )}
      {order.appointment_note && <p className="mt-1 text-xs text-stone">{order.appointment_note}</p>}

      <div className="mt-3 flex flex-wrap gap-2">
        {order.status === "proposed" && viewerRole === "customer" && order.fulfillment_type === "online_payment" && (
          <button
            onClick={handlePay}
            disabled={busy}
            className="rounded-sm bg-gold px-3 py-1.5 text-xs font-medium text-ink hover:bg-gold-bright disabled:opacity-50"
          >
            Pay {usd(order.customer_charge_usd ?? order.amount_usd)}
          </button>
        )}
        {order.status === "proposed" && viewerRole === "customer" && order.fulfillment_type === "shop_visit" && (
          <button
            onClick={handleConfirm}
            disabled={busy}
            className="rounded-sm bg-gold px-3 py-1.5 text-xs font-medium text-ink hover:bg-gold-bright disabled:opacity-50"
          >
            Confirm appointment
          </button>
        )}
        {order.status === "proposed" && (
          <button
            onClick={handleCancel}
            disabled={busy}
            className="rounded-sm border border-line-light px-3 py-1.5 text-xs text-stone hover:text-ink disabled:opacity-50"
          >
            {viewerRole === "customer" ? "Decline" : "Withdraw"}
          </button>
        )}
        {viewerRole === "shop" && ["confirmed", "in_progress", "ready"].includes(order.status) && (
          <button
            onClick={handleAdvance}
            disabled={busy}
            className="rounded-sm bg-ink px-3 py-1.5 text-xs text-pearl hover:bg-ink/90 disabled:opacity-50"
          >
            {order.status === "confirmed" && "Start work"}
            {order.status === "in_progress" && "Mark ready"}
            {order.status === "ready" && "Mark completed"}
          </button>
        )}
      </div>

      {viewerRole === "customer" && order.status === "completed" && !reviewed && (
        <>
          {!showReview ? (
            <button
              onClick={() => setShowReview(true)}
              className="mt-3 text-xs text-gold hover:underline"
            >
              Leave a review
            </button>
          ) : (
            <ReviewForm
              accessToken={accessToken}
              orderId={order.id}
              onDone={() => {
                setShowReview(false);
                onReviewed();
              }}
            />
          )}
        </>
      )}
    </div>
  );
}
