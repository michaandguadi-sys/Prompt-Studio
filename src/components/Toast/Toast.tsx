"use client";

import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { CheckCircle, Info, AlertTriangle, X } from "lucide-react";

/**
 * Tiny global toast system. One <ToastProvider> wraps the app; any component
 * grabs the `useToast()` hook to fire transient confirmations:
 *
 *   const toast = useToast();
 *   toast.success("Saved", "Scene-Berlin.scene.json downloaded");
 *
 * Pass a 4th `action` arg to add an inline button — the launch-grade "undo an
 * accidental delete" affordance:
 *
 *   toast.info("Removed Spain", undefined, { label: "Undo", onClick: undo });
 *
 * Plain toasts auto-dismiss after 3.5s; actionable ones linger 6s (so there's
 * time to hit Undo) but can be closed manually. They stack from the bottom-left.
 */

type ToastKind = "success" | "info" | "error";
type ToastAction = { label: string; onClick: () => void };
type Toast = { id: string; kind: ToastKind; title: string; detail?: string; action?: ToastAction };

type Fire = (title: string, detail?: string, action?: ToastAction) => void;
const ToastCtx = createContext<{
  push: (kind: ToastKind, title: string, detail?: string, action?: ToastAction) => void;
  success: Fire;
  info: Fire;
  error: Fire;
}>({
  push: () => {},
  success: () => {},
  info: () => {},
  error: () => {},
});

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((kind: ToastKind, title: string, detail?: string, action?: ToastAction) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, kind, title, detail, action }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), action ? 6000 : 3500);
  }, []);

  const ctx = {
    push,
    success: (t: string, d?: string, a?: ToastAction) => push("success", t, d, a),
    info:    (t: string, d?: string, a?: ToastAction) => push("info", t, d, a),
    error:   (t: string, d?: string, a?: ToastAction) => push("error", t, d, a),
  };

  return (
    <ToastCtx.Provider value={ctx}>
      {children}
      <div className="fixed bottom-4 left-4 z-50 flex flex-col gap-2 max-w-sm pointer-events-none">
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onClose={() => setToasts((s) => s.filter((x) => x.id !== t.id))} />
        ))}
      </div>
    </ToastCtx.Provider>
  );
};

export const useToast = () => useContext(ToastCtx);

const ToastItem: React.FC<{ toast: Toast; onClose: () => void }> = ({ toast, onClose }) => {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setShow(true), 10);
    return () => clearTimeout(t);
  }, []);
  const Icon = toast.kind === "success" ? CheckCircle : toast.kind === "error" ? AlertTriangle : Info;
  const accent =
    toast.kind === "success" ? "border-emerald-500/50 text-emerald-400"
    : toast.kind === "error" ? "border-red-500/50 text-red-400"
    : "border-amber/50 text-amber";
  return (
    <div
      className={`pointer-events-auto flex items-start gap-2 rounded-md border ${accent} bg-ink-900/95 backdrop-blur-sm px-3 py-2.5 shadow-2xl transition-all duration-300 ${
        show ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"
      }`}
      role="status"
    >
      <Icon size={14} className="mt-0.5 shrink-0" />
      <div className="flex-1 text-xs">
        <div className="font-semibold text-white">{toast.title}</div>
        {toast.detail && <div className="text-white/60 mt-0.5">{toast.detail}</div>}
      </div>
      {toast.action && (
        <button
          onClick={() => { toast.action!.onClick(); onClose(); }}
          className="shrink-0 rounded bg-white/10 px-2 py-1 text-[11px] font-semibold text-white hover:bg-white/20"
        >
          {toast.action.label}
        </button>
      )}
      <button onClick={onClose} className="text-white/40 hover:text-white shrink-0 mt-0.5">
        <X size={12} />
      </button>
    </div>
  );
};
