"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Trash2, Search, Film, Clock, FolderOpen, Loader2, ArrowUpRight, Plus, Share2, Check } from "lucide-react";
import { useEditor } from "@/v2/store/editor";

type Proj = { id: string; name: string; updatedAt: number; shared?: boolean };

const FOLDERS_KEY = "mapanisy-folders";       // { [projectId]: folderName }
const loadFolders = (): Record<string, string> => {
  if (typeof window === "undefined") return {};
  try { return JSON.parse(localStorage.getItem(FOLDERS_KEY) || "{}"); } catch { return {}; }
};

/** A deterministic cinematic gradient per project (its "cover"). */
function cover(id: string): string {
  let h = 0; for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360;
  return `linear-gradient(135deg, hsl(${h} 45% 12%) 0%, hsl(${(h + 40) % 360} 55% 18%) 55%, hsl(${(h + 90) % 360} 60% 22%) 100%)`;
}
const ago = (t: number) => {
  const d = Date.now() - t; const m = 60000, h = 3600000, day = 86400000;
  if (d < h) return `${Math.max(1, Math.round(d / m))}m ago`;
  if (d < day) return `${Math.round(d / h)}h ago`;
  if (d < 30 * day) return `${Math.round(d / day)}d ago`;
  return new Date(t).toLocaleDateString();
};

/**
 * The project Library — every saved animation as a card: open it in the editor,
 * download a portable .json, delete it, and organise into folders. Folders are
 * stored locally per device (no schema migration); the projects themselves live
 * per-user in /api/v2/projects.
 */
