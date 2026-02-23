import { ipcMain } from 'electron'
import { fileSystemManager } from '../services/FileSystemManager'
import { configManager } from '../services/ConfigManager'

export function registerFilesystemIpc(): void {
  ipcMain.handle(
    'filesystem:read-dir',
    async (_event, args: { projectId: string; dirPath: string }) => {
      const project = configManager.getProject(args.projectId)
      if (!project) throw new Error(`Unknown project: ${args.projectId}`)
      return fileSystemManager.readDir(args.dirPath, project.path)
    }
  )

  ipcMain.handle(
    'filesystem:read-file',
    async (_event, args: { projectId: string; filePath: string }) => {
      const project = configManager.getProject(args.projectId)
      if (!project) throw new Error(`Unknown project: ${args.projectId}`)
      return fileSystemManager.readFile(args.filePath, project.path)
    }
  )

  ipcMain.handle(
    'filesystem:watch-dir',
    async (_event, args: { projectId: string; dirPath: string }) => {
      const project = configManager.getProject(args.projectId)
      if (!project) throw new Error(`Unknown project: ${args.projectId}`)
      fileSystemManager.watchDir(args.dirPath)
      return { success: true }
    }
  )

  ipcMain.handle(
    'filesystem:unwatch-dir',
    async (_event, args: { projectId: string; dirPath: string }) => {
      fileSystemManager.unwatchDir(args.dirPath)
      return { success: true }
    }
  )
}
