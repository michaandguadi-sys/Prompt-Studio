"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useEditor } from "@/v2/store/editor";
import { Film, Trash2, FolderOpen } from "lucide-react";

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
    if (!confirm(`Delete project "${id}"?`)) return;
    await fetch(`/api/v2/projects?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    refresh();
  };

  if (projects === null) {
    return <div className="py-6 text-xs text-graphite/30">Loading your projects…</div>;
  }

  if (projects.length === 0) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-dashed border-black/10 bg-black/[0.02] px-5 py-6 text-sm text-graphite/35">
        <FolderOpen size={16} className="text-graphite/25" />
        No saved projects yet — generate or build an animation, then “Save” it in the editor.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {projects.map((p) => (
        <button
          key={p.id}
          onClick={() => open(p)}
          className="group relative flex items-center gap-3 overflow-hidden rounded-2xl card-light px-4 py-3.5 text-left transition-all hover:-translate-y-0.5 hover:shadow-floaty"
        >
          <div className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity bg-brand-soft" />
          <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand text-white shadow-glow-iris">
            <Film size={16} />
          </div>
          <div className="relative min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-graphite">{p.name || p.id}</div>
            <div className="text-[11px] text-graphite/35">map animation</div>
          </div>
          <span
            onClick={(e) => remove(e, p.id)}
            className="relative shrink-0 rounded-md p-1.5 text-graphite/25 opacity-0 transition-all hover:text-red-400 group-hover:opacity-100"
            title="Delete project"
          >
            <Trash2 size={13} />
          </span>
        </button>
      ))}
    </div>
  );
};
