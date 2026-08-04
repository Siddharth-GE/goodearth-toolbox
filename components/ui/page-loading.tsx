import { Spinner } from "./spinner";

/**
 * The centered route-segment spinner every loading.tsx renders — one
 * component instead of sixteen hand-copied files that had already
 * drifted into three layouts. `tall` is for full-screen kiosk routes
 * (Marathon) that want the spinner nearer the middle of the viewport.
 */
export function PageLoading({ tall = false }: { tall?: boolean }) {
  // Two full literal class strings — Tailwind can't see composed names.
  return (
    <div
      className={
        tall
          ? "flex min-h-[60vh] items-center justify-center"
          : "flex min-h-[50vh] items-center justify-center"
      }
    >
      <Spinner />
    </div>
  );
}
