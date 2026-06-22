"use client";

import React from "react";

/** Loading placeholder rows for search results / async lists. */
export const Skeleton: React.FC<{ rows?: number; height?: number }> = ({
  rows = 3,
  height = 24,
}) => (
  <div className="space-y-1">
    {Array.from({ length: rows }).map((_, i) => (
      <div
        key={i}
        className="rounded bg-ink-700 animate-pulse"
        style={{ height, opacity: 1 - i * 0.18 }}
      />
    ))}
  </div>
);
