import fs from 'fs'
import { paths, ensureConfigDir } from '../utils/paths'

export interface WindowState {
  x?: number
  y?: number
  width: number
  height: number
  isMaximized: boolean
}

export interface ProjectConfig {
  id: string
  name: string
  path: string
  browserUrl?: string
  startCommand?: string
  claudeArgs?: string[]
  addedAt: number
}

export interface AgentSessionState {
  activeAgent: string
  activatedAgents: string[]
}

export interface GlobalConfig {
  sidebarWidth: number
  sidebarCollapsed: boolean
  panelSplits: {
    vertical: number    // Claude vs Terminal split (0-1)
    horizontal: number  // Left panels vs Browser split (0-1)
  }
  activeProjectId: string | null
  projectOrder: string[]
  agentSessions?: Record<string, AgentSessionState> // projectId → agent state
}

const DEFAULT_WINDOW_STATE: WindowState = {
  width: 1400,
  height: 900,
  isMaximized: false
}

const DEFAULT_GLOBAL_CONFIG: GlobalConfig = {
  sidebarWidth: 220,
  sidebarCollapsed: false,
  panelSplits: {
    vertical: 0.5,
    horizontal: 0.6
  },
  activeProjectId: null,
  projectOrder: []
}

class ConfigManager {
  private windowState: WindowState = { ...DEFAULT_WINDOW_STATE }
  private globalConfig: GlobalConfig = { ...DEFAULT_GLOBAL_CONFIG }
  private projects: Map<string, ProjectConfig> = new Map()

  constructor() {
    ensureConfigDir()
    this.load()
  }

  private load(): void {
    try {
      if (fs.existsSync(paths.windowState)) {
        const data = JSON.parse(fs.readFileSync(paths.windowState, 'utf-8'))
        this.windowState = { ...DEFAULT_WINDOW_STATE, ...data }
      }
    } catch {
      this.windowState = { ...DEFAULT_WINDOW_STATE }
    }

    try {
      if (fs.existsSync(paths.globalConfig)) {
        const data = JSON.parse(fs.readFileSync(paths.globalConfig, 'utf-8'))
        this.globalConfig = { ...DEFAULT_GLOBAL_CONFIG, ...data }
      }
    } catch {
      this.globalConfig = { ...DEFAULT_GLOBAL_CONFIG }
    }

    try {
      if (fs.existsSync(paths.projectsConfig)) {
        const data: ProjectConfig[] = JSON.parse(fs.readFileSync(paths.projectsConfig, 'utf-8'))
        for (const project of data) {
          this.projects.set(project.id, project)
        }
      }
    } catch {
      this.projects.clear()
    }
  }

  getWindowState(): WindowState {
    return { ...this.windowState }
  }

  setWindowState(state: Partial<WindowState>): void {
    this.windowState = { ...this.windowState, ...state }
    this.saveWindowState()
  }

  getGlobalConfig(): GlobalConfig {
    return { ...this.globalConfig }
  }

  updateGlobalConfig(update: Partial<GlobalConfig>): void {
    this.globalConfig = { ...this.globalConfig, ...update }
    this.saveGlobalConfig()
  }

  getProjects(): ProjectConfig[] {
    return Array.from(this.projects.values())
  }

  getProject(id: string): ProjectConfig | undefined {
    return this.projects.get(id)
  }

  addProject(project: ProjectConfig): void {
    this.projects.set(project.id, project)
    if (!this.globalConfig.projectOrder.includes(project.id)) {
      this.globalConfig.projectOrder.push(project.id)
    }
    this.saveProjects()
    this.saveGlobalConfig()
  }

  removeProject(id: string): void {
    this.projects.delete(id)
    this.globalConfig.projectOrder = this.globalConfig.projectOrder.filter(pid => pid !== id)
    if (this.globalConfig.activeProjectId === id) {
      this.globalConfig.activeProjectId = this.globalConfig.projectOrder[0] || null
    }
    this.saveProjects()
    this.saveGlobalConfig()
  }

  reorderProjects(order: string[]): void {
    this.globalConfig.projectOrder = order
    this.saveGlobalConfig()
  }

  private saveWindowState(): void {
    try {
      fs.writeFileSync(paths.windowState, JSON.stringify(this.windowState, null, 2))
    } catch { /* ignore write errors */ }
  }

  private saveGlobalConfig(): void {
    try {
      fs.writeFileSync(paths.globalConfig, JSON.stringify(this.globalConfig, null, 2))
    } catch { /* ignore write errors */ }
  }

  private saveProjects(): void {
    try {
      fs.writeFileSync(paths.projectsConfig, JSON.stringify(Array.from(this.projects.values()), null, 2))
    } catch { /* ignore write errors */ }
  }

  saveSync(): void {
    this.saveWindowState()
    this.saveGlobalConfig()
    this.saveProjects()
  }
}

export const configManager = new ConfigManager()
