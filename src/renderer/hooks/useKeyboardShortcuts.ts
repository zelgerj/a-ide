import { useEffect } from 'react'
import { useAppStore } from '../stores/appStore'
import { switchProject } from '../utils/switchProject'
import type { PanelType } from '../types'

interface UseKeyboardShortcutsOptions {
  onAddProject: () => void
}

export function useKeyboardShortcuts({ onAddProject }: UseKeyboardShortcutsOptions): void {
  // Cmd+1-9: Switch to project by index
  useEffect(() => {
    const unsub = window.api.on('shortcut:project-switch', (payload: unknown) => {
      const { index } = payload as { index: number }
      const { projects, projectOrder } = useAppStore.getState()
      const orderedProjects = [...projects].sort((a, b) => {
        return projectOrder.indexOf(a.id) - projectOrder.indexOf(b.id)
      })
      if (index < orderedProjects.length) {
        const targetProject = orderedProjects[index]
        switchProject(targetProject.id)
      }
    })
    return unsub
  }, [])

  // Option+1/2/3: Focus panel
  useEffect(() => {
    const unsub = window.api.on('shortcut:panel-focus', (payload: unknown) => {
      const { panel } = payload as { panel: PanelType }
      useAppStore.getState().setFocusedPanel(panel)
    })
    return unsub
  }, [])

  // Cmd+B: Toggle sidebar
  useEffect(() => {
    const unsub = window.api.on('shortcut:toggle-sidebar', () => {
      useAppStore.getState().toggleSidebar()
    })
    return unsub
  }, [])

  // Option+F: Toggle maximize
  useEffect(() => {
    const unsub = window.api.on('shortcut:toggle-maximize', () => {
      useAppStore.getState().toggleMaximizedPanel()
    })
    return unsub
  }, [])

  // Cmd+Shift+R: Restart active agent session
  useEffect(() => {
    const unsub = window.api.on('shortcut:restart-claude', () => {
      const { activeProjectId, activeAgents, projects, clearTerminalExited } = useAppStore.getState()
      if (!activeProjectId) return
      const agentId = activeAgents.get(activeProjectId) || 'claude'
      const terminalId = `agent-${agentId}-${activeProjectId}`
      clearTerminalExited(terminalId)
      window.api.invoke('terminal:create', {
        terminalId,
        type: agentId,
        projectId: activeProjectId,
        cwd: projects.find((p) => p.id === activeProjectId)?.path || ''
      })
    })
    return unsub
  }, [])

  // Cmd+O: Open folder
  useEffect(() => {
    const unsub = window.api.on('shortcut:open-folder', () => {
      onAddProject()
    })
    return unsub
  }, [onAddProject])
}
