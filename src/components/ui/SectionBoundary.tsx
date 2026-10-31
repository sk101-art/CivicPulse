'use client';

import { Component, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';

interface Props {
  /** Shown in the fallback, e.g. "Live traffic". */
  title: string;
  children: ReactNode;
  /** Optional custom fallback. */
  fallback?: ReactNode;
}

interface State {
  failed: boolean;
}

/**
 * Error boundary for one page section (traffic card, AI card, repair window, comments...).
 * A failing section shows a short friendly note instead of taking the whole page down.
 */
export class SectionBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error(`Section "${this.props.title}" failed to render:`, error);
  }

  render() {
    if (this.state.failed) {
      return (
        this.props.fallback ?? (
          <div
            role="status"
            data-testid="section-fallback"
            className="p-4 rounded-2xl bg-white/5 border border-white/10 text-xs font-mono text-white/70 flex items-center gap-2"
          >
            <AlertTriangle className="w-4 h-4 text-amber-300 shrink-0" aria-hidden="true" />
            <span>{this.props.title} is unavailable right now. The rest of the page still works.</span>
          </div>
        )
      );
    }
    return this.props.children;
  }
}
