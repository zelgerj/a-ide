import { useEffect, useCallback } from 'react'
import { useAppStore } from '../stores/appStore'
import { switchProject } from '../utils/switchProject'
import type { PanelType } from '../types'

interface UseKeyboardShortcutsOptions {
  onAddProject: () => void
}

export function useKeyboardShortcuts({ onAddProject }: UseKeyboardShortcutsOptions): void {
  const projects = useAppStore((s) => s.projects)
  const projectOrder = useAppStore((s) => s.projectOrder)
  const activeProjectId = useAppStore((s) => s.activeProjectId)
  const sessions = useAppStore((s) => s.sessions)
  const activeAgents = useAppStore((s) => s.activeAgents)
  const setFocusedPanel = useAppStore((s) => s.setFocusedPanel)
  const toggleSidebar = useAppStore((s) => s.toggleSidebar)
  const toggleMaximizedPanel = useAppStore((s) => s.toggleMaximizedPanel)
  const clearTerminalExited = useAppStore((s) => s.clearTerminalExited)

  // Cmd+1-9: Switch to project by index
  useEffect(() => {
    const unsub = window.api.on('shortcut:project-switch', (payload: unknown) => {
      const { index } = payload as { index: number }
      const orderedProjects = [...projects].sort((a, b) => {
        return projectOrder.indexOf(a.id) - projectOrder.indexOf(b.id)
      })
      if (index < orderedProjects.length) {
        const targetProject = orderedProjects[index]
        switchProject(targetProject.id)
      }
    })
    return unsub
  }, [projects, projectOrder])

  // Option+1/2/3: Focus panel
  useEffect(() => {
    const unsub = window.api.on('shortcut:panel-focus', (payload: unknown) => {
      const { panel } = payload as { panel: PanelType }
      setFocusedPanel(panel)
    })
    return unsub
  }, [setFocusedPanel])

  // Cmd+B: Toggle sidebar
  useEffect(() => {
    const unsub = window.api.on('shortcut:toggle-sidebar', () => {
      toggleSidebar()
    })
    return unsub
  }, [toggleSidebar])

  // Option+F: Toggle maximize
  useEffect(() => {
    const unsub = window.api.on('shortcut:toggle-maximize', () => {
      toggleMaximizedPanel()
    })
    return unsub
  }, [toggleMaximizedPanel])

  // Cmd+Shift+R: Restart active agent session
  useEffect(() => {
    const unsub = window.api.on('shortcut:restart-claude', () => {
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
  }, [activeProjectId, activeAgents, projects, clearTerminalExited])

  // Cmd+O: Open folder
  useEffect(() => {
    const unsub = window.api.on('shortcut:open-folder', () => {
      onAddProject()
    })
    return unsub
  }, [onAddProject])
}
