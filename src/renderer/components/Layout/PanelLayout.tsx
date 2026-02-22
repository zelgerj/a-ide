import { useCallback, useRef } from 'react'
import { useAppStore } from '../../stores/appStore'
import ResizeHandle from './ResizeHandle'

interface PanelLayoutProps {
  claudePanel: React.ReactNode
  terminalPanel: React.ReactNode
  browserPanel: React.ReactNode
}

export default function PanelLayout({
  claudePanel,
  terminalPanel,
  browserPanel
}: PanelLayoutProps): JSX.Element {
  const panelSplits = useAppStore((s) => s.panelSplits)
  const maximizedPanel = useAppStore((s) => s.maximizedPanel)
  const setPanelSplit = useAppStore((s) => s.setPanelSplit)

  const containerRef = useRef<HTMLDivElement>(null)

  // Persist splits to config on resize end
  const handleResizeEnd = useCallback(() => {
    const splits = useAppStore.getState().panelSplits
    window.api.invoke('config:update-settings', {
      panelSplits: splits
    })
  }, [])

  // Handle horizontal resize (left panels vs browser)
  const handleHorizontalResize = useCallback(
    (delta: number) => {
      const container = containerRef.current
      if (!container) return
      const totalWidth = container.clientWidth
      if (totalWidth === 0) return
      const newRatio = panelSplits.horizontal + delta / totalWidth
      setPanelSplit('horizontal', Math.max(0.25, Math.min(0.85, newRatio)))
    },
    [panelSplits.horizontal, setPanelSplit]
  )

  // Handle vertical resize (claude vs terminal)
  const handleVerticalResize = useCallback(
    (delta: number) => {
      const container = containerRef.current
      if (!container) return
      const totalHeight = container.clientHeight
      if (totalHeight === 0) return
      const newRatio = panelSplits.vertical + delta / totalHeight
      setPanelSplit('vertical', Math.max(0.15, Math.min(0.85, newRatio)))
    },
    [panelSplits.vertical, setPanelSplit]
  )

  // Maximized panel mode
  if (maximizedPanel) {
    const panelMap = {
      claude: claudePanel,
      terminal: terminalPanel,
      browser: browserPanel
    }
    return (
      <div ref={containerRef} className="h-full w-full min-h-0 min-w-0">
        {panelMap[maximizedPanel]}
      </div>
    )
  }

  const leftWidthPercent = panelSplits.horizontal * 100
  const rightWidthPercent = (1 - panelSplits.horizontal) * 100
  const topHeightPercent = panelSplits.vertical * 100
  const bottomHeightPercent = (1 - panelSplits.vertical) * 100

  return (
    <div ref={containerRef} className="flex flex-row h-full w-full min-h-0 min-w-0">
      {/* Left column: Claude (top) + Terminal (bottom) */}
      <div
        className="flex flex-col h-full min-h-0 min-w-0"
        style={{ width: `${leftWidthPercent}%` }}
      >
        {/* Claude panel */}
        <div className="min-h-0 min-w-0 overflow-hidden" style={{ height: `${topHeightPercent}%` }}>
          {claudePanel}
        </div>

        {/* Vertical resize handle */}
        <ResizeHandle direction="vertical" onResize={handleVerticalResize} onResizeEnd={handleResizeEnd} />

        {/* Terminal panel */}
        <div className="min-h-0 min-w-0 overflow-hidden" style={{ height: `${bottomHeightPercent}%` }}>
          {terminalPanel}
        </div>
      </div>

      {/* Horizontal resize handle */}
      <ResizeHandle direction="horizontal" onResize={handleHorizontalResize} onResizeEnd={handleResizeEnd} />

      {/* Right column: Browser */}
      <div
        className="h-full min-h-0 min-w-0 overflow-hidden"
        style={{ width: `${rightWidthPercent}%` }}
      >
        {browserPanel}
      </div>
    </div>
  )
}
