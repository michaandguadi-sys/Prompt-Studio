"use client";

import React, { useEffect, useState } from "react";
import { Save, FolderOpen, Loader2, Trash2, Check, Share2, Film } from "lucide-react";
import { useEditor } from "../store/editor";
import { useToast } from "@/components/Toast/Toast";
import { promptDialog } from "./dialogs";
import { dimsFor } from "../doc/schema";
import { buildFcpxml, safeFileName } from "@/lib/nle/fcpxml";

type Saved = { id: string; name: string; updatedAt: number };

/** Save current project + open a saved one. Map-first projects, named, listed. */
export const ProjectMenu: React.FC = () => {
  const project = useEditor((s) => s.project);
  const load = useEditor((s) => s.load);
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<Saved[] | null>(null);
  const [sharing, setSharing] = useState(false);
  const [sharedMsg, setSharedMsg] = useState(false);

  // Publish a public read-only link and copy it — saves first so the share API
  // has a persisted row to attach the token to.
  const share = async () => {
    setSharing(true);
    try {
      await fetch("/api/v2/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: project.name, project }) });
      const r = await fetch("/api/v2/projects/share", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: project.id, enable: true }) });
      const d = await r.json();
      if (d?.url) {
        const url = d.url.startsWith("http") ? d.url : `${window.location.origin}${d.url}`;
        try { await navigator.clipboard.writeText(url); } catch { void promptDialog({ title: "Copy your share link", message: "Select the link below and copy it.", defaultValue: url, confirmLabel: "Done" }); }
        setSharedMsg(true); setTimeout(() => setSharedMsg(false), 1900);
      }
    } catch { /* ignore */ }
    setSharing(false);
  };

  // Download an FCPXML for Final Cut / DaVinci, referencing the rendered .mp4.
  const exportFcpxml = () => {
    const comp = project.composition;
    const { width, height } = dimsFor(comp.aspect);
    const scenes = project.scenes ?? [];
    const durationSec = scenes.length > 1 ? scenes.reduce((s, sc) => s + (sc.composition?.durationSec || 0), 0) : comp.durationSec;
    const xml = buildFcpxml({ name: project.name, width, height, fps: comp.fps, durationSec });
    const blob = new Blob([xml], { type: "application/xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `${safeFileName(project.name)}.fcpxml`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const save = async () => {
    setSaving(true);
    try {
      const r = await fetch("/api/v2/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: project.name, project }),
      });
      // fetch does NOT throw on 4xx/5xx — check res.ok, or a failed save would
      // still flash "Saved" and the user would close the tab thinking it stuck.
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setSaved(true);
      setTimeout(() => setSaved(false), 1600);
    } catch {
      toast.error("Couldn't save to your library", "Your changes are safe on this device — try Save again.");
    }
    setSaving(false);
  };

  // ⌘S / Ctrl-S saves (dispatched from the editor's global hotkey handler).
  useEffect(() => {
    const onSave = () => { void save(); };
    window.addEventListener("mapanisy:save", onSave);
    return () => window.removeEventListener("mapanisy:save", onSave);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project]);

  const refresh = async () => {
    setList(null);
    try {
      const r = await fetch("/api/v2/projects");
      const d = await r.json();
      setList(d.projects ?? []);
    } catch { setList([]); }
  };

  const openMenu = () => { setOpen((o) => { const n = !o; if (n) refresh(); return n; }); };

  const openProject = async (id: string) => {
    try {
      const r = await fetch(`/api/v2/projects?id=${encodeURIComponent(id)}`);
      const d = await r.json();
      if (d.project) load(d.project);
    } catch { /* ignore */ }
    setOpen(false);
  };

  const remove = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    await fetch(`/api/v2/projects?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    refresh();
  };

  return (
    <div className="flex items-center gap-1.5">
      <button onClick={save} disabled={saving} title="Save project" className="inline-flex items-center gap-1.5 rounded-lg border border-black/10 bg-paper-100/70 px-2.5 py-1.5 text-xs text-graphite/70 hover:text-graphite hover:border-black/20 transition-colors">
        {saving ? <Loader2 size={12} className="animate-spin" /> : saved ? <Check size={12} className="text-emerald-400" /> : <Save size={12} />}
        {saved ? "Saved" : "Save"}
      </button>
      <div className="relative">
        <button onClick={openMenu} title="Open project" className="inline-flex items-center gap-1.5 rounded-lg border border-black/10 bg-paper-100/70 px-2.5 py-1.5 text-xs text-graphite/70 hover:text-graphite hover:border-black/20 transition-colors">
          <FolderOpen size={12} /> Open
        </button>
        {open && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
            <div className="absolute right-0 z-20 mt-1 w-64 overflow-hidden rounded-xl glass-light p-1">
              <div className="px-2.5 py-1.5 text-[10px] uppercase tracking-wider text-graphite/50">My projects</div>
              {list === null ? (
                <div className="px-2.5 py-3 text-xs text-graphite/45">Loading…</div>
              ) : list.length === 0 ? (
                <div className="px-2.5 py-3 text-xs text-graphite/45">No saved projects yet.</div>
              ) : (
                <div className="max-h-72 overflow-y-auto">
                  {list.map((p) => (
                    <div key={p.id} onClick={() => openProject(p.id)} className="group flex items-center gap-2 rounded-lg px-2.5 py-2 hover:bg-black/5 cursor-pointer">
                      <span className="min-w-0 flex-1 truncate text-xs text-graphite/80">{p.name}</span>
                      <button onClick={(e) => remove(e, p.id)} className="opacity-0 group-hover:opacity-100 text-graphite/45 hover:text-red-400"><Trash2 size={12} /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
      <button onClick={share} disabled={sharing} title="Publish a public link & copy it" className="inline-flex items-center gap-1.5 rounded-lg border border-black/10 bg-paper-100/70 px-2.5 py-1.5 text-xs text-graphite/70 hover:text-graphite hover:border-black/20 transition-colors">
        {sharing ? <Loader2 size={12} className="animate-spin" /> : sharedMsg ? <Check size={12} className="text-emerald-400" /> : <Share2 size={12} />}
        {sharedMsg ? "Link copied" : "Share"}
      </button>
      <button onClick={exportFcpxml} title="Export FCPXML for Final Cut / DaVinci (place it next to your rendered .mp4, then import)" className="inline-flex items-center gap-1.5 rounded-lg border border-black/10 bg-paper-100/70 px-2.5 py-1.5 text-xs text-graphite/70 hover:text-graphite hover:border-black/20 transition-colors">
        <Film size={12} /> FCPXML
      </button>
    </div>
  );
};
