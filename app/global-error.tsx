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
      <head>
        {/* Follows the device only. This screen is reached when the root
            layout itself has thrown, so there is nothing left to read the
            theme cookie — and a white card on someone's dark phone was
            worse than not matching their exact choice. Values quoted from
            app/globals.css, which this file must not import. */}
        <style>{`
          :root { color-scheme: light dark; }
          body { background: #fafaf9; color: #1c1c1a; }
          .ge-muted { color: #6b6b66; }
          .ge-faint { color: #9a9a92; }
          .ge-button { background: #ffffff; border: 1px solid #e7e5e2; color: inherit; }
          @media (prefers-color-scheme: dark) {
            body { background: #121210; color: #f2f2ef; }
            .ge-muted { color: #9a9a92; }
            .ge-faint { color: #6b6b66; }
            .ge-button { background: #1a1a17; border-color: #2c2c28; }
          }
        `}</style>
      </head>
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
          <p className="ge-muted" style={{ marginTop: "0.5rem", fontSize: "0.875rem" }}>
            The Toolbox couldn&apos;t load. Trying again usually fixes it.
          </p>
          <button
            onClick={reset}
            className="ge-button"
            style={{
              marginTop: "1.25rem",
              padding: "0.6rem 1.2rem",
              borderRadius: "0.75rem",
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            Try again
          </button>
          {error.digest && (
            <p className="ge-faint" style={{ marginTop: "1rem", fontSize: "0.75rem" }}>
              Reference: <code>{error.digest}</code>
            </p>
          )}
        </div>
      </body>
    </html>
  );
}
