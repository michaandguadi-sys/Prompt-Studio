"use client";

import React from "react";

/**
 * Error boundary that isolates a render crash to ONE pane. Critically: if the
 * map preview throws (e.g. a transient Mapbox state), this keeps the rest of the
 * editor — the AI bar, the toolbar, Restyle, Settings, the inspector — alive and
 * usable, instead of React unmounting the whole page. Auto-recovers when the
 * project changes (any edit), so a bad frame heals itself on the next tweak.
 */
export class ErrorBoundary extends React.Component<
  { children: React.ReactNode; resetKey?: unknown; label?: string },
  { error: Error | null }
> {
  constructor(props: any) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error) {
    // eslint-disable-next-line no-console
    console.error(`[Mapanisy${this.props.label ? " · " + this.props.label : ""}]`, error);
  }
  componentDidUpdate(prev: { resetKey?: unknown }) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }
  render() {
    if (this.state.error) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-3 bg-paper-100 p-8 text-center">
          <div className="text-sm font-semibold text-graphite/75">The preview hit a snag.</div>
          <div className="max-w-sm text-[11px] leading-relaxed text-graphite/45">
            {this.state.error.message || "A frame failed to render."} — the rest of the editor still works. Tweak anything or reload the preview.
          </div>
          <button onClick={() => this.setState({ error: null })} className="rounded-lg bg-brand px-4 py-2 text-xs font-semibold text-white hover:opacity-90">
            Reload preview
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
