import { cn } from "@/lib/utils"
import { ComponentPropsWithoutRef } from "react"

interface AnimatedGradientTextProps extends ComponentPropsWithoutRef<"span"> {}

export function AnimatedGradientText({ className, children, ...props }: AnimatedGradientTextProps) {
  return (
    <span
      className={cn(
        "bg-gradient-to-r from-[#ffaa40] via-[#9c40ff] to-[#ffaa40] bg-[length:200%_auto] animate-gradient bg-clip-text text-transparent",
        className
      )}
      {...props}
    >
      {children}
    </span>
  )
}
