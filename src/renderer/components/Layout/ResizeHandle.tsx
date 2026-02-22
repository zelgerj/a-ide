import { useCallback, useRef, useEffect } from 'react'

interface ResizeHandleProps {
  direction: 'horizontal' | 'vertical'
  onResize: (delta: number) => void
  onResizeStart?: () => void
  onResizeEnd?: () => void
}

export default function ResizeHandle({
  direction,
  onResize,
  onResizeStart,
  onResizeEnd
}: ResizeHandleProps): JSX.Element {
  const isDragging = useRef(false)
  const lastPos = useRef(0)

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      isDragging.current = true
      lastPos.current = direction === 'horizontal' ? e.clientX : e.clientY
      onResizeStart?.()
      document.body.style.cursor = direction === 'horizontal' ? 'col-resize' : 'row-resize'
      document.body.style.userSelect = 'none'
    },
    [direction, onResizeStart]
  )

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent): void => {
      if (!isDragging.current) return
      const currentPos = direction === 'horizontal' ? e.clientX : e.clientY
      const delta = currentPos - lastPos.current
      lastPos.current = currentPos
      onResize(delta)
    }

    const handleMouseUp = (): void => {
      if (!isDragging.current) return
      isDragging.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      onResizeEnd?.()
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [direction, onResize, onResizeEnd])

  const isHorizontal = direction === 'horizontal'

  return (
    <div
      onMouseDown={handleMouseDown}
      className={`
        relative flex-shrink-0 z-10
        ${isHorizontal ? 'w-[1px] cursor-col-resize' : 'h-[1px] cursor-row-resize'}
        bg-border-primary
        group
      `}
    >
      {/* Invisible hit target (16px wide) */}
      <div
        className={`
          absolute
          ${isHorizontal ? 'top-0 bottom-0 -left-[8px] w-[16px]' : 'left-0 right-0 -top-[8px] h-[16px]'}
        `}
      />
      {/* Visual hover indicator */}
      <div
        className={`
          absolute opacity-0 group-hover:opacity-100 transition-opacity duration-150
          bg-accent-blue
          ${isHorizontal ? 'top-0 bottom-0 -left-[1px] w-[3px]' : 'left-0 right-0 -top-[1px] h-[3px]'}
        `}
      />
    </div>
  )
}
