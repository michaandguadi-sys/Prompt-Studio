"use client";

import React, { useState } from "react";

/**
 * Single-source color control — replaces the buggy dual color+text pairs
 * that were scattered across HighlightEditor + RouteEditor.
 *
 * Click the swatch to open the OS native picker. Hover/focus reveals the
 * hex value inline. Click the hex chip to edit it directly as text.
 */
export const ColorInput: React.FC<{
  value: string;
  onChange: (v: string) => void;
  ariaLabel?: string;
}> = ({ value, onChange, ariaLabel }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  React.useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  const commit = () => {
    setEditing(false);
    // Accept #rgb / #rrggbb only; otherwise revert
    if (/^#[0-9a-fA-F]{3}$|^#[0-9a-fA-F]{6}$/.test(draft)) {
      onChange(draft);
    } else {
      setDraft(value);
    }
  };

  return (
    <div className="group flex items-center gap-1.5 rounded-md border border-line bg-white px-1.5 py-1">
      <label className="relative h-6 w-6 cursor-pointer rounded overflow-hidden ring-1 ring-ink-700">
        <span
          aria-label={ariaLabel ?? "Pick color"}
          className="absolute inset-0"
          style={{ background: value }}
        />
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="absolute inset-0 opacity-0 cursor-pointer"
        />
      </label>
      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => {
            // Hex-only: auto-# prefix, strip invalid chars, and commit LIVE the
            // moment it's a valid colour — no Enter needed, last value wins.
            let t = e.target.value.trim();
            t = "#" + t.replace(/^#/, "").replace(/[^0-9a-fA-F]/g, "").slice(0, 6);
            setDraft(t);
            if (/^#[0-9a-fA-F]{3}$|^#[0-9a-fA-F]{6}$/.test(t)) onChange(t);
          }}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            if (e.key === "Escape") {
              setDraft(value);
              setEditing(false);
            }
          }}
          className="w-20 bg-transparent text-[11px] font-mono text-graphite focus:outline-none"
        />
      ) : (
        <button
          onClick={() => setEditing(true)}
          className="text-[11px] font-mono text-graphite/70 group-hover:text-graphite"
          title="Click to edit hex"
        >
          {value.toUpperCase()}
        </button>
      )}
    </div>
  );
};
