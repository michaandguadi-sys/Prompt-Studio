import { ProjectsGrid } from "@/components/home/ProjectsGrid";

const SERIF = "Newsreader, 'Playfair Display', Georgia, serif";

/** Films gallery — every saved animation, in the dark studio shell. */
export default function ProjectsPage() {
  return (
    <div className="h-full overflow-y-auto bg-paper-50">
      <div className="mx-auto max-w-5xl px-8 py-12">
        <div className="mb-1 flex items-center gap-2">
          <span className="h-px w-5 bg-iris/50" />
          <span className="text-[10px] font-semibold uppercase tracking-[0.3em] text-iris">Your films</span>
        </div>
        <h1 className="text-[clamp(1.8rem,3.5vw,2.6rem)] font-medium tracking-tight text-graphite" style={{ fontFamily: SERIF }}>
          Everything you&apos;ve made
        </h1>
        <p className="mt-2 text-sm text-graphite-muted">Open one to keep editing — or start a fresh map from Create.</p>
        <div className="mt-8">
          <ProjectsGrid />
        </div>
      </div>
    </div>
  );
}
