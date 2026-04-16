import * as React from "react"
import { cn } from "@/lib/utils"

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  autoResize?: boolean
  maxRows?: number
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ autoResize = false, className, maxRows = 6, onChange, style, ...props }, ref) => {
    const innerRef = React.useRef<HTMLTextAreaElement | null>(null)

    const setRefs = React.useCallback(
      (node: HTMLTextAreaElement | null) => {
        innerRef.current = node
        if (typeof ref === "function") {
          ref(node)
        } else if (ref) {
          ref.current = node
        }
      },
      [ref]
    )

    const resize = React.useCallback(() => {
      const element = innerRef.current
      if (!autoResize || !element) return

      element.style.height = "auto"

      const computed = window.getComputedStyle(element)
      const lineHeight = Number.parseFloat(computed.lineHeight) || 24
      const borderTop = Number.parseFloat(computed.borderTopWidth) || 0
      const borderBottom = Number.parseFloat(computed.borderBottomWidth) || 0
      const paddingTop = Number.parseFloat(computed.paddingTop) || 0
      const paddingBottom = Number.parseFloat(computed.paddingBottom) || 0
      const maxHeight = lineHeight * maxRows + paddingTop + paddingBottom + borderTop + borderBottom
      const nextHeight = Math.min(element.scrollHeight, maxHeight)

      element.style.height = `${nextHeight}px`
      element.style.overflowY = element.scrollHeight > maxHeight ? "auto" : "hidden"
    }, [autoResize, maxRows])

    React.useLayoutEffect(() => {
      resize()
    }, [resize, props.value])

    return (
      <textarea
        className={cn(
          "flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        onChange={(event) => {
          onChange?.(event)
          resize()
        }}
        ref={setRefs}
        style={{
          ...style,
          overflowY: autoResize ? "hidden" : style?.overflowY,
        }}
        {...props}
      />
    )
  }
)
Textarea.displayName = "Textarea"

export { Textarea }
