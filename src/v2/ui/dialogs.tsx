"use client";

import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { AlertTriangle } from "lucide-react";

/**
 * In-app dialogs — the polished replacement for native window.alert / confirm /
 * prompt (which read as "browser software", never Apple-grade). Imperative API:
 * `await confirmDialog({...})`, `await promptDialog({...})`, `alertDialog({...})`.
 * Each renders a styled modal into a fresh portal and resolves on choice, so it
 * drops into existing (a)sync handlers with no provider or context wiring.
 */

type ConfirmOpts = { title: string; message?: string; confirmLabel?: string; cancelLabel?: string; danger?: boolean };
type PromptOpts = { title: string; message?: string; placeholder?: string; defaultValue?: string; confirmLabel?: string };

function mount(render: (close: () => void) => React.ReactNode): void {
  if (typeof document === "undefined") return;
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  const close = () => { setTimeout(() => { root.unmount(); host.remove(); }, 0); };
  root.render(<>{render(close)}</>);
}

const Shell: React.FC<{ onDismiss: () => void; children: React.ReactNode }> = ({ onDismiss, children }) => (
  <div className="fixed inset-0 z-[400] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" style={{ animation: "dlgFade .18s ease" }} onClick={onDismiss}>
    <style>{`@keyframes dlgFade{from{opacity:0}to{opacity:1}}@keyframes dlgRise{from{opacity:0;transform:translateY(10px) scale(.985)}to{opacity:1;transform:none}}`}</style>
    <div className="w-[min(92vw,384px)] overflow-hidden rounded-2xl border border-black/10 bg-white shadow-[0_34px_90px_-26px_rgba(20,28,55,0.5)]" style={{ animation: "dlgRise .22s cubic-bezier(.3,1.1,.4,1)" }} onClick={(e) => e.stopPropagation()}>
      {children}
    </div>
  </div>
);

export function confirmDialog(opts: ConfirmOpts): Promise<boolean> {
  return new Promise((resolve) => {
    mount((close) => {
      const done = (v: boolean) => { close(); resolve(v); };
      return <ConfirmBody opts={opts} done={done} />;
    });
  });
}

const ConfirmBody: React.FC<{ opts: ConfirmOpts; done: (v: boolean) => void }> = ({ opts, done }) => {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") done(false); else if (e.key === "Enter") done(true); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [done]);
  return (
    <Shell onDismiss={() => done(false)}>
      <div className="flex gap-3 px-5 pb-4 pt-5">
        {opts.danger && <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-red-500/10 text-red-500"><AlertTriangle size={18} /></div>}
        <div className="min-w-0">
          <div className="text-[15px] font-semibold leading-snug text-graphite">{opts.title}</div>
          {opts.message && <div className="mt-1 text-[13px] leading-relaxed text-graphite/55">{opts.message}</div>}
        </div>
      </div>
      <div className="flex gap-2 border-t border-line/70 bg-paper-50/50 px-5 py-3">
        <button onClick={() => done(false)} className="flex-1 rounded-lg border border-line px-3 py-2 text-[13px] font-medium text-graphite/70 transition-colors hover:bg-graphite/[0.04]">{opts.cancelLabel ?? "Cancel"}</button>
        <button autoFocus onClick={() => done(true)} className={`flex-1 rounded-lg px-3 py-2 text-[13px] font-semibold text-white transition-transform hover:-translate-y-0.5 ${opts.danger ? "bg-red-500 hover:bg-red-600" : "bg-brand"}`}>{opts.confirmLabel ?? "Confirm"}</button>
      </div>
    </Shell>
  );
};

/** Text-input dialog. Resolves the trimmed string, or null on cancel. */
export function promptDialog(opts: PromptOpts): Promise<string | null> {
  return new Promise((resolve) => {
    mount((close) => {
      const done = (v: string | null) => { close(); resolve(v); };
      return <PromptBody opts={opts} done={done} />;
    });
  });
}

const PromptBody: React.FC<{ opts: PromptOpts; done: (v: string | null) => void }> = ({ opts, done }) => {
  const [val, setVal] = useState(opts.defaultValue ?? "");
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); ref.current?.select(); }, []);
  const submit = () => done(val.trim() || null);
  return (
    <Shell onDismiss={() => done(null)}>
      <div className="px-5 pb-4 pt-5">
        <div className="text-[15px] font-semibold leading-snug text-graphite">{opts.title}</div>
        {opts.message && <div className="mt-1 text-[13px] leading-relaxed text-graphite/55">{opts.message}</div>}
        <input
          ref={ref}
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") submit(); else if (e.key === "Escape") done(null); }}
          placeholder={opts.placeholder}
          className="mt-3 w-full rounded-lg border border-line bg-paper-50 px-3 py-2 text-[13px] text-graphite outline-none transition-colors focus:border-brand/60"
        />
      </div>
      <div className="flex gap-2 border-t border-line/70 bg-paper-50/50 px-5 py-3">
        <button onClick={() => done(null)} className="flex-1 rounded-lg border border-line px-3 py-2 text-[13px] font-medium text-graphite/70 transition-colors hover:bg-graphite/[0.04]">Cancel</button>
        <button onClick={submit} disabled={!val.trim()} className="flex-1 rounded-lg bg-brand px-3 py-2 text-[13px] font-semibold text-white transition-transform hover:-translate-y-0.5 disabled:opacity-40">{opts.confirmLabel ?? "Save"}</button>
      </div>
    </Shell>
  );
};

/** A one-button notice (replaces window.alert). */
export function alertDialog(opts: { title: string; message?: string }): Promise<void> {
  return new Promise((resolve) => {
    mount((close) => {
      const done = () => { close(); resolve(); };
      return <AlertBody opts={opts} done={done} />;
    });
  });
}

const AlertBody: React.FC<{ opts: { title: string; message?: string }; done: () => void }> = ({ opts, done }) => {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape" || e.key === "Enter") done(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [done]);
  return (
    <Shell onDismiss={done}>
      <div className="px-5 pb-4 pt-5">
        <div className="text-[15px] font-semibold leading-snug text-graphite">{opts.title}</div>
        {opts.message && <div className="mt-1 text-[13px] leading-relaxed text-graphite/55">{opts.message}</div>}
      </div>
      <div className="border-t border-line/70 bg-paper-50/50 px-5 py-3">
        <button autoFocus onClick={done} className="w-full rounded-lg bg-brand px-3 py-2 text-[13px] font-semibold text-white transition-transform hover:-translate-y-0.5">OK</button>
      </div>
    </Shell>
  );
};
