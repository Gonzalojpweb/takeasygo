import * as React from "react"
import { cn } from "@/lib/utils"

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, onFocus, ...props }, ref) => {
    const inputRef = React.useRef<HTMLInputElement>(null)
    const hadFocus = React.useRef(false)

    const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
      if (type === "number" && !hadFocus.current) {
        e.target.select()
      }
      hadFocus.current = true
      onFocus?.(e)
    }

    const handleBlur = () => {
      hadFocus.current = false
    }

    React.useImperativeHandle(ref, () => inputRef.current!)

    return (
      <input
        type={type}
        className={cn(
          "flex h-10 w-full rounded-xl border-2 border-border/60 bg-muted/40 px-4 py-2 text-sm font-medium ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground/50 focus-visible:outline-none focus-visible:border-primary/40 focus-visible:ring-2 focus-visible:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-50 transition-all",
          className
        )}
        ref={inputRef}
        onFocus={handleFocus}
        onBlur={handleBlur}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
