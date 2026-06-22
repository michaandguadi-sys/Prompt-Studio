import { HistoryControls } from "@/components/HistoryControls/HistoryControls";
import { RenderQueueWidget } from "@/components/RenderQueueWidget/RenderQueueWidget";
import { ToastProvider } from "@/components/Toast/Toast";
import { StudioSidebar } from "@/components/StudioSidebar";

export default function StudioLayout({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <HistoryControls />
      <div className="flex h-screen w-screen overflow-hidden bg-paper-100">
        <StudioSidebar />
        <main className="flex-1 overflow-hidden">{children}</main>
        <RenderQueueWidget />
      </div>
    </ToastProvider>
  );
}
