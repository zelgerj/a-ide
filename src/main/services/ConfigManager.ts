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
  lastBrowserUrl?: string
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
  private browserUrlSaveTimer: ReturnType<typeof setTimeout> | null = null

  constructor() {
    ensureConfigDir()
    this.load()
  }

  private loadJsonFile<T>(filePath: string, defaultValue: T): T {
    try {
      if (fs.existsSync(filePath)) {
        return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
      }
    } catch (err) {
      console.warn(`[ConfigManager] Failed to load ${filePath}:`, (err as Error).message)
    }
    return defaultValue
  }

  private load(): void {
    const windowData = this.loadJsonFile(paths.windowState, null)
    this.windowState = windowData ? { ...DEFAULT_WINDOW_STATE, ...windowData } : { ...DEFAULT_WINDOW_STATE }

    const globalData = this.loadJsonFile(paths.globalConfig, null)
    this.globalConfig = globalData ? { ...DEFAULT_GLOBAL_CONFIG, ...globalData } : { ...DEFAULT_GLOBAL_CONFIG }

    const projectsData = this.loadJsonFile<ProjectConfig[] | null>(paths.projectsConfig, null)
    this.projects.clear()
    if (projectsData) {
      for (const project of projectsData) {
        this.projects.set(project.id, project)
      }
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

  updateProjectBrowserUrl(projectId: string, url: string): void {
    // Don't persist internal pages
    if (!url || url === 'about:blank' || url.includes('browser-placeholder.html')) return

    const project = this.projects.get(projectId)
    if (!project || project.lastBrowserUrl === url) return

    project.lastBrowserUrl = url

    // Debounce disk write 500ms
    if (this.browserUrlSaveTimer) clearTimeout(this.browserUrlSaveTimer)
    this.browserUrlSaveTimer = setTimeout(() => {
      this.browserUrlSaveTimer = null
      this.saveProjects()
    }, 500)
  }

  saveSync(): void {
    // Flush pending browser URL save
    if (this.browserUrlSaveTimer) {
      clearTimeout(this.browserUrlSaveTimer)
      this.browserUrlSaveTimer = null
    }
    this.saveWindowState()
    this.saveGlobalConfig()
    this.saveProjects()
  }
}

export const configManager = new ConfigManager()
