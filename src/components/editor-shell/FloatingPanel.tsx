import { forwardRef, type ComponentProps } from "react";
import { cn } from "@/lib/utils";

export const FloatingPanel = forwardRef<HTMLDivElement, ComponentProps<"div">>(
  function FloatingPanel({ className, ...props }, ref) {
    return (
      <div
        className={cn(
          "glass-panel pointer-events-auto rounded-[22px]",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
