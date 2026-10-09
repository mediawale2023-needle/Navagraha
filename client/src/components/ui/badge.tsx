import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

// Direction 3 chips: filled ink (supportive) or outlined ink (demanding), radius 6, 13px.
const badgeVariants = cva(
  "whitespace-nowrap inline-flex items-center rounded-chip border px-2 py-0.5 text-caption font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-ink bg-ink text-on-navy",
        secondary: "border-line bg-highlight text-ink",
        destructive: "border-negative bg-negative text-surface",
        outline: "border-[1.5px] border-ink bg-transparent text-ink",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants }
