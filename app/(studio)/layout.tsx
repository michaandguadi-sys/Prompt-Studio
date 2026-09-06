import { HistoryControls } from "@/components/HistoryControls/HistoryControls";
import { ToastProvider } from "@/components/Toast/Toast";
import { StudioSidebar } from "@/components/StudioSidebar";

// NOTE: the v2 editor (src/v2/ui/Editor.tsx) mounts its OWN render queue
// (<RenderQueue/>) wired to /api/v2/render. The legacy RenderQueueWidget that
// used to live here polled the disconnected /api/render-queue and rendered a
// second, broken queue on top of the real one — removed. See LAUNCH.md
// "Deferred" for the rest of the orphaned v1 render layer.
export default function StudioLayout({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <HistoryControls />
      <div className="studio-dark flex h-screen w-screen overflow-hidden bg-paper-50 text-graphite">
        <StudioSidebar />
        <main className="flex-1 overflow-hidden">{children}</main>
      </div>
    </ToastProvider>
  );
}
