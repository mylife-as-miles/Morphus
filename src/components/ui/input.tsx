import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"

import { cn } from "../../lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "h-9 w-full min-w-0 rounded-xl border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.02)_34%,rgba(255,255,255,0.03)_100%)] px-3 py-2 text-base text-foreground/86 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_10px_24px_rgba(0,0,0,0.08)] backdrop-blur-md transition-[background-color,border-color,box-shadow,color] duration-200 [transition-timing-function:var(--ease-out-strong)] outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground/76 hover:border-white/12 hover:bg-white/[0.06] focus-visible:border-emerald-300/22 focus-visible:ring-3 focus-visible:ring-emerald-400/12 focus-visible:shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_0_0_1px_rgba(110,231,183,0.06),0_18px_40px_rgba(4,18,15,0.18)] disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-white/[0.03] disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm",
        className
      )}
      {...props}
    />
  )
}

export { Input }
