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
          :root { color-scheme: light; }
          body { background: #f0eeea; color: #180b0f; }
          .ge-muted { color: #6b6563; }
          .ge-faint { color: #8a8381; }
          .ge-button { background: #521323; border: 1px solid #521323; color: #ffffff; }
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
          <h1 style={{ fontFamily: "Georgia, serif", fontSize: "1.75rem", fontWeight: 500 }}>
            Something went wrong
          </h1>
          <p className="ge-muted" style={{ marginTop: "0.5rem", fontSize: "0.875rem" }}>
            The Toolbox couldn&apos;t load. Trying again usually fixes it.
          </p>
          <button
            onClick={reset}
            className="ge-button"
            style={{
              marginTop: "1.25rem",
              padding: "0.6rem 1.2rem",
              borderRadius: "2px",
              cursor: "pointer",
              fontWeight: 500,
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
