"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useEditor } from "@/v2/store/editor";
import { confirmDialog } from "@/v2/ui/dialogs";
import { Film, Trash2, Sparkles } from "lucide-react";

type Saved = { id: string; name: string; updatedAt: number };

/**
 * "My Projects" — the user's SAVED work (distinct from Templates, which are
 * starting points). Backed by the v2 project store. Click to open in the
 * editor; trash to delete.
 */
export const ProjectsGrid: React.FC = () => {
  const router = useRouter();
  const load = useEditor((s) => s.load);
  const [projects, setProjects] = useState<Saved[] | null>(null);

  const refresh = async () => {
    try {
      const res = await fetch("/api/v2/projects");
      const data = await res.json();
      setProjects(Array.isArray(data.projects) ? data.projects : []);
    } catch {
      setProjects([]);
    }
  };
  useEffect(() => { refresh(); }, []);

  const open = async (p: Saved) => {
    try {
      const r = await fetch(`/api/v2/projects?id=${encodeURIComponent(p.id)}`);
      const d = await r.json();
      if (d.project) load(d.project);
    } catch { /* ignore */ }
    router.push("/studio2");
  };

  const remove = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!(await confirmDialog({ title: `Delete project "${id}"?`, confirmLabel: "Delete", danger: true }))) return;
    await fetch(`/api/v2/projects?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    refresh();
  };

  if (projects === null) {
    return <div className="py-6 text-xs text-graphite/30">Loading your projects…</div>;
  }

  if (projects.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-black/10 bg-black/[0.02] px-6 py-14 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand text-white shadow-glow-iris">
          <Film size={20} />
        </div>
        <h3 className="mt-4 text-base font-semibold text-graphite">No films yet</h3>
        <p className="mt-1 max-w-xs text-sm text-graphite/45">
          Describe a story or drop a GPS track — your first cinematic map animation lands here.
        </p>
        <button
          onClick={() => router.push("/home")}
          className="mt-5 inline-flex items-center gap-2 rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-white shadow-glow-iris transition-transform hover:-translate-y-0.5"
        >
          <Sparkles size={15} /> Create your first film
        </button>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {projects.map((p) => (
        <div
          key={p.id}
          role="button"
          tabIndex={0}
          onClick={() => open(p)}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(p); } }}
          className="group relative flex cursor-pointer items-center gap-3 overflow-hidden rounded-2xl card-light px-4 py-3.5 text-left transition-all hover:-translate-y-0.5 hover:shadow-floaty focus:outline-none focus-visible:ring-2 focus-visible:ring-iris/50"
        >
          <div className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity bg-brand-soft" />
          <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand text-white shadow-glow-iris">
            <Film size={16} />
          </div>
          <div className="relative min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-graphite">{p.name || p.id}</div>
            <div className="text-[11px] text-graphite/35">map animation</div>
          </div>
          <button
            type="button"
            onClick={(e) => remove(e, p.id)}
            aria-label={`Delete ${p.name || p.id}`}
            className="relative shrink-0 rounded-md p-1.5 text-graphite/25 opacity-0 transition-all hover:text-red-400 focus-visible:opacity-100 group-hover:opacity-100"
            title="Delete project"
          >
            <Trash2 size={13} />
          </button>
        </div>
      ))}
    </div>
  );
};
