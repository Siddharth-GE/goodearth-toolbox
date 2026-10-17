import { Spinner } from "./spinner";

/** The centered route-segment spinner every loading.tsx renders. `tall` is for full-screen kiosk routes (Marathon). */
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
