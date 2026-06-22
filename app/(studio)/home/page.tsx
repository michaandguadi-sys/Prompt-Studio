import Link from "next/link";
import { Sparkles, Layers } from "lucide-react";
import { OnboardingModal } from "@/components/home/OnboardingModal";
import { DirectorStage } from "@/components/home/DirectorStage";
import { TemplatesGrid } from "@/components/home/TemplatesGrid";
import { ProjectsGrid } from "@/components/home/ProjectsGrid";

const SERIF = "Newsreader, 'Playfair Display', Georgia, serif";

export default function StudioHome() {
  return (
    <div className="h-full overflow-y-auto bg-paper-50">
      <OnboardingModal />

      {/* ── The Living Command — bright editorial entry ─────────────────── */}
      <DirectorStage />

      {/* ── The deck: your films + sparks ───────────────────────────────── */}
      <div className="relative border-t border-line bg-paper-100 pb-16">
        {/* My projects */}
        <div className="mx-auto max-w-5xl px-8 pt-12">
          <div className="mb-4 flex items-baseline justify-between">
            <div>
              <h2 className="text-[22px] font-medium text-graphite" style={{ fontFamily: SERIF }}>Your films</h2>
              <p className="text-[12px] text-graphite/50">Saved animations — pick up where you left off.</p>
            </div>
            <Link href="/studio2" className="inline-flex items-center gap-1.5 text-xs text-graphite/45 transition-colors hover:text-iris">
              <Layers size={12} /> Blank map
            </Link>
          </div>
          <ProjectsGrid />
        </div>

        {/* Templates / sparks */}
        <div className="mx-auto max-w-5xl px-8 pt-12">
          <div className="mb-4">
            <h2 className="text-[22px] font-medium text-graphite" style={{ fontFamily: SERIF }}>Start from a spark</h2>
            <p className="text-[12px] text-graphite/50">Curated starting points — open one and make it yours.</p>
          </div>
          <TemplatesGrid />
        </div>

        {/* Output note */}
        <div className="mx-auto max-w-5xl px-8 pt-12">
          <div className="flex items-center justify-between gap-4 border-t border-line px-1 pt-6 text-xs text-graphite/50">
            <div className="flex items-center gap-2">
              <div className="h-1.5 w-1.5 rounded-full bg-iris animate-breathe" />
              Exports up to <span className="font-medium text-graphite/65">4K · 24fps</span> — landscape, vertical, or square.
            </div>
            <Link href="/brand" className="inline-flex items-center gap-1.5 transition-colors hover:text-iris">
              <Sparkles size={11} /> Set up brand
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
