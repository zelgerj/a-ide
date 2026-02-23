import { BrowserWindow } from 'electron'
import fs from 'fs'
import path from 'path'

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
const DEBOUNCE_MS = 300

class FileSystemManager {
  private mainWindow: BrowserWindow | null = null
  private watchers: Map<string, fs.FSWatcher> = new Map()
  private debounceTimers: Map<string, ReturnType<typeof setTimeout>> = new Map()

  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window
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

  watchDir(dirPath: string): void {
    // Don't duplicate watchers
    if (this.watchers.has(dirPath)) return

    try {
      const watcher = fs.watch(dirPath, () => {
        // Debounce change events
        const existing = this.debounceTimers.get(dirPath)
        if (existing) clearTimeout(existing)

        this.debounceTimers.set(
          dirPath,
          setTimeout(() => {
            this.debounceTimers.delete(dirPath)
            if (this.mainWindow && !this.mainWindow.isDestroyed()) {
              this.mainWindow.webContents.send('filesystem:dir-changed', { dirPath })
            }
          }, DEBOUNCE_MS)
        )
      })

      watcher.on('error', () => {
        this.unwatchDir(dirPath)
      })

      this.watchers.set(dirPath, watcher)
    } catch {
      // Directory may not exist or be inaccessible
    }
  }

  unwatchDir(dirPath: string): void {
    const watcher = this.watchers.get(dirPath)
    if (watcher) {
      watcher.close()
      this.watchers.delete(dirPath)
    }
    const timer = this.debounceTimers.get(dirPath)
    if (timer) {
      clearTimeout(timer)
      this.debounceTimers.delete(dirPath)
    }
  }

  unwatchAll(): void {
    for (const [dirPath] of this.watchers) {
      this.unwatchDir(dirPath)
    }
  }
}

export const fileSystemManager = new FileSystemManager()
