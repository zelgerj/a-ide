import { BrowserWindow } from 'electron'
import { terminalManager } from './TerminalManager'
import { browserManager } from './BrowserManager'
import { gitWatcher } from './GitWatcher'
import { fileSystemManager } from './FileSystemManager'
import { configManager } from './ConfigManager'
import { v4 as uuidv4 } from 'uuid'

interface ProjectSession {
  projectId: string
  claudeTerminalId: string
  shellTerminalId: string
  isActivated: boolean
}

class SessionManager {
  private sessions: Map<string, ProjectSession> = new Map()
  private activeProjectId: string | null = null
  private mainWindow: BrowserWindow | null = null
  private pendingSwitchId: string | null = null

  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window
  }

  getActiveProjectId(): string | null {
    return this.activeProjectId
  }

  getSession(projectId: string): ProjectSession | undefined {
    return this.sessions.get(projectId)
  }

  async switchToProject(projectId: string): Promise<ProjectSession> {
    // NO hideAll() here — the renderer already called browser:hide-except

    const switchId = uuidv4()
    this.pendingSwitchId = switchId

    const existingSession = this.sessions.get(projectId)

    // Fast path: already-activated projects skip debounce entirely
    if (!existingSession?.isActivated) {
      // Reduced debounce for new activations
      await new Promise((resolve) => setTimeout(resolve, 20))
      if (this.pendingSwitchId !== switchId) {
        throw new Error('Switch cancelled by newer request')
      }
    } else {
      // Still check for cancellation (no delay)
      if (this.pendingSwitchId !== switchId) {
        throw new Error('Switch cancelled by newer request')
      }
    }

    this.activeProjectId = projectId

    // Update config
    configManager.updateGlobalConfig({ activeProjectId: projectId })

    // Get or create session
    let session = this.sessions.get(projectId)
    if (!session) {
      session = {
        projectId,
        claudeTerminalId: `claude-${projectId}`,
        shellTerminalId: `shell-${projectId}`,
        isActivated: false
      }
      this.sessions.set(projectId, session)
    }

    // Activate session if not yet activated
    // Note: PTY creation is handled by the renderer (useTerminal hook) to ensure
    // the IPC data listener is set up before the PTY starts producing output.
    if (!session.isActivated) {
      const project = configManager.getProject(projectId)
      if (project) {
        // Create browser view if URL configured
        const browserUrl = project.lastBrowserUrl || project.browserUrl
        if (browserUrl) {
          browserManager.create(projectId, browserUrl)
        }

        // Start git watcher
        gitWatcher.watch(projectId, project.path)

        // Start file system watcher
        fileSystemManager.watchProject(projectId, project.path)

        session.isActivated = true
        this.sessions.set(projectId, session)
      }
    }

    // Show this project's browser view if one exists.
    // Check for view existence (not just browserUrl) since views can be
    // created on-demand by Playwright via CDP.
    if (browserManager.getView(projectId)) {
      browserManager.show(projectId)
    }

    // Notify renderer
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('session:switched', {
        projectId,
        session: {
          projectId: session.projectId,
          claudeTerminalId: session.claudeTerminalId,
          shellTerminalId: session.shellTerminalId,
          isActivated: session.isActivated,
          isLoading: false
        }
      })
    }

    return session
  }

  removeProject(projectId: string): void {
    const session = this.sessions.get(projectId)
    if (session) {
      terminalManager.killByProject(projectId)
      browserManager.destroy(projectId)
      gitWatcher.unwatch(projectId)
      fileSystemManager.unwatchProject(projectId)
      this.sessions.delete(projectId)
    }

    if (this.activeProjectId === projectId) {
      const globalConfig = configManager.getGlobalConfig()
      this.activeProjectId = globalConfig.activeProjectId
    }
  }

  destroyAll(): void {
    for (const [projectId] of this.sessions) {
      terminalManager.killByProject(projectId)
    }
    fileSystemManager.unwatchAll()
    this.sessions.clear()
    this.activeProjectId = null
  }
}

export const sessionManager = new SessionManager()
