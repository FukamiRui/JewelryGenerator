"use client";

import { useState } from "react";
import { submitReport } from "@/lib/api-client";
import { useToast } from "@/components/ui/Toast";

const REASONS = ["Inappropriate content", "Scam or fraud", "Harassment", "Other"];

export function ReportDialog({
  accessToken,
  conversationId,
  onClose,
}: {
  accessToken: string;
  conversationId: string;
  onClose: () => void;
}) {
  const toast = useToast();
  const [reason, setReason] = useState(REASONS[0]);
  const [details, setDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setSubmitting(true);
    try {
      await submitReport(accessToken, { conversation_id: conversationId, reason, details: details.trim() || undefined });
      toast.push("Report submitted. Our team will take a look.");
      onClose();
    } catch (err) {
      toast.push(err instanceof Error ? err.message : "Could not submit your report.");
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-6" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-sm bg-white p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-display text-lg text-ink">Report this conversation</h3>
        <select
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="mt-3 w-full rounded-sm border border-line-light px-2 py-1.5 text-sm"
        >
          {REASONS.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
        <textarea
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          placeholder="Details (optional)"
          maxLength={1000}
          rows={3}
          className="mt-2 w-full rounded-sm border border-line-light px-2 py-1.5 text-sm"
        />
        <div className="mt-3 flex justify-end gap-2">
          <button onClick={onClose} className="text-xs text-stone hover:text-ink">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="rounded-sm bg-ink px-4 py-1.5 text-xs text-pearl hover:bg-ink/90 disabled:opacity-50"
          >
            {submitting ? "Submitting…" : "Submit report"}
          </button>
        </div>
      </div>
    </div>
  );
}
