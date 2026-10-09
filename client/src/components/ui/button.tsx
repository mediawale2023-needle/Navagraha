import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

// Direction 3: primary amber, dark (pressed) ink, outline on line; flat, radius 8, 44px touch target.
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-amber text-ink border border-amber hover:border-frame",
        destructive: "bg-negative text-surface border border-negative hover:bg-negative/90",
        outline: "border border-line bg-transparent text-ink hover:bg-highlight",
        secondary: "bg-ink text-on-navy border border-ink hover:bg-ink/90",
        // Transparent border so toggling one on later does not shift layout.
        ghost: "border border-transparent text-ink hover:bg-highlight",
      },
      // Min heights so long labels can grow the button instead of overflowing it.
      size: {
        default: "min-h-11 px-[18px] text-base",
        sm: "min-h-10 px-3.5 text-sm",
        lg: "min-h-12 px-6 text-base",
        icon: "h-11 w-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  },
)
Button.displayName = "Button"

export { Button, buttonVariants }
