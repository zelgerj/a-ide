import { BrowserWindow } from 'electron'
import simpleGit, { type SimpleGit, type StatusResult } from 'simple-git'
import fs from 'fs'
import path from 'path'

interface GitStatusInfo {
  branch: string
  ahead: number
  behind: number
  modified: number
  staged: number
  untracked: number
}

const POLL_INTERVAL = 5000 // 5 seconds

function statusChanged(a: GitStatusInfo, b: GitStatusInfo): boolean {
  return (
    a.branch !== b.branch ||
    a.ahead !== b.ahead ||
    a.behind !== b.behind ||
    a.modified !== b.modified ||
    a.staged !== b.staged ||
    a.untracked !== b.untracked
  )
}

class GitWatcher {
  private watchers: Map<string, ReturnType<typeof setInterval>> = new Map()
  private mainWindow: BrowserWindow | null = null
  private lastStatuses: Map<string, GitStatusInfo> = new Map()

  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window
  }

  watch(projectId: string, projectPath: string): void {
    // Stop existing watcher if any
    this.unwatch(projectId)

    // Verify it's a git repo
    const gitDir = path.join(projectPath, '.git')
    if (!fs.existsSync(gitDir)) return

    // Initial poll
    this.pollStatus(projectId, projectPath)

    // Start polling
    const interval = setInterval(() => {
      this.pollStatus(projectId, projectPath)
    }, POLL_INTERVAL)

    this.watchers.set(projectId, interval)
  }

  unwatch(projectId: string): void {
    const interval = this.watchers.get(projectId)
    if (interval) {
      clearInterval(interval)
      this.watchers.delete(projectId)
    }
    this.lastStatuses.delete(projectId)
  }

  unwatchAll(): void {
    for (const [projectId] of this.watchers) {
      this.unwatch(projectId)
    }
  }

  async getStatus(projectPath: string): Promise<GitStatusInfo | null> {
    try {
      const git: SimpleGit = simpleGit(projectPath, { timeout: { block: 10000 } })
      const status: StatusResult = await git.status()

      return {
        branch: status.current || 'HEAD',
        ahead: status.ahead,
        behind: status.behind,
        modified: status.modified.length + status.deleted.length + status.renamed.length,
        staged: status.staged.length,
        untracked: status.not_added.length
      }
    } catch {
      return null
    }
  }

  private async pollStatus(projectId: string, projectPath: string): Promise<void> {
    const status = await this.getStatus(projectPath)
    if (!status) return

    // Only send update if status changed
    const prev = this.lastStatuses.get(projectId)
    if (prev && !statusChanged(prev, status)) return
    this.lastStatuses.set(projectId, status)

    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('git:status-updated', { projectId, status })
    }
  }
}

export const gitWatcher = new GitWatcher()
