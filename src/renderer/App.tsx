import { useEffect, useCallback, Activity } from 'react'
import { useAppStore } from './stores/appStore'
import { useProjectSwitch, useProjectSession } from './hooks/useProjectSwitch'
import { useGitStatus } from './hooks/useGitStatus'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { switchProject } from './utils/switchProject'
import Sidebar from './components/Sidebar/Sidebar'
import WelcomeScreen from './components/Sidebar/WelcomeScreen'
import PanelLayout from './components/Layout/PanelLayout'
import ResizeHandle from './components/Layout/ResizeHandle'
import AgentPanel from './components/Panels/AgentPanel'
import TerminalPanel from './components/Panels/TerminalPanel'
import BrowserPanel from './components/Panels/BrowserPanel'
import PanelLoading from './components/Panels/PanelLoading'
import TitleBar from './components/StatusBar/TitleBar'
import type { Project, AgentId } from './types'

export default function App(): JSX.Element {
  const projects = useAppStore((s) => s.projects)
  const activeProjectId = useAppStore((s) => s.activeProjectId)
  const sidebarWidth = useAppStore((s) => s.sidebarWidth)
  const sidebarCollapsed = useAppStore((s) => s.sidebarCollapsed)

  // Project switching listener
  useProjectSwitch()

  // Git status listener
  useGitStatus()

  // Detect installed agents on startup
  useEffect(() => {
    window.api.invoke('agents:detect').then((agents) => {
      if (Array.isArray(agents) && agents.length > 0) {
        useAppStore.getState().setDetectedAgents(agents as AgentId[])
      }
    })
  }, [])

  // Load initial state from main process
  useEffect(() => {
    const loadState = async (): Promise<void> => {
      try {
        const settings = (await window.api.invoke('config:get-settings')) as {
          projects: Project[]
          activeProjectId: string | null
          projectOrder: string[]
          sidebarWidth: number
          sidebarCollapsed: boolean
          panelSplits: { vertical: number; horizontal: number }
          agentSessions?: Record<string, { activeAgent: string; activatedAgents: string[] }>
        } | null

        if (settings) {
          const store = useAppStore.getState()
          if (settings.projects) store.setProjects(settings.projects)
          if (settings.projectOrder) store.setProjectOrder(settings.projectOrder)
          if (settings.sidebarWidth) store.setSidebarWidth(settings.sidebarWidth)
          if (settings.sidebarCollapsed !== undefined) store.setSidebarCollapsed(settings.sidebarCollapsed)
          if (settings.panelSplits) {
            store.setPanelSplit('vertical', settings.panelSplits.vertical)
            store.setPanelSplit('horizontal', settings.panelSplits.horizontal)
          }
          if (settings.agentSessions) {
            store.loadAgentSessions(settings.agentSessions)
          }
          // Activate last active project
          if (settings.activeProjectId) {
            switchProject(settings.activeProjectId)
          }
        }
      } catch {
        // Settings not available yet
      }
    }
    loadState()
  }, [])

  // Handle sidebar resize
  const handleSidebarResize = useCallback(
    (delta: number) => {
      if (sidebarCollapsed) return
      const newWidth = Math.max(160, Math.min(400, sidebarWidth + delta))
      useAppStore.getState().setSidebarWidth(newWidth)
      window.api.invoke('config:update-settings', { sidebarWidth: newWidth })
    },
    [sidebarWidth, sidebarCollapsed]
  )

  // Handle add project
  const handleAddProject = useCallback(async () => {
    try {
      const result = (await window.api.invoke('app:open-folder-dialog')) as Project | null
      if (result) {
        useAppStore.getState().addProject(result)
        switchProject(result.id)
      }
    } catch {
      // User cancelled or error
    }
  }, [])

  // Keyboard shortcuts
  useKeyboardShortcuts({ onAddProject: handleAddProject })

  const hasProjects = projects.length > 0
  const effectiveSidebarWidth = sidebarCollapsed ? 0 : sidebarWidth

  return (
    <div className="flex flex-col h-full w-full bg-bg-primary">
      {/* Title bar with project info */}
      <TitleBar />

      {/* Main content area */}
      <div className="flex flex-row flex-1 min-h-0">
        {/* Sidebar */}
        {!sidebarCollapsed && (
          <div style={{ width: effectiveSidebarWidth }} className="flex-shrink-0 min-h-0">
            <Sidebar onAddProject={handleAddProject} />
          </div>
        )}

        {/* Sidebar resize handle */}
        {!sidebarCollapsed && (
          <ResizeHandle direction="horizontal" onResize={handleSidebarResize} />
        )}

        {/* Main panels or welcome screen */}
        {hasProjects ? (
          <div className="flex-1 min-h-0 min-w-0 relative">
            {projects.map((project) => (
              <Activity
                key={project.id}
                mode={project.id === activeProjectId ? 'visible' : 'hidden'}
              >
                <ProjectWorkspace project={project} />
              </Activity>
            ))}
          </div>
        ) : (
          <div className="flex-1 min-h-0">
            <WelcomeScreen onAddProject={handleAddProject} />
          </div>
        )}
      </div>
    </div>
  )
}

interface ProjectWorkspaceProps {
  project: Project
}

function ProjectWorkspace({ project }: ProjectWorkspaceProps): JSX.Element {
  const session = useProjectSession(project.id)

  // Terminal IDs
  const shellTerminalId = session?.shellTerminalId || `shell-${project.id}`

  if (!session?.isActivated) {
    return (
      <div className="absolute inset-0 flex items-center justify-center">
        <PanelLoading label={project.name} />
      </div>
    )
  }

  return (
    <div className="absolute inset-0">
      <PanelLayout
        claudePanel={
          <AgentPanel
            projectId={project.id}
            cwd={project.path}
            claudeArgs={project.claudeArgs}
          />
        }
        terminalPanel={
          <TerminalPanel
            terminalId={shellTerminalId}
            projectId={project.id}
            cwd={project.path}
            startCommand={project.startCommand}
          />
        }
        browserPanel={
          <BrowserPanel
            projectId={project.id}
            initialUrl={project.browserUrl}
          />
        }
      />
    </div>
  )
}
