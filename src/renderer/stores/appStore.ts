import { create } from 'zustand'
import type { Project, PanelType, PanelSplits, GitStatus, ProjectSession, AgentId } from '../types'

interface AppState {
  // Projects
  projects: Project[]
  activeProjectId: string | null
  projectOrder: string[]
  sessions: Map<string, ProjectSession>

  // Agents
  detectedAgents: AgentId[]
  activeAgents: Map<string, AgentId> // projectId → active agent tab
  activatedAgentsPerProject: Map<string, AgentId[]> // projectId → agents that were started

  // Layout
  sidebarWidth: number
  sidebarCollapsed: boolean
  panelSplits: PanelSplits
  focusedPanel: PanelType
  maximizedPanel: PanelType | null

  // Git
  gitStatuses: Map<string, GitStatus>

  // Terminal exit states
  exitedTerminals: Set<string>

  // Actions - Projects
  setProjects: (projects: Project[]) => void
  addProject: (project: Project) => void
  removeProject: (id: string) => void
  setActiveProject: (id: string | null) => void
  setProjectOrder: (order: string[]) => void

  // Actions - Sessions
  setSession: (projectId: string, session: ProjectSession) => void
  updateSession: (projectId: string, update: Partial<ProjectSession>) => void

  // Actions - Agents
  setDetectedAgents: (agents: AgentId[]) => void
  setActiveAgent: (projectId: string, agentId: AgentId) => void
  setActivatedAgents: (projectId: string, agents: AgentId[]) => void
  loadAgentSessions: (sessions: Record<string, { activeAgent: string; activatedAgents: string[] }>) => void

  // Actions - Layout
  setSidebarWidth: (width: number) => void
  setSidebarCollapsed: (collapsed: boolean) => void
  toggleSidebar: () => void
  setPanelSplit: (axis: 'vertical' | 'horizontal', value: number) => void
  setFocusedPanel: (panel: PanelType) => void
  setMaximizedPanel: (panel: PanelType | null) => void
  toggleMaximizedPanel: () => void

  // Actions - Git
  setGitStatus: (projectId: string, status: GitStatus) => void

  // Actions - Terminal exits
  setTerminalExited: (terminalId: string) => void
  clearTerminalExited: (terminalId: string) => void
}

export const useAppStore = create<AppState>((set, get) => ({
  // Initial state
  projects: [],
  activeProjectId: null,
  projectOrder: [],
  sessions: new Map(),
  detectedAgents: ['claude'],
  activeAgents: new Map(),
  activatedAgentsPerProject: new Map(),
  sidebarWidth: 220,
  sidebarCollapsed: false,
  panelSplits: { vertical: 0.66, horizontal: 0.6 },
  focusedPanel: 'claude',
  maximizedPanel: null,
  gitStatuses: new Map(),
  exitedTerminals: new Set(),

  // Project actions
  setProjects: (projects) => set({ projects }),

  addProject: (project) =>
    set((state) => ({
      projects: [...state.projects, project],
      projectOrder: [...state.projectOrder, project.id]
    })),

  removeProject: (id) =>
    set((state) => {
      const projects = state.projects.filter((p) => p.id !== id)
      const projectOrder = state.projectOrder.filter((pid) => pid !== id)
      const sessions = new Map(state.sessions)
      sessions.delete(id)
      const gitStatuses = new Map(state.gitStatuses)
      gitStatuses.delete(id)
      const activeAgents = new Map(state.activeAgents)
      activeAgents.delete(id)
      const activatedAgentsPerProject = new Map(state.activatedAgentsPerProject)
      activatedAgentsPerProject.delete(id)
      const activeProjectId =
        state.activeProjectId === id ? projectOrder[0] || null : state.activeProjectId
      return { projects, projectOrder, sessions, gitStatuses, activeAgents, activatedAgentsPerProject, activeProjectId }
    }),

  setActiveProject: (id) => set({ activeProjectId: id }),

  setProjectOrder: (order) => set({ projectOrder: order }),

  // Session actions
  setSession: (projectId, session) =>
    set((state) => {
      // Skip update if session data is unchanged — avoids unnecessary re-renders
      // that can cascade through Activity components on project switch
      const existing = state.sessions.get(projectId)
      if (
        existing &&
        existing.projectId === session.projectId &&
        existing.claudeTerminalId === session.claudeTerminalId &&
        existing.shellTerminalId === session.shellTerminalId &&
        existing.isActivated === session.isActivated
      ) {
        return {}
      }
      const sessions = new Map(state.sessions)
      sessions.set(projectId, session)
      return { sessions }
    }),

  updateSession: (projectId, update) =>
    set((state) => {
      const sessions = new Map(state.sessions)
      const existing = sessions.get(projectId)
      if (existing) {
        sessions.set(projectId, { ...existing, ...update })
      }
      return { sessions }
    }),

  // Agent actions
  setDetectedAgents: (agents) => set({ detectedAgents: agents }),

  setActiveAgent: (projectId, agentId) =>
    set((state) => {
      const activeAgents = new Map(state.activeAgents)
      activeAgents.set(projectId, agentId)
      return { activeAgents }
    }),

  setActivatedAgents: (projectId, agents) =>
    set((state) => {
      const activatedAgentsPerProject = new Map(state.activatedAgentsPerProject)
      activatedAgentsPerProject.set(projectId, agents)
      return { activatedAgentsPerProject }
    }),

  loadAgentSessions: (sessions) =>
    set(() => {
      const activeAgents = new Map<string, AgentId>()
      const activatedAgentsPerProject = new Map<string, AgentId[]>()
      for (const [projectId, state] of Object.entries(sessions)) {
        activeAgents.set(projectId, state.activeAgent as AgentId)
        activatedAgentsPerProject.set(projectId, state.activatedAgents as AgentId[])
      }
      return { activeAgents, activatedAgentsPerProject }
    }),

  // Layout actions
  setSidebarWidth: (width) => set({ sidebarWidth: width }),

  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),

  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),

  setPanelSplit: (axis, value) =>
    set((state) => ({
      panelSplits: { ...state.panelSplits, [axis]: value }
    })),

  setFocusedPanel: (panel) => set({ focusedPanel: panel }),

  setMaximizedPanel: (panel) => set({ maximizedPanel: panel }),

  toggleMaximizedPanel: () =>
    set((state) => ({
      maximizedPanel: state.maximizedPanel ? null : state.focusedPanel
    })),

  // Git actions
  setGitStatus: (projectId, status) =>
    set((state) => {
      const gitStatuses = new Map(state.gitStatuses)
      gitStatuses.set(projectId, status)
      return { gitStatuses }
    }),

  // Terminal exit actions
  setTerminalExited: (terminalId) =>
    set((state) => {
      const exitedTerminals = new Set(state.exitedTerminals)
      exitedTerminals.add(terminalId)
      return { exitedTerminals }
    }),

  clearTerminalExited: (terminalId) =>
    set((state) => {
      const exitedTerminals = new Set(state.exitedTerminals)
      exitedTerminals.delete(terminalId)
      return { exitedTerminals }
    })
}))
