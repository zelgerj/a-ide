import { useEffect, useCallback, useRef, useState } from 'react'
import { useAppStore } from '../../stores/appStore'
import BrowserUrlBar from './BrowserUrlBar'

interface BrowserPanelProps {
  projectId: string
  initialUrl?: string
}

export default function BrowserPanel({
  projectId,
  initialUrl
}: BrowserPanelProps): JSX.Element {
  const focusedPanel = useAppStore((s) => s.focusedPanel)

  const [url, setUrl] = useState(initialUrl || '')

  // Hide internal URLs from the URL bar
  const isInternalUrl = (u: string): boolean =>
    !u || u === 'about:blank' || u.includes('browser-placeholder.html')
  const displayUrl = isInternalUrl(url) ? '' : url
  const [title, setTitle] = useState('')
  const [loading, setLoading] = useState(false)

  const containerRef = useRef<HTMLDivElement>(null)
  const boundsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Send browser bounds to main process
  // Electron's setBounds() uses logical (CSS) pixels, not physical pixels
  const updateBounds = useCallback(() => {
    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    window.api.invoke('browser:set-bounds', {
      projectId,
      bounds: {
        x: Math.round(rect.left),
        y: Math.round(rect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      }
    })
  }, [projectId])

  // Listen for browser events
  useEffect(() => {
    const cleanups: (() => void)[] = []

    cleanups.push(
      window.api.on('browser:url-changed', (payload: unknown) => {
        const data = payload as { projectId: string; url: string }
        if (data.projectId === projectId) {
          setUrl(data.url)
        }
      })
    )

    cleanups.push(
      window.api.on('browser:title-changed', (payload: unknown) => {
        const data = payload as { projectId: string; title: string }
        if (data.projectId === projectId) {
          setTitle(data.title)
        }
      })
    )

    cleanups.push(
      window.api.on('browser:loading-changed', (payload: unknown) => {
        const data = payload as { projectId: string; loading: boolean }
        if (data.projectId === projectId) {
          setLoading(data.loading)
        }
      })
    )

    return () => {
      cleanups.forEach((fn) => fn())
    }
  }, [projectId])

  // Observe container size changes to update WebContentsView bounds
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    // Send bounds synchronously — don't defer to rAF.
    // The DOM is already laid out when this effect runs (React committed it),
    // so getBoundingClientRect() returns correct values. Sending immediately
    // minimizes the gap between show() marking the view eligible and
    // setBounds() making it actually visible.
    updateBounds()

    const ro = new ResizeObserver(() => {
      // Debounce bounds updates during resize
      if (boundsTimerRef.current) clearTimeout(boundsTimerRef.current)
      boundsTimerRef.current = setTimeout(updateBounds, 16)
    })
    ro.observe(container)

    // Also update on window resize
    window.addEventListener('resize', updateBounds)

    return () => {
      ro.disconnect()
      window.removeEventListener('resize', updateBounds)
      if (boundsTimerRef.current) clearTimeout(boundsTimerRef.current)
      // Hide the WebContentsView when this panel is hidden (Activity transition)
      window.api.invoke('browser:set-bounds', {
        projectId,
        bounds: { x: 0, y: 0, width: 0, height: 0 }
      })
    }
  }, [projectId, updateBounds])

  const handleNavigate = useCallback(
    (newUrl: string) => {
      window.api.invoke('browser:navigate', { projectId, url: newUrl }).then(() => {
        // Re-send bounds in case a new WebContentsView was just created on demand
        updateBounds()
      })
    },
    [projectId, updateBounds]
  )

  const handleBack = useCallback(() => {
    window.api.invoke('browser:go-back', { projectId })
  }, [projectId])

  const handleForward = useCallback(() => {
    window.api.invoke('browser:go-forward', { projectId })
  }, [projectId])

  const handleReload = useCallback(() => {
    window.api.invoke('browser:reload', { projectId })
  }, [projectId])

  const handleToggleDevTools = useCallback(() => {
    window.api.invoke('browser:toggle-devtools', { projectId })
  }, [projectId])

  const isFocused = focusedPanel === 'browser'

  return (
    <div
      className="flex flex-col h-full w-full min-h-0 min-w-0 overflow-hidden"
      onMouseDown={() => useAppStore.getState().setFocusedPanel('browser')}
    >
      <BrowserUrlBar
        url={displayUrl}
        loading={loading}
        title={title}
        isFocused={isFocused}
        onNavigate={handleNavigate}
        onBack={handleBack}
        onForward={handleForward}
        onReload={handleReload}
        onToggleDevTools={handleToggleDevTools}
      />
      {/* Container for WebContentsView overlay */}
      <div ref={containerRef} className="flex-1 min-h-0 relative bg-bg-primary" />
    </div>
  )
}
