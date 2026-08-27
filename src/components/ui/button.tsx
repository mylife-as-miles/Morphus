import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "../../lib/utils"

const buttonVariants = cva(
  "group/button relative inline-flex shrink-0 items-center justify-center rounded-xl border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap outline-none select-none transition-[transform,background-color,border-color,color,box-shadow,opacity] duration-200 [transition-timing-function:var(--ease-out-strong)] will-change-transform focus-visible:ring-2 focus-visible:ring-emerald-400/22 hover:-translate-y-px active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 disabled:hover:translate-y-0 disabled:active:scale-100 motion-reduce:hover:translate-y-0 motion-reduce:active:scale-100 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "border-emerald-300/18 bg-[linear-gradient(180deg,rgba(52,211,153,0.24),rgba(6,95,70,0.34))] text-primary-foreground shadow-[0_18px_36px_rgba(6,46,38,0.24),inset_0_1px_0_rgba(255,255,255,0.14)] hover:border-emerald-200/28 hover:bg-[linear-gradient(180deg,rgba(52,211,153,0.3),rgba(6,78,59,0.42))]",
        outline:
          "border-white/10 bg-white/[0.045] text-foreground/78 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] hover:border-white/16 hover:bg-white/[0.08] hover:text-foreground aria-expanded:border-white/16 aria-expanded:bg-white/[0.08]",
        secondary:
          "border-white/8 bg-white/[0.03] text-secondary-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] hover:border-white/14 hover:bg-white/[0.07]",
        ghost:
          "border-white/0 bg-transparent text-foreground/60 shadow-none hover:border-white/10 hover:bg-white/[0.06] hover:text-foreground aria-expanded:border-white/10 aria-expanded:bg-white/[0.06]",
        destructive:
          "border-destructive/18 bg-destructive/12 text-destructive hover:border-destructive/28 hover:bg-destructive/20 focus-visible:ring-destructive/20",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default:
          "h-8 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        xs: "h-6 gap-1 rounded-[min(var(--radius-md),10px)] px-2 text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-9 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3",
        icon: "size-8",
        "icon-xs":
          "size-6 rounded-[min(var(--radius-md),10px)] in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3",
        "icon-sm":
          "size-7 rounded-[min(var(--radius-md),12px)] in-data-[slot=button-group]:rounded-lg",
        "icon-lg": "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
