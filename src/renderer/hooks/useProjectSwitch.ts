import { useEffect, useCallback } from 'react'
import { useAppStore } from '../stores/appStore'
import type { ProjectSession } from '../types'

export function useProjectSwitch(): void {
  const setActiveProject = useAppStore((s) => s.setActiveProject)
  const setSession = useAppStore((s) => s.setSession)
  const updateSession = useAppStore((s) => s.updateSession)
  const setTerminalExited = useAppStore((s) => s.setTerminalExited)
  const setFocusedPanel = useAppStore((s) => s.setFocusedPanel)

  // Listen for session switch events from main process
  useEffect(() => {
    const unsub = window.api.on(
      'session:switched',
      (payload: unknown) => {
        const { projectId, session } = payload as {
          projectId: string
          session: ProjectSession
        }

        // Only update if it differs (debounce resolved to different project)
        if (useAppStore.getState().activeProjectId !== projectId) {
          setActiveProject(projectId)
        }
        setSession(projectId, session)

        // Re-trigger focus to the active panel after Activity transition settles
        requestAnimationFrame(() => {
          const focused = useAppStore.getState().focusedPanel
          setFocusedPanel(focused === 'browser' ? 'browser' : focused)
        })
      }
    )
    return unsub
  }, [setActiveProject, setSession, setFocusedPanel])

  // Listen for terminal exit events
  useEffect(() => {
    const unsub = window.api.on(
      'terminal:exit',
      (payload: unknown) => {
        const { terminalId } = payload as { terminalId: string; exitCode: number }
        setTerminalExited(terminalId)
      }
    )
    return unsub
  }, [setTerminalExited])
}

/**
 * Hook to get the session for a project, triggering activation if needed.
 */
export function useProjectSession(projectId: string | null): ProjectSession | null {
  const sessions = useAppStore((s) => s.sessions)

  if (!projectId) return null
  return sessions.get(projectId) || null
}
