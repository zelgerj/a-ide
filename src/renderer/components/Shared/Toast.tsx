import { useEffect, useState } from 'react'

interface ToastProps {
  message: string
  type?: 'info' | 'success' | 'error'
  duration?: number
  onDismiss: () => void
}

export default function Toast({
  message,
  type = 'info',
  duration = 3000,
  onDismiss
}: ToastProps): JSX.Element {
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    // Animate in
    requestAnimationFrame(() => setIsVisible(true))

    const timer = setTimeout(() => {
      setIsVisible(false)
      setTimeout(onDismiss, 200) // Wait for fade out animation
    }, duration)

    return () => clearTimeout(timer)
  }, [duration, onDismiss])

  const bgColor = {
    info: 'bg-bg-tertiary',
    success: 'bg-accent-green/20',
    error: 'bg-accent-red/20'
  }[type]

  const borderColor = {
    info: 'border-border-primary',
    success: 'border-accent-green/40',
    error: 'border-accent-red/40'
  }[type]

  return (
    <div
      className={`
        fixed bottom-12 left-4 z-50
        px-4 py-2.5 rounded-md border
        ${bgColor} ${borderColor}
        text-text-primary text-sm
        shadow-lg shadow-black/30
        transition-all duration-200
        ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'}
      `}
    >
      {message}
    </div>
  )
}
