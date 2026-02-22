import { useEffect } from 'react'
import { useTerminal } from '../../hooks/useTerminal'
import { useAppStore } from '../../stores/appStore'
import PanelContainer from './PanelContainer'
import PanelExited from './PanelExited'

interface TerminalPanelProps {
  terminalId: string
  projectId: string
  cwd: string
  startCommand?: string
}

export default function TerminalPanel({
  terminalId,
  projectId,
  cwd,
  startCommand
}: TerminalPanelProps): JSX.Element {
  const focusedPanel = useAppStore((s) => s.focusedPanel)
  const setFocusedPanel = useAppStore((s) => s.setFocusedPanel)
  const exitedTerminals = useAppStore((s) => s.exitedTerminals)
  const clearTerminalExited = useAppStore((s) => s.clearTerminalExited)

  const { attachRef, terminal } = useTerminal({
    terminalId,
    type: 'shell',
    projectId,
    cwd,
    startCommand
  })

  const isExited = exitedTerminals.has(terminalId)

  // Focus terminal when panel is focused
  useEffect(() => {
    if (focusedPanel === 'terminal' && terminal.current) {
      terminal.current.focus()
    }
  }, [focusedPanel, terminal])

  const handleRestart = (): void => {
    clearTerminalExited(terminalId)
    window.api.invoke('terminal:restart', { terminalId })
  }

  return (
    <PanelContainer
      type="terminal"
      label="Terminal"
      isFocused={focusedPanel === 'terminal'}
      onFocus={() => setFocusedPanel('terminal')}
    >
      <div className="relative h-full w-full">
        <div ref={attachRef} className="h-full w-full" />
        {isExited && <PanelExited label="Terminal" onRestart={handleRestart} />}
      </div>
    </PanelContainer>
  )
}
