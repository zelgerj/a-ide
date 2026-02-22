import { useAppStore } from '../stores/appStore'

export function switchProject(projectId: string): void {
  const state = useAppStore.getState()
  if (projectId === state.activeProjectId) return

  // Pre-populate session so ProjectWorkspace never shows a spinner
  if (!state.sessions.has(projectId)) {
    state.setSession(projectId, {
      projectId,
      claudeTerminalId: `claude-${projectId}`,
      shellTerminalId: `shell-${projectId}`,
      isActivated: true,
      isLoading: false
    })
  }

  // Fire-and-forget: hide other browser views
  window.api.invoke('browser:hide-except', projectId)

  // Update UI immediately — Activity transition happens synchronously
  state.setActiveProject(projectId)

  // Fire-and-forget: session activation in main process.
  // The session:switched event will confirm/correct store state.
  window.api.invoke('session:switch', projectId)
}
