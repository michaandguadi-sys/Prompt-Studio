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
 * Toasts auto-dismiss after 3.5s but can be manually closed. They stack from
 * the bottom-left so they don't collide with the render queue widget at
 * bottom-right.
 */

type ToastKind = "success" | "info" | "error";
type Toast = { id: string; kind: ToastKind; title: string; detail?: string };

const ToastCtx = createContext<{
  push: (kind: ToastKind, title: string, detail?: string) => void;
  success: (title: string, detail?: string) => void;
  info: (title: string, detail?: string) => void;
  error: (title: string, detail?: string) => void;
}>({
  push: () => {},
  success: () => {},
  info: () => {},
  error: () => {},
});

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((kind: ToastKind, title: string, detail?: string) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, kind, title, detail }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
  }, []);

  const ctx = {
    push,
    success: (t: string, d?: string) => push("success", t, d),
    info:    (t: string, d?: string) => push("info", t, d),
    error:   (t: string, d?: string) => push("error", t, d),
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
      <button onClick={onClose} className="text-white/40 hover:text-white shrink-0 mt-0.5">
        <X size={12} />
      </button>
    </div>
  );
};
