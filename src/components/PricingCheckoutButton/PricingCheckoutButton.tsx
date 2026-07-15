"use client";

import React, { useState } from "react";
import { Loader2 } from "lucide-react";
import { alertDialog } from "@/v2/ui/dialogs";

export const PricingCheckoutButton: React.FC<{
  priceId: string | null;
  label: string;
  highlighted?: boolean;
}> = ({ priceId, label, highlighted }) => {
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    if (!priceId) return;
    setLoading(true);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceId }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        await alertDialog({ title: "Checkout unavailable", message: data.error ?? "Could not start checkout. Please try again." });
        setLoading(false);
      }
    } catch {
      await alertDialog({ title: "Network error", message: "Please check your connection and try again." });
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={loading || !priceId}
      className={`flex items-center justify-center gap-2 w-full rounded-lg py-2.5 text-center text-sm font-semibold transition disabled:opacity-60 disabled:cursor-not-allowed ${
        highlighted
          ? "bg-brand text-white hover:opacity-90 shadow-glow-iris"
          : "bg-paper-100 text-graphite hover:bg-paper-200 border border-line"
      }`}
    >
      {loading ? <Loader2 size={14} className="animate-spin" /> : null}
      {loading ? "Redirecting…" : label}
    </button>
  );
};
