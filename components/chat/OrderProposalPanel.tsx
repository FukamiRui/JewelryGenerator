"use client";

import { useState } from "react";
import { createOrder, ApiRequestError, type OrderFulfillmentType, type Order } from "@/lib/api-client";
import { useToast } from "@/components/ui/Toast";

export interface DesignOption {
  design_id: string;
  image_url: string;
  price_usd: number;
}

interface OrderProposalPanelProps {
  accessToken: string;
  conversationId: string;
  designOptions: DesignOption[];
  onCreated: (order: Order) => void;
  onClose: () => void;
}

export function OrderProposalPanel({
  accessToken,
  conversationId,
  designOptions,
  onCreated,
  onClose,
}: OrderProposalPanelProps) {
  const toast = useToast();
  const [designId, setDesignId] = useState<string>(designOptions[0]?.design_id ?? "");
  const [fulfillmentType, setFulfillmentType] = useState<OrderFulfillmentType>("online_payment");
  const [amount, setAmount] = useState<string>(
    designOptions[0] ? String(designOptions[0].price_usd) : ""
  );
  const [datetime, setDatetime] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function handleDesignChange(id: string) {
    setDesignId(id);
    const match = designOptions.find((d) => d.design_id === id);
    if (match) setAmount(String(match.price_usd));
  }

  async function handleSubmit() {
    const amountUsd = Number(amount);
    if (!amountUsd || amountUsd <= 0) {
      toast.push("Enter a valid amount.");
      return;
    }
    if (fulfillmentType === "shop_visit" && !datetime) {
      toast.push("Pick a proposed date/time for the visit.");
      return;
    }
    setSubmitting(true);
    try {
      const order = await createOrder(accessToken, {
        conversation_id: conversationId,
        design_id: designId || null,
        fulfillment_type: fulfillmentType,
        amount_usd: amountUsd,
        proposed_datetime: fulfillmentType === "shop_visit" ? new Date(datetime).toISOString() : null,
        appointment_note: fulfillmentType === "shop_visit" ? note.trim() || null : null,
      });
      onCreated(order);
      onClose();
    } catch (err) {
      toast.push(err instanceof ApiRequestError ? err.message : "Could not propose this order.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="border-t border-line-light bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-stone">Propose an order</p>
        <button onClick={onClose} className="text-xs text-stone hover:text-ink">
          Close
        </button>
      </div>

      {designOptions.length > 0 && (
        <select
          value={designId}
          onChange={(e) => handleDesignChange(e.target.value)}
          className="w-full rounded-sm border border-line-light px-2 py-1.5 text-sm"
        >
          <option value="">No specific design</option>
          {designOptions.map((d) => (
            <option key={d.design_id} value={d.design_id}>
              Design — ${d.price_usd.toLocaleString("en-US", { minimumFractionDigits: 2 })}
            </option>
          ))}
        </select>
      )}

      <div className="mt-2 grid grid-cols-2 gap-2">
        <select
          value={fulfillmentType}
          onChange={(e) => setFulfillmentType(e.target.value as OrderFulfillmentType)}
          className="rounded-sm border border-line-light px-2 py-1.5 text-sm"
        >
          <option value="online_payment">Online payment</option>
          <option value="shop_visit">In-store visit</option>
        </select>
        <input
          type="number"
          min={0}
          step={0.01}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="Amount (USD)"
          className="rounded-sm border border-line-light px-2 py-1.5 text-sm"
        />
      </div>

      {fulfillmentType === "shop_visit" && (
        <div className="mt-2 flex flex-col gap-2">
          <input
            type="datetime-local"
            value={datetime}
            onChange={(e) => setDatetime(e.target.value)}
            className="rounded-sm border border-line-light px-2 py-1.5 text-sm"
          />
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Note (optional)"
            maxLength={500}
            className="rounded-sm border border-line-light px-2 py-1.5 text-sm"
          />
        </div>
      )}

      <button
        onClick={handleSubmit}
        disabled={submitting}
        className="mt-3 rounded-sm bg-gold px-4 py-1.5 text-sm font-medium text-ink hover:bg-gold-bright disabled:cursor-not-allowed disabled:opacity-50"
      >
        {submitting ? "Sending…" : "Send order proposal"}
      </button>
    </div>
  );
}
