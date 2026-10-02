"use client";

import { Component, type ReactNode } from "react";

/**
 * 2026-10-02: a part of a screen whose code arrives on demand (the map). A page
 * left open across a deploy still asks for the OLD code file, which is gone; the
 * failed load used to take the whole screen down. Now only this box says so, and
 * Try again reloads the page, which brings the new files (React.lazy remembers a
 * failed load, so drawing it again could never recover by itself).
 */
export class ChunkErrorBoundary extends Component<{ what: string; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="grid h-full w-full place-items-center rounded-card bg-surface-2 p-4 text-center">
        <div>
          <p className="text-sm text-muted">{this.props.what} couldn’t load.</p>
          <button type="button" onClick={() => window.location.reload()} className="press mt-2 h-11 rounded-card bg-primary px-4 text-sm font-medium text-on-primary">
            Try again
          </button>
        </div>
      </div>
    );
  }
}
