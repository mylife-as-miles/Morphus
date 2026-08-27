"use client"

import { Switch as SwitchPrimitive } from "@base-ui/react/switch"

import { cn } from "../../lib/utils"

function Switch({
  className,
  size = "default",
  ...props
}: SwitchPrimitive.Root.Props & {
  size?: "sm" | "default"
}) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      data-size={size}
      className={cn(
        "peer group/switch relative inline-flex shrink-0 items-center rounded-full border border-white/10 bg-white/[0.05] p-[2px] shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_8px_20px_rgba(0,0,0,0.12)] backdrop-blur-md transition-[background-color,border-color,box-shadow,transform] duration-200 [transition-timing-function:var(--ease-out-strong)] outline-none after:absolute after:-inset-x-3 after:-inset-y-2 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 data-[size=default]:h-6 data-[size=default]:w-11 data-[size=sm]:h-5 data-[size=sm]:w-9 data-checked:border-emerald-300/32 data-checked:bg-[linear-gradient(180deg,rgba(52,211,153,0.86),rgba(5,150,105,0.74))] data-checked:shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_0_0_1px_rgba(16,185,129,0.14),0_0_24px_rgba(16,185,129,0.18)] data-unchecked:bg-white/[0.08] data-disabled:cursor-not-allowed data-disabled:opacity-50",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="pointer-events-none block rounded-full bg-[linear-gradient(180deg,#f8fdfb,#d9f7ec)] ring-0 shadow-[0_2px_10px_rgba(4,8,7,0.35)] transition-transform duration-200 [transition-timing-function:var(--ease-out-strong)] group-data-[size=default]/switch:size-5 group-data-[size=sm]/switch:size-4 group-data-[size=default]/switch:data-checked:translate-x-5 group-data-[size=sm]/switch:data-checked:translate-x-4 group-data-[size=default]/switch:data-unchecked:translate-x-0 group-data-[size=sm]/switch:data-unchecked:translate-x-0"
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