export const ProjectLibrary: React.FC = () => {
  const router = useRouter();
  const load = useEditor((s) => s.load);
  const [projects, setProjects] = useState<Proj[] | null>(null);
  const [folders, setFolders] = useState<Record<string, string>>({});
  const [active, setActive] = useState<string>("All");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [shareBusy, setShareBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const patchProject = (id: string, patch: Partial<Proj>) =>
    setProjects((ps) => (ps ?? []).map((p) => (p.id === id ? { ...p, ...patch } : p)));

  useEffect(() => {
    setFolders(loadFolders());
    fetch("/api/v2/projects").then((r) => r.json()).then((d) => setProjects(d.projects ?? [])).catch(() => setProjects([]));
  }, []);

  const setFolder = (id: string, folder: string) => {
    setFolders((f) => { const next = { ...f }; if (!folder) delete next[id]; else next[id] = folder; localStorage.setItem(FOLDERS_KEY, JSON.stringify(next)); return next; });
  };
  const folderNames = useMemo(() => Array.from(new Set(Object.values(folders))).sort(), [folders]);

  const visible = useMemo(() => {
    let list = projects ?? [];
    if (q.trim()) list = list.filter((p) => p.name.toLowerCase().includes(q.toLowerCase()));
    if (active === "Unfiled") list = list.filter((p) => !folders[p.id]);
    else if (active !== "All") list = list.filter((p) => folders[p.id] === active);
    return list;
  }, [projects, q, active, folders]);

  const open = async (id: string) => {
    setBusy(id);
    try {
      const r = await fetch(`/api/v2/projects?id=${encodeURIComponent(id)}`);
      const d = await r.json();
      if (d?.project) { load(d.project); router.push("/studio2"); return; }
    } catch {}
    setBusy(null);
  };
  const download = async (id: string, name: string) => {
    try {
      const r = await fetch(`/api/v2/projects?id=${encodeURIComponent(id)}`);
      const d = await r.json();
      if (!d?.project) return;
      const blob = new Blob([JSON.stringify(d.project, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = `${name.replace(/[^\w\- ]/g, "").trim() || "animation"}.mapanisy.json`; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {}
  };
  const del = async (id: string) => {
    if (!confirm("Delete this animation? This can't be undone.")) return;
    await fetch(`/api/v2/projects?id=${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => {});
    setProjects((ps) => (ps ?? []).filter((p) => p.id !== id));
  };
  /** Publish a public read-only link and copy it to the clipboard. */
  const share = async (id: string) => {
    setShareBusy(id);
    try {
      const r = await fetch("/api/v2/projects/share", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, enable: true }),
      });
      const d = await r.json();
      if (d?.url) {
        const url = d.url.startsWith("http") ? d.url : `${window.location.origin}${d.url}`;
        try { await navigator.clipboard.writeText(url); } catch { window.prompt("Copy this share link:", url); }
        patchProject(id, { shared: true });
        setCopied(id); setTimeout(() => setCopied((c) => (c === id ? null : c)), 1800);
      }
    } catch {}
    setShareBusy(null);
  };
  const unshare = async (id: string) => {
    if (!confirm("Stop sharing? The existing link will stop working.")) return;
    setShareBusy(id);
    await fetch("/api/v2/projects/share", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, enable: false }),
    }).catch(() => {});
    patchProject(id, { shared: false });
    setShareBusy(null);
  };
  const newFolder = (id: string) => { const name = prompt("New folder name")?.trim(); if (name) setFolder(id, name); };

  return (
    <div className="rounded-xl border border-line/60 bg-paper-100 overflow-hidden anim-fade-up" style={{ animationDelay: "390ms" }}>
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 pt-5 pb-4 border-b border-line/40">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-paper-100 border border-line"><FolderOpen size={16} className="text-graphite/50" /></div>
          <div>
            <div className="text-sm font-semibold text-graphite">Your library</div>
            <div className="text-xs text-graphite/35 mt-0.5">{projects ? `${projects.length} animation${projects.length === 1 ? "" : "s"}` : "Loading…"}</div>
          </div>
        </div>
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-graphite/30" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search animations…" className="w-44 rounded-lg border border-line/60 bg-white pl-8 pr-3 py-1.5 text-xs text-graphite placeholder:text-graphite/30 focus:outline-none focus:border-iris/40" />
        </div>
      </div>

      {/* Folder chips */}
      <div className="flex flex-wrap items-center gap-1.5 px-6 pt-3">
        {["All", "Unfiled", ...folderNames].map((f) => (
          <button key={f} onClick={() => setActive(f)} className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${active === f ? "border-iris bg-iris/10 text-iris" : "border-line text-graphite/50 hover:text-graphite"}`}>
            {f}{f !== "All" && f !== "Unfiled" ? "" : ""}
          </button>
        ))}
      </div>

      <div className="p-6 pt-4">
        {projects === null ? (
          <div className="flex items-center gap-2 py-8 text-graphite/30"><Loader2 size={16} className="animate-spin" /><span className="text-sm">Loading your animations…</span></div>
        ) : visible.length === 0 ? (
          <div className="rounded-lg border border-dashed border-line py-10 text-center">
            <Film size={22} className="mx-auto mb-2 text-graphite/25" />
            <p className="text-sm text-graphite/45">{projects.length === 0 ? "No saved animations yet." : "Nothing in this folder."}</p>
            <button onClick={() => router.push("/studio2")} className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-brand px-3.5 py-2 text-xs font-semibold text-white shadow-glow-iris hover:-translate-y-0.5 transition-transform"><Plus size={13} /> Create one</button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {visible.map((p) => (
              <div key={p.id} className="group overflow-hidden rounded-xl border border-line/60 bg-white transition-all hover:border-iris/40 hover:-translate-y-0.5">
                <button onClick={() => open(p.id)} className="relative block h-28 w-full overflow-hidden text-left" style={{ background: cover(p.id) }} title="Open in the editor">
                  <div className="absolute inset-0" style={{ backgroundImage: "radial-gradient(ellipse at center, transparent 45%, rgba(0,0,0,0.4) 120%)" }} />
                  <span className="absolute right-2 top-2 rounded-md bg-black/40 p-1 text-white/70 opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100">{busy === p.id ? <Loader2 size={12} className="animate-spin" /> : <ArrowUpRight size={12} />}</span>
                  {folders[p.id] && <span className="absolute left-2 top-2 rounded-full bg-black/40 px-2 py-0.5 text-[9px] font-medium text-white/80 backdrop-blur-sm">{folders[p.id]}</span>}
                  {p.shared && <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full bg-emerald-500/85 px-2 py-0.5 text-[9px] font-semibold text-white backdrop-blur-sm"><Share2 size={8} /> Shared</span>}
                </button>
                <div className="px-3 py-2.5">
                  <div className="truncate text-[13px] font-medium text-graphite" title={p.name}>{p.name || "Untitled"}</div>
                  <div className="mt-0.5 flex items-center gap-1 text-[10px] text-graphite/35"><Clock size={9} /> {ago(p.updatedAt)}</div>
                  <div className="mt-2 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      onClick={() => share(p.id)}
                      onContextMenu={(e) => { if (p.shared) { e.preventDefault(); unshare(p.id); } }}
                      title={p.shared ? "Copy share link (right-click to stop sharing)" : "Share a public link"}
                      className={`rounded-md border p-1.5 ${copied === p.id ? "border-emerald-400 text-emerald-500" : p.shared ? "border-emerald-300/60 text-emerald-500 hover:text-emerald-600" : "border-line/60 text-graphite/40 hover:text-iris"}`}
                    >
                      {shareBusy === p.id ? <Loader2 size={12} className="animate-spin" /> : copied === p.id ? <Check size={12} /> : <Share2 size={12} />}
                    </button>
                    <button onClick={() => download(p.id, p.name)} title="Download .json" className="rounded-md border border-line/60 p-1.5 text-graphite/40 hover:text-iris"><Download size={12} /></button>
                    <select
                      value={folders[p.id] ?? ""}
                      onChange={(e) => { if (e.target.value === "__new") newFolder(p.id); else setFolder(p.id, e.target.value); }}
                      title="Move to folder"
                      className="min-w-0 flex-1 rounded-md border border-line/60 bg-white px-1.5 py-1 text-[10px] text-graphite/55 focus:outline-none"
                    >
                      <option value="">Unfiled</option>
                      {folderNames.map((f) => <option key={f} value={f}>{f}</option>)}
                      <option value="__new">+ New folder…</option>
                    </select>
                    <button onClick={() => del(p.id)} title="Delete" className="rounded-md border border-line/60 p-1.5 text-graphite/40 hover:text-red-400"><Trash2 size={12} /></button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
