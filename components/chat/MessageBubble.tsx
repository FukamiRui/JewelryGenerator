"use client";

import Image from "next/image";
import type { ChatMessage } from "@/lib/api-client";

export function MessageBubble({ message, isOwn }: { message: ChatMessage; isOwn: boolean }) {
  const isDesign = Boolean(message.design_id && message.designs);

  return (
    <div className={`flex ${isOwn ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-sm ${isOwn ? "items-end" : "items-start"} flex flex-col gap-1`}>
        {isDesign ? (
          <div className="overflow-hidden rounded-sm border border-line-light bg-white">
            <div className="relative aspect-square w-64">
              <Image
                src={message.designs!.generated_image_url}
                alt="Generated design"
                fill
                className="object-cover"
              />
            </div>
            <div className="px-3 py-2">
              <p className="font-mono text-sm text-ink">
                ${message.designs!.calculated_price_usd.toLocaleString("en-US", { minimumFractionDigits: 2 })}
              </p>
            </div>
          </div>
        ) : (
          <div
            className={`rounded-sm px-4 py-2 text-sm ${
              isOwn ? "bg-ink text-pearl" : "bg-white text-ink border border-line-light"
            }`}
          >
            {message.body}
          </div>
        )}
        <span className="font-mono text-[10px] text-stone">
          {new Date(message.created_at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
        </span>
      </div>
    </div>
  );
}
