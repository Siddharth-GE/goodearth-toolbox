import { Spinner } from "./spinner";

/** The centered route-segment spinner every loading.tsx renders. */
export function PageLoading() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <Spinner />
    </div>
  );
}
