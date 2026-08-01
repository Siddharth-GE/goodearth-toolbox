import { cn } from "@/lib/utils";

/**
 * The one way an error or a confirmation is shown next to a control.
 *
 * The string `text-xs font-medium text-danger` appeared in more than
 * twenty files, none of which announced anything to a screen reader — so
 * a blind user submitting a form got no feedback at all when it failed.
 *
 * `role` is the point of this component, not the colour. An error is
 * `role="alert"` (announced immediately, because the user is blocked); a
 * success is `role="status"` (announced politely, because they aren't).
 *
 * Renders nothing when there's no message, so callers can write
 * `<FormMessage error={state?.error} />` without a conditional.
 */
export function FormMessage({
  error,
  success,
  size = "sm",
  className,
}: {
  error?: string | null;
  success?: string | null;
  size?: "xs" | "sm";
  className?: string;
}) {
  const message = error ?? success;
  if (!message) return null;

  return (
    <p
      role={error ? "alert" : "status"}
      className={cn(
        "font-medium",
        size === "xs" ? "text-xs" : "text-sm",
        error ? "text-danger" : "text-success",
        className,
      )}
    >
      {message}
    </p>
  );
}
