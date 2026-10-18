import { cn } from "@/lib/utils";

/**
 * The one way an error or confirmation is shown next to a control. `role` is the point: an error is `role="alert"` (the user is blocked),
 * a success is `role="status"`. Renders nothing when there is no message.
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
