// Last-resort render guard. A thrown error anywhere in the tree would otherwise
// leave a blank page; this shows a recoverable fallback instead. Deliberately
// self-contained (no i18n / store / UI-kit imports) so it still renders even if
// those are what crashed.

import React from "react";

interface State {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Console only — no external telemetry (privacy).
    console.error("Keymano crashed:", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div
        role="alert"
        style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "0.75rem",
          padding: "2rem",
          textAlign: "center",
          fontFamily: "Inter, Helvetica, Arial, sans-serif",
          background: "var(--bg, #161009)",
          color: "var(--text, #e9e0cf)",
        }}
      >
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700, margin: 0 }}>Something went wrong</h1>
        <p style={{ maxWidth: "32rem", opacity: 0.8, margin: 0 }}>
          Keymano hit an unexpected error. Reloading usually fixes it — your unsaved work in this
          tab may be lost.
        </p>
        <pre
          style={{
            maxWidth: "min(90vw, 40rem)",
            overflow: "auto",
            padding: "0.75rem 1rem",
            borderRadius: "0.5rem",
            background: "var(--panel-2, #2b2418)",
            color: "var(--accent, #e08b3c)",
            fontSize: "0.8rem",
            margin: "0.5rem 0",
          }}
        >
          {this.state.error.message || String(this.state.error)}
        </pre>
        <div style={{ display: "flex", gap: "0.75rem" }}>
          <button
            onClick={() => window.location.reload()}
            style={{
              cursor: "pointer",
              padding: "0.5rem 1.1rem",
              borderRadius: "0.5rem",
              border: "none",
              fontWeight: 600,
              background: "var(--accent, #e08b3c)",
              color: "var(--accent-fg, #1a1206)",
            }}
          >
            Reload
          </button>
          <a
            href="https://github.com/ysalitrynskyi/keymano/issues"
            target="_blank"
            rel="noreferrer noopener"
            style={{
              padding: "0.5rem 1.1rem",
              borderRadius: "0.5rem",
              border: "1px solid var(--border, #4a3f2c)",
              color: "inherit",
              textDecoration: "none",
              fontWeight: 600,
            }}
          >
            Report an issue
          </a>
        </div>
      </div>
    );
  }
}
