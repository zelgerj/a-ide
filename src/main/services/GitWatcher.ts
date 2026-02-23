import { BrowserWindow } from 'electron'
import simpleGit, { type SimpleGit, type StatusResult } from 'simple-git'
import fs from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'

interface GitStatusInfo {
  branch: string
  ahead: number
  behind: number
  modified: number
  staged: number
  untracked: number
}

export interface ChangedFile {
  path: string        // Relative path to project root
  absolutePath: string
  name: string        // File name
  status: 'modified' | 'added' | 'deleted' | 'untracked' | 'renamed'
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
  private lastChangedFiles: Map<string, ChangedFile[]> = new Map()
  private projectPaths: Map<string, string> = new Map()

  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window
  }

  watch(projectId: string, projectPath: string): void {
    // Stop existing watcher if any
    this.unwatch(projectId)

    // Verify it's a git repo
    const gitDir = path.join(projectPath, '.git')
    if (!existsSync(gitDir)) return

    this.projectPaths.set(projectId, projectPath)

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
    this.lastChangedFiles.delete(projectId)
    this.projectPaths.delete(projectId)
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

  async getChangedFiles(projectPath: string): Promise<ChangedFile[]> {
    try {
      const git: SimpleGit = simpleGit(projectPath, { timeout: { block: 10000 } })
      const status: StatusResult = await git.status()
      const files: ChangedFile[] = []

      for (const filePath of status.modified) {
        files.push({
          path: filePath,
          absolutePath: path.join(projectPath, filePath),
          name: path.basename(filePath),
          status: 'modified'
        })
      }

      for (const filePath of status.not_added) {
        files.push({
          path: filePath,
          absolutePath: path.join(projectPath, filePath),
          name: path.basename(filePath),
          status: 'untracked'
        })
      }

      for (const filePath of status.deleted) {
        files.push({
          path: filePath,
          absolutePath: path.join(projectPath, filePath),
          name: path.basename(filePath),
          status: 'deleted'
        })
      }

      for (const filePath of status.created) {
        files.push({
          path: filePath,
          absolutePath: path.join(projectPath, filePath),
          name: path.basename(filePath),
          status: 'added'
        })
      }

      for (const rename of status.renamed) {
        files.push({
          path: rename.to,
          absolutePath: path.join(projectPath, rename.to),
          name: path.basename(rename.to),
          status: 'renamed'
        })
      }

      return files
    } catch {
      return []
    }
  }

  async getFileDiff(
    projectPath: string,
    filePath: string
  ): Promise<{ oldContent: string; newContent: string } | null> {
    try {
      const git: SimpleGit = simpleGit(projectPath, { timeout: { block: 10000 } })
      const status: StatusResult = await git.status()
      const relativePath = path.isAbsolute(filePath)
        ? path.relative(projectPath, filePath)
        : filePath
      const absolutePath = path.isAbsolute(filePath)
        ? filePath
        : path.join(projectPath, filePath)

      const isDeleted = status.deleted.includes(relativePath)
      const isUntracked = status.not_added.includes(relativePath)
      const isCreated = status.created.includes(relativePath)

      let oldContent = ''
      let newContent = ''

      if (isDeleted) {
        oldContent = await git.show([`HEAD:${relativePath}`])
        newContent = ''
      } else if (isUntracked || isCreated) {
        oldContent = ''
        newContent = await fs.readFile(absolutePath, 'utf-8')
      } else {
        // Modified or renamed
        try {
          oldContent = await git.show([`HEAD:${relativePath}`])
        } catch {
          oldContent = ''
        }
        newContent = await fs.readFile(absolutePath, 'utf-8')
      }

      return { oldContent, newContent }
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

      // Also send changed files list when counts change
      const changedFiles = await this.getChangedFiles(projectPath)
      this.lastChangedFiles.set(projectId, changedFiles)
      this.mainWindow.webContents.send('git:changed-files-updated', { projectId, files: changedFiles })
    }
  }
}

export const gitWatcher = new GitWatcher()
