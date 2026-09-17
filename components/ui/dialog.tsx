"use client";

import { cn } from "@/lib/utils";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ComponentProps, HTMLAttributes } from "react";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export function DialogContent({
  className,
  children,
  ...props
}: ComponentProps<typeof DialogPrimitive.Content>) {
  return (
    <DialogPrimitive.Portal>
      {/* Radix keeps both of these mounted for the length of the exit
          animation and flips data-state to "closed", so the -out
          animations run without any extra code here. */}
      <DialogPrimitive.Overlay className="data-[state=closed]:animate-fade-out data-[state=open]:animate-fade-in fixed inset-0 z-50 bg-black/30 backdrop-blur-sm" />
      <DialogPrimitive.Content
        className={cn(
          // Centred card on a laptop; on a phone (max-sm) the same dialog
          // becomes a bottom sheet that rises from the edge and scrolls,
          // so a long form keeps its Cancel and Save reachable.
          "border-border/60 bg-surface-raised shadow-float data-[state=closed]:animate-pop-out data-[state=open]:animate-pop-in fixed top-1/2 left-1/2 z-50 w-[calc(100%-2.5rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-3xl border p-6 focus:outline-none",
          "max-sm:data-[state=closed]:animate-sheet-out max-sm:data-[state=open]:animate-sheet-in max-sm:inset-x-0 max-sm:top-auto max-sm:bottom-0 max-sm:max-h-[90dvh] max-sm:w-full max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:overflow-y-auto max-sm:rounded-b-none",
          className,
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close className="text-muted focus-visible:ring-accent hover:bg-foreground/[0.05] absolute top-4 right-4 rounded-lg p-1 focus-visible:ring-2 focus-visible:outline-none">
          <X className="size-4" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function DialogHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("mb-4 space-y-1", className)} {...props} />;
}

export function DialogTitle({ className, ...props }: ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      className={cn("text-foreground text-lg font-semibold tracking-tight", className)}
      {...props}
    />
  );
}

export function DialogDescription({
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Description>) {
  return <DialogPrimitive.Description className={cn("text-muted text-sm", className)} {...props} />;
}

export function DialogFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("mt-5 flex justify-end gap-2", className)} {...props} />;
}
