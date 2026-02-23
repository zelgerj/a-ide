import { BrowserWindow } from 'electron'
import fs from 'fs'
import path from 'path'
import * as watcher from '@parcel/watcher'

export interface DirEntry {
  name: string
  path: string
  isDirectory: boolean
  size: number
  modifiedAt: number
}

export interface FileContent {
  content: string
  binary: boolean
  truncated: boolean
  size: number
  mimeType?: string
}

export interface FileChangeEvent {
  projectId: string
  changes: Array<{ path: string; type: 'create' | 'update' | 'delete' }>
  affectedDirs: string[]
}

const IGNORED_NAMES = new Set([
  '.git',
  'node_modules',
  '.DS_Store',
  '__pycache__',
  'dist',
  'out',
  'build',
  '.next',
  '.cache',
  '.turbo',
  '.parcel-cache',
  '.venv',
  '.env',
  'Thumbs.db'
])

// Directories to ignore for @parcel/watcher (recursive watching)
const IGNORE_DIRS = [
  '.git',
  'node_modules',
  '__pycache__',
  '.next',
  '.cache',
  '.turbo',
  '.parcel-cache',
  '.venv'
]

const IMAGE_EXTENSIONS: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon'
}

const MAX_TEXT_SIZE = 2 * 1024 * 1024 // 2MB
const MAX_IMAGE_SIZE = 10 * 1024 * 1024 // 10MB

class FileSystemManager {
  private mainWindow: BrowserWindow | null = null
  private subscriptions: Map<string, watcher.AsyncSubscription> = new Map()
  private changeListeners: Array<(projectId: string) => void> = []

  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window
  }

  onProjectChange(listener: (projectId: string) => void): void {
    this.changeListeners.push(listener)
  }

  private validatePath(requestedPath: string, projectRoot: string): void {
    const resolved = path.resolve(requestedPath)
    const resolvedRoot = path.resolve(projectRoot)
    if (!resolved.startsWith(resolvedRoot + path.sep) && resolved !== resolvedRoot) {
      throw new Error('Path traversal not allowed')
    }
  }

  async readDir(dirPath: string, projectRoot: string): Promise<DirEntry[]> {
    this.validatePath(dirPath, projectRoot)

    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true })
    const results: DirEntry[] = []

    for (const entry of entries) {
      if (IGNORED_NAMES.has(entry.name) || entry.name.startsWith('.')) continue

      const fullPath = path.join(dirPath, entry.name)
      try {
        const stat = await fs.promises.stat(fullPath)
        results.push({
          name: entry.name,
          path: fullPath,
          isDirectory: entry.isDirectory(),
          size: entry.isDirectory() ? 0 : stat.size,
          modifiedAt: stat.mtimeMs
        })
      } catch {
        // Skip entries we can't stat (broken symlinks, permission errors)
      }
    }

    // Sort: directories first, then alphabetical (case-insensitive)
    results.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    })

    return results
  }

  async readFile(filePath: string, projectRoot: string): Promise<FileContent> {
    this.validatePath(filePath, projectRoot)

    const stat = await fs.promises.stat(filePath)
    const ext = path.extname(filePath).toLowerCase()
    const isImage = ext in IMAGE_EXTENSIONS
    const maxSize = isImage ? MAX_IMAGE_SIZE : MAX_TEXT_SIZE

    if (stat.size > maxSize) {
      return {
        content: '',
        binary: false,
        truncated: true,
        size: stat.size
      }
    }

    const buffer = await fs.promises.readFile(filePath)

    // Check if binary by looking for null bytes in first 8KB
    if (!isImage) {
      const sample = buffer.subarray(0, Math.min(8192, buffer.length))
      const isBinary = sample.includes(0)
      if (isBinary) {
        return {
          content: '',
          binary: true,
          truncated: false,
          size: stat.size
        }
      }
    }

    if (isImage) {
      return {
        content: buffer.toString('base64'),
        binary: true,
        truncated: false,
        size: stat.size,
        mimeType: IMAGE_EXTENSIONS[ext]
      }
    }

    return {
      content: buffer.toString('utf-8'),
      binary: false,
      truncated: false,
      size: stat.size
    }
  }

  async watchProject(projectId: string, projectPath: string): Promise<void> {
    // Don't duplicate subscriptions
    if (this.subscriptions.has(projectId)) return

    try {
      const subscription = await watcher.subscribe(
        projectPath,
        (err, events) => {
          if (err) {
            console.warn('[FileSystemManager] Watcher error for', projectId, err)
            return
          }

          const changes = events.map((event) => ({
            path: event.path,
            type: event.type
          }))

          // Compute affected dirs (unique parent directories)
          const affectedDirSet = new Set<string>()
          for (const event of events) {
            affectedDirSet.add(path.dirname(event.path))
          }
          const affectedDirs = Array.from(affectedDirSet)

          // Send to renderer
          if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.webContents.send('filesystem:files-changed', {
              projectId,
              changes,
              affectedDirs
            })
          }

          // Notify internal listeners (e.g. GitWatcher)
          for (const listener of this.changeListeners) {
            listener(projectId)
          }
        },
        {
          ignore: IGNORE_DIRS
        }
      )

      this.subscriptions.set(projectId, subscription)
    } catch (err) {
      console.warn('[FileSystemManager] Failed to watch project', projectId, err)
    }
  }

  async unwatchProject(projectId: string): Promise<void> {
    const subscription = this.subscriptions.get(projectId)
    if (subscription) {
      await subscription.unsubscribe()
      this.subscriptions.delete(projectId)
    }
  }

  async unwatchAll(): Promise<void> {
    const promises: Promise<void>[] = []
    for (const [projectId] of this.subscriptions) {
      promises.push(this.unwatchProject(projectId))
    }
    await Promise.all(promises)
  }
}

export const fileSystemManager = new FileSystemManager()
