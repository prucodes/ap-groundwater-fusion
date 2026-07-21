"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = {
  children: ReactNode;
  fallback: (message: string) => ReactNode;
  onError: (message: string) => void;
};

type State = { message: string | null };

export class SceneErrorBoundary extends Component<Props, State> {
  state: State = { message: null };

  static getDerivedStateFromError(error: unknown): State {
    return {
      message: error instanceof Error ? error.message : "The 3D scene failed to render.",
    };
  }

  componentDidCatch(error: unknown, errorInfo: ErrorInfo) {
    const message = error instanceof Error ? error.message : String(error);
    this.props.onError(message);
    if (process.env.NODE_ENV !== "production") {
      console.error("Living Water Table scene failure", error, errorInfo);
    }
  }

  render() {
    if (this.state.message) return this.props.fallback(this.state.message);
    return this.props.children;
  }
}
