"use client";

// The last boundary: a failure in the root layout itself.
//
// `app/error.tsx` catches anything thrown inside a route, but it renders *within* the root layout —
// so it cannot catch a throw from the layout, and neither can it catch one from the providers the
// layout mounts (`ThemeProvider`, `SubscriptionProvider`, `StockDetailProvider`). When one of those
// fails there is no tree left to render a boundary into, and without this file the reader gets a
// blank white page with no markup at all.
//
// Which is why this component renders its own `<html>` and `<body>`: it *replaces* the root layout
// rather than sitting inside it, and nothing the layout normally provides is available here.
// Concretely, that means:
//
//   * no fonts — the `next/font` variables are set on the layout's `<body>`, so this styles itself
//     with the system stack rather than referencing a variable that will not exist;
//   * no theme — the pre-hydration script that reads `localStorage` lives in the layout's `<head>`,
//     so the `dark:` variants cannot fire. The palette below is therefore chosen to be legible on
//     its own terms, with an explicit background rather than an inherited one;
//   * no Tailwind classes worth relying on either — the stylesheet is injected by the layout that
//     just failed. Everything here is inline styles for that reason, and only for that reason.
//
// It should effectively never render. That is not a reason to leave it out: the cost is one small
// static file, and the alternative failure mode is a blank page with no way back.

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px",
          background: "#f8fafc",
          color: "#0f172a",
          fontFamily:
            'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
        }}
      >
        <main
          style={{
            width: "100%",
            maxWidth: "480px",
            background: "#ffffff",
            border: "1px solid #e2e8f0",
            borderRadius: "24px",
            padding: "32px",
            boxShadow: "0 24px 80px -38px rgba(15,23,42,0.4)",
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: "12px",
              fontWeight: 700,
              letterSpacing: "0.3em",
              textTransform: "uppercase",
              color: "#e11d48",
            }}
          >
            Application error
          </p>
          <h1 style={{ margin: "12px 0 0", fontSize: "24px", lineHeight: 1.25, color: "#0f172a" }}>
            StockersAI could not start
          </h1>
          <p style={{ margin: "12px 0 0", fontSize: "14px", lineHeight: 1.6, color: "#475569" }}>
            Something failed before the page could be built. Reloading usually clears it. If it keeps
            happening, the reference below identifies this failure in our logs.
          </p>

          {error.digest && (
            <p
              style={{
                margin: "16px 0 0",
                padding: "8px 16px",
                borderRadius: "16px",
                background: "#f8fafc",
                border: "1px solid #e2e8f0",
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                fontSize: "12px",
                color: "#64748b",
              }}
            >
              Reference: {error.digest}
            </p>
          )}

          <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", marginTop: "24px" }}>
            <button
              type="button"
              onClick={reset}
              style={{
                border: "none",
                cursor: "pointer",
                borderRadius: "9999px",
                padding: "10px 20px",
                fontSize: "14px",
                fontWeight: 600,
                color: "#ffffff",
                background: "linear-gradient(to right, #059669, #0d9488)",
              }}
            >
              Try again
            </button>
            {/* A plain anchor, not next/link: the router is part of what may have failed. */}
            <a
              href="/"
              style={{
                borderRadius: "9999px",
                padding: "10px 20px",
                fontSize: "14px",
                fontWeight: 600,
                textDecoration: "none",
                color: "#334155",
                border: "1px solid #e2e8f0",
              }}
            >
              Back to the market
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}
