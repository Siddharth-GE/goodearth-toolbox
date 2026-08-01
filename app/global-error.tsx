"use client";

/**
 * The boundary of last resort: only reached when the ROOT layout itself
 * throws, which is why it must render its own <html> and <body> — the
 * normal shell no longer exists at that point. Kept dependency-free
 * (inline styles, no components) because anything it imported could be
 * the very thing that crashed.
 */
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
          display: "flex",
          minHeight: "100vh",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, sans-serif",
          textAlign: "center",
          padding: "2rem",
        }}
      >
        <div>
          <h1 style={{ fontSize: "1.125rem", fontWeight: 700 }}>Something went wrong</h1>
          <p style={{ color: "#666", marginTop: "0.5rem", fontSize: "0.875rem" }}>
            The Toolbox couldn&apos;t load. Trying again usually fixes it.
          </p>
          <button
            onClick={reset}
            style={{
              marginTop: "1.25rem",
              padding: "0.6rem 1.2rem",
              borderRadius: "0.75rem",
              border: "1px solid #ccc",
              background: "#fff",
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            Try again
          </button>
          {error.digest && (
            <p style={{ color: "#999", marginTop: "1rem", fontSize: "0.75rem" }}>
              Reference: <code>{error.digest}</code>
            </p>
          )}
        </div>
      </body>
    </html>
  );
}
