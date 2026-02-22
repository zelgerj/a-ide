import { terminalManager } from './TerminalManager'
import { sessionManager } from './SessionManager'

/**
 * Lifecycle management for all project processes.
 * Handles graceful shutdown on quit and cleanup on project removal.
 */
class ProcessManager {
  /**
   * Gracefully shut down all processes.
   * Called during app quit.
   */
  shutdownAll(): void {
    terminalManager.killAll()
    sessionManager.destroyAll()
  }

  /**
   * Clean up all processes for a specific project.
   */
  cleanupProject(projectId: string): void {
    sessionManager.removeProject(projectId)
  }
}

export const processManager = new ProcessManager()
